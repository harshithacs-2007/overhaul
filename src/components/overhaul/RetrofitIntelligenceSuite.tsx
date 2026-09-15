"use client";

import { useEffect, useMemo, useState } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";

 type Scope = "building" | "facility" | "equipment";
 type Values = Record<string, number | string | null | undefined>;
 type Extraction = {
   evidenceId?: string;
   sourceName?: string;
   sourceKind?: string;
   observations?: Array<{
     field: string;
     value: string;
     numericValue: number | null;
     unit: string | null;
     confidence: number;
     sourceText?: string;
     notes?: string;
   }>;
 };
 type Climate = { temperature?: number; humidity?: number; min?: number; max?: number; location?: string } | null;
 type ModelState = { available: boolean; name?: string; dataset?: string; r2?: number; mae?: number; warning?: string };

 function canonical(field: string) {
   return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
 }
 function num(values: Values, ...keys: string[]) {
   for (const key of keys) {
     const value = Number(values[key]);
     if (Number.isFinite(value) && value >= 0) return value;
   }
   return null;
 }
 function fmt(value: number | null | undefined, digits = 1) {
   return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: digits });
 }
 function money(value: number | null | undefined) {
   return value == null || !Number.isFinite(value) ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`;
 }
 function readJson<T>(key: string, fallback: T): T {
   try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
 }

 function parseDelimited(text: string) {
   const lines = text.split(/\r?\n/).filter((line) => line.trim());
   if (lines.length < 2) return null;
   const delimiter = lines[0].includes("\t") ? "\t" : ",";
   const split = (line: string) => line.split(delimiter).map((part) => part.trim().replace(/^"|"$/g, ""));
   const headers = split(lines[0]);
   const rows = lines.slice(1, Math.min(lines.length, 5001)).map(split);
   return { headers, rows };
 }
 function detectSeries(headers: string[], rows: string[][], names: RegExp) {
   const index = headers.findIndex((header) => names.test(header.toLowerCase()));
   if (index < 0) return null;
   const values = rows.map((row) => Number(row[index])).filter((value) => Number.isFinite(value));
   return values.length ? { header: headers[index], values } : null;
 }

 function equipmentBaseline(values: Values) {
   const load = num(values, "load_kw");
   const capacity = num(values, "capacity_kw");
   const efficiency = num(values, "efficiency", "cop");
   const hours = num(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
   if (load == null || capacity == null || efficiency == null || hours == null) return null;
   return { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: num(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh") ?? 0 };
 }
 function buildingBaseline(values: Values, outdoorOverride?: number) {
   const floorAreaM2 = num(values, "floor_area_m2", "floor_area");
   const ua = num(values, "envelope_ua_w_per_k", "envelope_ua");
   const outdoor = outdoorOverride ?? num(values, "outdoor_temp_c", "design_outdoor_temp_c");
   const indoor = num(values, "indoor_temp_c", "temperature_c");
   const capacity = num(values, "capacity_kw");
   const cop = num(values, "efficiency", "cop");
   const hours = num(values, "annual_cooling_hours", "cooling_hours");
   if (floorAreaM2 == null || ua == null || outdoor == null || indoor == null || capacity == null || cop == null || hours == null) return null;
   return {
     floorAreaM2,
     envelopeUA_W_per_K: ua,
     ventilationM3s: num(values, "ventilation_m3s") ?? 0,
     outdoorTempC: outdoor,
     indoorTempC: indoor,
     solarGainKW: num(values, "solar_gain_kw") ?? 0,
     internalGainKW: num(values, "internal_gain_kw") ?? 0,
     hvacCapacityKW: capacity,
     hvacCOP: cop,
     annualCoolingHours: hours,
     electricityRateINRPerKWh: num(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh") ?? 0,
   };
 }

 export default function RetrofitIntelligenceSuite({ scope, values, extracts, climate }: { scope: Scope; values: Values; extracts: Extraction[]; climate: Climate }) {
   const [model, setModel] = useState<ModelState>({ available: false });
   const [verification, setVerification] = useState<{ name: string; baseline: number | null; post: number | null; unit: string; count: number } | null>(null);
   const [verificationBusy, setVerificationBusy] = useState(false);
   const [bundleTarget, setBundleTarget] = useState("");
   const [bundleCost, setBundleCost] = useState("");

   useEffect(() => {
     let cancelled = false;
     Promise.all([
       fetch("/models/rescast_surrogate.json").then((r) => r.ok ? r.json() : null).catch(() => null),
       fetch("/models/rescast_timeseries_surrogate.json").then((r) => r.ok ? r.json() : null).catch(() => null),
     ]).then(([staticModel, seriesModel]) => {
       if (cancelled) return;
       const candidate = seriesModel?.available ? seriesModel : staticModel;
       if (candidate?.available) {
         setModel({ available: true, name: candidate.model ?? candidate.name ?? "Screening surrogate", dataset: candidate.trainingDataset ?? candidate.dataset, r2: Number.isFinite(candidate.metrics?.test_r2) ? candidate.metrics.test_r2 : (Number.isFinite(candidate.test_r2) ? candidate.test_r2 : undefined), mae: Number.isFinite(candidate.metrics?.test_mae) ? candidate.metrics.test_mae : (Number.isFinite(candidate.test_mae) ? candidate.test_mae : undefined) });
       } else {
         setModel({ available: false, warning: "No validated local artifact is loaded. Train/export the screening artifact before using learned forecasts." });
       }
     });
     return () => { cancelled = true; };
   }, []);

   const conflicts = useMemo(() => {
     const byField = new Map<string, Array<{ source: string; value: number; unit: string | null }>>();
     for (const extraction of extracts) {
       for (const observation of extraction.observations || []) {
         if (observation.numericValue == null || !Number.isFinite(observation.numericValue)) continue;
         const key = canonical(observation.field);
         const bucket = byField.get(key) || [];
         bucket.push({ source: extraction.sourceName || extraction.evidenceId || "Evidence", value: observation.numericValue, unit: observation.unit });
         byField.set(key, bucket);
       }
     }
     return [...byField.entries()].filter(([, items]) => {
       const values = [...new Set(items.map((item) => item.value))];
       return values.length > 1;
     }).slice(0, 8).map(([field, items]) => ({ field, items }));
   }, [extracts]);

   const measurementGaps = useMemo(() => {
     const missing: Array<{ title: string; why: string; field: string }> = [];
     if (scope === "equipment") {
       if (num(values, "load_kw") == null) missing.push({ title: "Operating load", why: "Separates actual duty from nameplate capacity.", field: "load_kw" });
       if (num(values, "annual_hours", "runtime_hours") == null) missing.push({ title: "Annual runtime", why: "Converts instantaneous power into annual energy.", field: "annual_hours" });
       if (num(values, "efficiency", "cop") == null) missing.push({ title: "Efficiency / COP", why: "Defines the baseline electrical relationship.", field: "efficiency" });
       if (num(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh") == null) missing.push({ title: "Electricity tariff", why: "Required only for monetary savings and payback.", field: "electricity_rate_inr_per_kwh" });
     } else {
       if (num(values, "envelope_ua_w_per_k", "envelope_ua") == null) missing.push({ title: "Envelope UA", why: "Required to quantify conductive envelope heat transfer.", field: "envelope_ua_w_per_k" });
       if (num(values, "outdoor_temp_c", "design_outdoor_temp_c") == null) missing.push({ title: "Design outdoor condition", why: "Defines the explicit thermal boundary.", field: "outdoor_temp_c" });
       if (num(values, "capacity_kw") == null) missing.push({ title: "HVAC capacity", why: "Checks load against installed capacity.", field: "capacity_kw" });
       if (num(values, "efficiency", "cop") == null) missing.push({ title: "HVAC COP", why: "Converts cooling load into electrical power.", field: "cop" });
       if (num(values, "annual_cooling_hours", "cooling_hours") == null) missing.push({ title: "Annual cooling hours", why: "Converts power into annual energy.", field: "annual_cooling_hours" });
     }
     return missing.slice(0, 5);
   }, [scope, values]);

   const bundles = useMemo(() => {
     const target = Number(bundleTarget);
     const cost = Number(bundleCost);
     if (!Number.isFinite(target) || target <= 0) return [];
     if (scope === "equipment") {
       const base = equipmentBaseline(values);
       if (!base) return [];
       const currentEfficiency = base.efficiency;
       const currentHours = base.annualHours;
       const efficiencyCase = simulatePhysicsScenario({ subject: "equipment", baseline: base, retrofit: { efficiency: target } });
       const runtimeTarget = Number(values.proposed_runtime_hours);
       const runtimeCase = Number.isFinite(runtimeTarget) && runtimeTarget >= 0 && runtimeTarget !== currentHours
         ? simulatePhysicsScenario({ subject: "equipment", baseline: base, retrofit: { annualHours: runtimeTarget } }) : null;
       const combo = Number.isFinite(runtimeTarget) && runtimeTarget >= 0 && runtimeTarget !== currentHours
         ? simulatePhysicsScenario({ subject: "equipment", baseline: base, retrofit: { efficiency: target, annualHours: runtimeTarget } }) : null;
       return [
         { name: "Efficiency only", result: efficiencyCase, note: `${fmt(currentEfficiency, 3)} → ${fmt(target, 3)}` },
         ...(runtimeCase ? [{ name: "Runtime only", result: runtimeCase, note: `${fmt(currentHours, 0)} → ${fmt(runtimeTarget, 0)} h/yr` }] : []),
         ...(combo ? [{ name: "Combined bundle", result: combo, note: "Efficiency + runtime modeled together; no additive double-counting." }] : []),
       ].map((item) => ({ ...item, payback: Number.isFinite(cost) && cost > 0 && item.result.delta.annualSavingINR > 0 && base.electricityRateINRPerKWh > 0 ? cost / item.result.delta.annualSavingINR : null }));
     }
     const base = buildingBaseline(values);
     const proposedR = num(values, "proposed_r_value_m2k_w");
     const envelopeArea = num(values, "envelope_area_m2");
     const proposedHVAC = num(values, "proposed_efficiency", "proposed_cop");
     if (!base) return [];
     const items: Array<{ name: string; result: ReturnType<typeof simulatePhysicsScenario>; note: string }> = [];
     if (envelopeArea != null && proposedR != null && proposedR > 0) items.push({ name: "Envelope + HVAC bundle", result: simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline: base, retrofit: { envelopeUA_W_per_K: envelopeArea / proposedR, ...(proposedHVAC != null ? { hvacCOP: proposedHVAC } : {}) } }), note: proposedHVAC != null ? "Envelope + HVAC efficiency jointly rerun." : "Envelope rerun; HVAC target not supplied." });
     else if (proposedHVAC != null) items.push({ name: "HVAC efficiency pathway", result: simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline: base, retrofit: { hvacCOP: proposedHVAC } }), note: "Thermal load held to the evidence-defined baseline." });
     return items.map((item) => ({ ...item, payback: Number.isFinite(cost) && cost > 0 && item.result.delta.annualSavingINR > 0 && base.electricityRateINRPerKWh > 0 ? cost / item.result.delta.annualSavingINR : null }));
   }, [bundleCost, bundleTarget, scope, values]);

   const ingestVerification = async (file: File) => {
     setVerificationBusy(true);
     try {
       const text = await file.text();
       const parsed = parseDelimited(text);
       if (!parsed) throw new Error("Need a CSV or TSV with a header row and data rows.");
       const power = detectSeries(parsed.headers, parsed.rows, /(power|kw|electric)/);
       const energy = detectSeries(parsed.headers, parsed.rows, /(energy|kwh)/);
       const series = power || energy;
       if (!series) throw new Error("No power/energy column was detected.");
       const observedBaseline = num(values, "power_kw", "load_kw", "electrical_power_kw", "energy_kwh", "annual_energy_kwh");
       const post = series.values.reduce((sum, value) => sum + value, 0) / series.values.length;
       setVerification({ name: file.name, baseline: observedBaseline, post, unit: energy && !power ? "kWh" : "kW", count: series.values.length });
       sessionStorage.setItem("overhaul:verification", JSON.stringify({ fileName: file.name, series: series.header, postAverage: post, baseline: observedBaseline, unit: energy && !power ? "kWh" : "kW", sampleCount: series.values.length, uploadedAt: new Date().toISOString() }));
       window.dispatchEvent(new CustomEvent("overhaul:verification-change"));
     } catch (error) {
       setVerification({ name: error instanceof Error ? error.message : "Verification parse failed", baseline: null, post: null, unit: "", count: 0 });
     } finally {
       setVerificationBusy(false);
     }
   };

   const climateNote = climate?.max != null && num(values, "outdoor_temp_c", "design_outdoor_temp_c") != null ? Math.abs(climate.max - Number(num(values, "outdoor_temp_c", "design_outdoor_temp_c"))) >= 0.5 ? `Regional 7-day high (${fmt(climate.max)} °C) is available as a separate stress condition.` : "Regional weather is close to the supplied boundary and is not substituted." : "Resolve a site/climate boundary to activate contextual stress testing.";

   return <section className="overflow-hidden border border-gold/20 bg-[#080a09] shadow-[0_22px_100px_rgba(0,0,0,.18)]"><div className="border-b border-steel/10 px-5 py-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-gold">Engineering closure layer</p><h2 className="mt-1 font-display text-3xl">From one retrofit to the whole decision.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Combined interventions, contradictory evidence, measurement priorities, learned screening and post-retrofit verification now sit on the same assessment state. The deterministic physics engine remains authoritative.</p></div><div className="border border-teal/20 bg-teal/[0.035] px-3 py-2 text-right"><p className="font-mono text-[7px] uppercase text-teal">Model authority</p><p className="mt-1 text-[9px] text-paper">Deterministic physics</p></div></div></div>

     <div className="grid gap-px bg-steel/10 lg:grid-cols-2">
       <Panel title="1 · Retrofit bundles" kicker="avoid additive double-counting">
         <div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Primary target</span><input value={bundleTarget} onChange={(event) => setBundleTarget(event.target.value)} type="number" step="any" placeholder={scope === "equipment" ? "Target efficiency / COP" : "Target efficiency / COP"} /></label><label><span className="label">Installed cost · optional</span><input value={bundleCost} onChange={(event) => setBundleCost(event.target.value)} type="number" min="0" placeholder="₹" /></label></div>
         <p className="mt-3 text-[9px] leading-4 text-steel">For equipment, add <span className="text-paper">proposed_runtime_hours</span> through the Retrofit Decision Lab to activate the combined bundle.</p>
         <div className="mt-4 space-y-2">{bundles.length ? bundles.map((bundle) => <div key={bundle.name} className="border border-steel/15 bg-black/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-paper">{bundle.name}</p><p className="mt-1 text-[8px] text-steel">{bundle.note}</p></div><span className="font-mono text-[8px] text-teal">{bundle.result.delta.annualEnergyKWh <= 0 ? `${fmt(-bundle.result.delta.annualEnergyKWh)} kWh/yr saved` : `${fmt(bundle.result.delta.annualEnergyKWh)} kWh/yr increase`}</span></div><div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[8px]"><span>Power {fmt(bundle.result.proposed.electricalPowerKW)} kW</span><span>Energy {fmt(bundle.result.proposed.annualEnergyKWh)} kWh/yr</span><span>Payback {bundle.payback == null ? "—" : `${fmt(bundle.payback, 2)} yr`}</span></div></div>) : <Empty text="Supply an explicit target and a complete baseline; bundles appear only when the model can compute them."/>}</div>
       </Panel>

       <Panel title="2 · Evidence conflicts" kicker="never silently overwrite">
         {conflicts.length ? <div className="space-y-2">{conflicts.map((conflict) => <div key={conflict.field} className="border border-clay/25 bg-clay/[0.04] p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm text-paper">{conflict.field.replace(/_/g, " ")}</p><span className="font-mono text-[7px] uppercase text-clay">Conflict</span></div><div className="mt-2 space-y-1">{conflict.items.map((item, index) => <div key={`${item.source}-${index}`} className="flex justify-between gap-3 font-mono text-[8px] text-steel"><span className="truncate">{item.source}</span><span>{fmt(item.value, 3)} {item.unit || ""}</span></div>)}</div><p className="mt-2 text-[8px] leading-4 text-steel">Resolve against the strongest source or perform the suggested measurement before the value becomes decision-grade.</p></div>)}</div> : <Empty text="No conflicting numeric observations detected across the current evidence set."/>}
       </Panel>

       <Panel title="3 · Next-best measurements" kicker="maximum information per action">
         {measurementGaps.length ? <div className="space-y-2">{measurementGaps.map((item, index) => <div key={item.field} className="flex gap-3 border border-steel/15 bg-black/10 p-3"><span className="font-mono text-[8px] text-teal">0{index + 1}</span><div><p className="text-sm text-paper">{item.title}</p><p className="mt-1 text-[8px] leading-4 text-steel">{item.why}</p><p className="mt-2 font-mono text-[7px] uppercase text-steel">Field · {item.field}</p></div></div>)}</div> : <Empty text="No high-impact baseline gap detected in the current evidence state."/>}
       </Panel>

       <Panel title="4 · Learned screening" kicker="advisory only">
         {model.available ? <div className="grid gap-3 sm:grid-cols-3"><Metric label="Model" value={model.name || "Screening surrogate"}/><Metric label="Held-out R²" value={model.r2 == null ? "—" : fmt(model.r2, 3)}/><Metric label="Held-out MAE" value={model.mae == null ? "—" : fmt(model.mae, 3)}/><div className="sm:col-span-3 border border-amber-200/20 bg-amber-200/[0.035] p-3 text-[8px] leading-4 text-steel">Learned output is a screening signal only. It cannot replace measured site data, deterministic physics, or provenance-backed calculations.</div></div> : <div><Empty text={model.warning || "No validated screening artifact is loaded."}/><p className="mt-3 text-[8px] leading-4 text-steel">The product intentionally refuses to manufacture model metrics. Once a real artifact exists, it appears here automatically with its held-out metrics and training provenance.</p></div>}
       </Panel>

       <Panel title="5 · Regional stress context" kicker="climate as a boundary, not a savings multiplier">
         <div className="border border-steel/15 bg-black/10 p-3"><p className="text-sm text-paper">{climate?.location || "Location unresolved"}</p><p className="mt-2 text-[9px] leading-4 text-steel">{climateNote}</p><div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[8px] text-steel"><span>Now {climate?.temperature == null ? "—" : `${fmt(climate.temperature)}°C`}</span><span>RH {climate?.humidity == null ? "—" : `${fmt(climate.humidity)}%`}</span><span>7d high {climate?.max == null ? "—" : `${fmt(climate.max)}°C`}</span></div></div>
       </Panel>

       <Panel title="6 · Post-retrofit verification" kicker="prediction → reality">
         <label className="block border border-dashed border-steel/20 bg-black/10 p-4 text-center cursor-pointer hover:border-teal/35"><span className="font-mono text-[8px] uppercase text-teal">{verificationBusy ? "Reading measurement export…" : "Upload post-retrofit CSV / TSV"}</span><input className="sr-only" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { const file = event.target.files?.[0]; if (file) void ingestVerification(file); event.currentTarget.value = ""; }}/><p className="mt-2 text-[8px] leading-4 text-steel">The parser looks for power/energy series and compares their measured mean with the established baseline. It does not infer missing timestamps or fabricate normalization.</p></label>
         {verification ? <div className="mt-3 border border-teal/20 bg-teal/[0.035] p-3"><p className="font-mono text-[7px] uppercase text-teal">{verification.name}</p>{verification.post != null ? <><div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Baseline" value={verification.baseline == null ? "—" : `${fmt(verification.baseline)} ${verification.unit}`}/><Metric label="Post average" value={`${fmt(verification.post)} ${verification.unit}`}/><Metric label="Samples" value={verification.count.toLocaleString("en-IN")}/></div><p className="mt-3 text-[8px] leading-4 text-steel">This is a raw post-retrofit measurement comparison, not a normalized M&V claim. Weather, occupancy and operating conditions must be aligned before attributing a change to the intervention.</p></> : <p className="mt-2 text-[8px] text-clay">{verification.name}</p>}</div> : <div className="mt-3 text-[8px] text-steel">No post-retrofit dataset uploaded.</div>}
       </Panel>
     </div>

     <div className="border-t border-steel/10 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[8px] leading-4 text-steel">OVERHAUL now closes the loop: conflicting evidence is exposed, missing measurements are explicit, multiple retrofit measures are simulated together, learned models remain advisory, and post-retrofit data can be checked against the same baseline.</p><span className="font-mono text-[7px] uppercase tracking-[0.12em] text-gold">Engineering state remains evidence-bound</span></div></div>
   </section>;
 }

 function Panel({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
   return <div className="bg-[#080b0b] p-5"><p className="font-mono text-[7px] uppercase tracking-[0.16em] text-teal">{kicker}</p><h3 className="mt-1 font-display text-2xl text-paper">{title}</h3><div className="mt-4">{children}</div></div>;
 }
 function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/15 bg-black/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-sm text-paper">{value}</p></div>; }
 function Empty({ text }: { text: string }) { return <div className="border border-steel/10 bg-black/10 p-4 text-[9px] leading-4 text-steel">{text}</div>; }
