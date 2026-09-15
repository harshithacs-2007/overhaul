"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { simulatePhysicsScenario } from "@/lib/engineering";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;
type Extraction = { evidenceId?: string; sourceName?: string; sourceKind?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText?: string; notes?: string }> };
type Assessment = { assessmentSubject?: Scope; siteName?: string | null; assetClass?: string | null; industry?: string; assessmentGoal?: string; createdAt?: string; assetAgeYears?: number | null; evidence?: Array<{ id: string; name: string; kind: string; type: string; size: number }>; context?: { siteName?: string | null; industry?: string; assetClass?: string | null; assetAgeYears?: number | null } };

function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function canonical(field: string) { return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_"); }
function n(values: Values, ...keys: string[]) { for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value >= 0) return value; } return null; }
function fmt(value: number | null | undefined, digits = 1) { return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: digits }); }
function money(value: number | null | undefined) { return value == null || !Number.isFinite(value) ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`; }

export default function FinalReportView() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [supplemental, setSupplemental] = useState<Values>({});
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAssessment(readJson<Assessment | null>("overhaul:assessment", null));
      setExtracts(readJson<Extraction[]>("overhaul:evidence-extractions", []));
      setSupplemental(readJson<Values>("overhaul:supplemental-values", {}));
    };
    sync();
    window.addEventListener("overhaul:supplemental-change", sync);
    window.addEventListener("overhaul:evidence-change", sync);
    return () => {
      window.removeEventListener("overhaul:supplemental-change", sync);
      window.removeEventListener("overhaul:evidence-change", sync);
    };
  }, []);

  const values = useMemo<Values>(() => {
    const result: Values = {};
    for (const extraction of extracts) for (const observation of extraction.observations || []) {
      if (observation.numericValue != null && Number.isFinite(observation.numericValue)) result[canonical(observation.field)] = observation.numericValue;
    }
    for (const [key, value] of Object.entries(supplemental)) if (result[key] == null && typeof value === "number" && Number.isFinite(value)) result[key] = value;
    return result;
  }, [extracts, supplemental]);

  const scope = assessment?.assessmentSubject || "building";
  const report = useMemo(() => buildReport(scope, values), [scope, values]);
  const region = assessment?.siteName || assessment?.context?.siteName || "Region not stated";
  const evidenceCount = extracts.length || assessment?.evidence?.length || 0;

  if (!assessment) return <main className="mx-auto max-w-lg px-6 py-24 text-center"><p className="font-mono text-xs text-clay">No assessment state found.</p><Link href="/" className="mt-5 inline-block text-sm text-teal underline">Start an assessment</Link></main>;

  const exportPdf = () => { setPrinted(true); window.setTimeout(() => window.print(), 80); window.setTimeout(() => setPrinted(false), 500); };

  return <main className="report-shell min-h-screen bg-[#f5f4ef] text-[#141817]">
    <div className="no-print sticky top-0 z-20 border-b border-[#d8d4ca] bg-[#f5f4ef]/95 px-4 py-3 backdrop-blur sm:px-7">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#7b6a3e]">OVERHAUL · final engineering report</p><p className="mt-1 text-xs text-[#555c58]">{assessment.siteName || assessment.assetClass || "Assessment"}</p></div><div className="flex gap-2"><Link href="/assessment" className="border border-[#c8c4b9] px-3 py-2 font-mono text-[8px] uppercase text-[#3e4843]">Back to analysis</Link><button type="button" onClick={exportPdf} className="border border-[#7b6a3e] bg-[#171c19] px-4 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#f2ead3]">{printed ? "Preparing…" : "Export PDF"}</button></div></div>
    </div>

    <article className="mx-auto max-w-[1180px] space-y-7 px-4 py-7 sm:px-7 sm:py-10">
      <section className="report-page overflow-hidden bg-[#121713] p-7 text-[#eee9dd] shadow-xl sm:p-10">
        <div className="flex items-start justify-between gap-6"><div><p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#c6a65b]">Retrofit intelligence · engineering record</p><h1 className="mt-4 max-w-3xl font-display text-5xl leading-[0.95] sm:text-6xl">{assessment.siteName || assessment.assetClass || "Asset assessment"}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#a9b0ab]">An evidence-first retrofit analysis generated from the same assessment state used by the OVERHAUL decision workspace.</p></div><div className="hidden h-24 w-24 border border-[#546057] sm:block"><div className="h-full w-full bg-[linear-gradient(135deg,transparent_49%,#c6a65b_50%,transparent_51%)]"/></div></div>
        <div className="mt-10 grid gap-3 sm:grid-cols-4">{[['Scope', assessment.assetClass || scope], ['Region', region], ['Evidence', `${evidenceCount} analyzed`], ['Issued', new Date().toLocaleDateString('en-IN')]].map(([label, value]) => <div key={label} className="border border-[#374038] p-4"><p className="font-mono text-[7px] uppercase tracking-[0.15em] text-[#87918b]">{label}</p><p className="mt-2 text-sm">{value}</p></div>)}</div>
      </section>

      <Section title="01 · Executive summary" kicker="decision"><div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]"><div className="border border-[#d8d4ca] bg-white p-5"><p className="text-lg leading-7">{report.recommendation}</p><p className="mt-4 text-sm leading-6 text-[#5a625e]">OVERHAUL does not treat an unverified percentage as a result. Quantified values below come from observed/extracted values plus explicit user-supplied retrofit targets. Missing inputs remain visibly unquantified.</p></div><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">{report.cards.map((card) => <div key={card.label} className="border border-[#d8d4ca] bg-white p-4"><p className="font-mono text-[7px] uppercase text-[#727b76]">{card.label}</p><p className="mt-2 font-mono text-lg">{card.value}</p></div>)}</div></div></Section>

      <Section title="02 · Evidence record" kicker="what was actually observed"><div className="overflow-hidden border border-[#d8d4ca] bg-white"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-[#d8d4ca] bg-[#f1efe8]"><th className="px-4 py-3 font-mono text-[7px] uppercase tracking-[0.12em]">Source</th><th className="px-4 py-3 font-mono text-[7px] uppercase tracking-[0.12em]">Observation</th><th className="px-4 py-3 font-mono text-[7px] uppercase tracking-[0.12em]">Value</th><th className="px-4 py-3 font-mono text-[7px] uppercase tracking-[0.12em]">Confidence</th></tr></thead><tbody>{report.evidence.slice(0, 18).map((row, i) => <tr key={`${row.source}-${row.field}-${i}`} className="border-b border-[#ebe7de] last:border-0"><td className="px-4 py-3 text-xs text-[#69716c]">{row.source}</td><td className="px-4 py-3 text-xs">{row.field}</td><td className="px-4 py-3 font-mono text-xs">{row.value}</td><td className="px-4 py-3 font-mono text-xs">{Math.round(row.confidence * 100)}%</td></tr>)}</tbody></table></div></Section>

      <Section title="03 · Engineering baseline" kicker="defensible before-state"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{report.metrics.map((metric) => <div key={metric.label} className="border border-[#d8d4ca] bg-white p-4"><p className="font-mono text-[7px] uppercase text-[#727b76]">{metric.label}</p><p className="mt-2 font-mono text-xl">{metric.value}</p><p className="mt-2 text-[10px] leading-4 text-[#6b726e]">{metric.note}</p></div>)}</div><div className="mt-4 border border-[#d8d4ca] bg-white p-5"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7b6a3e]">Calculation chain</p><div className="mt-4 grid gap-2 md:grid-cols-7">{['Evidence','Baseline','Diagnosis','Retrofit','Physics','Economics','Decision'].map((item, i) => <div key={item} className="flex items-center gap-2"><div className="min-w-0 flex-1 border border-[#cfcac0] px-3 py-3 text-center text-[10px]">{item}</div>{i < 6 ? <span className="text-[#a79e8a]">→</span> : null}</div>)}</div></div></Section>

      <Section title="04 · Retrofit comparison" kicker="counterfactual, not a guess"><div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="border border-[#d8d4ca] bg-white p-5"><BarGraph title="Annual energy" baseline={report.baselineEnergy} proposed={report.proposedEnergy} unit="kWh"/><div className="mt-7"><BarGraph title="Electrical power" baseline={report.baselinePower} proposed={report.proposedPower} unit="kW"/></div></div><div className="space-y-3">{report.pathways.map((pathway) => <div key={pathway.name} className={`border p-4 ${pathway.active ? 'border-[#89733e] bg-[#fbf8ef]' : 'border-[#d8d4ca] bg-white'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[8px] uppercase text-[#7b6a3e]">{pathway.status}</p><p className="mt-1 text-sm">{pathway.name}</p></div>{pathway.active ? <span className="font-mono text-[7px] uppercase text-[#7b6a3e]">modeled</span> : null}</div><p className="mt-3 font-mono text-xs">{pathway.detail}</p></div>)}</div></div></Section>

      <Section title="05 · Climate & regional lens" kicker="never silently guessed"><div className="grid gap-4 md:grid-cols-[.8fr_1.2fr]"><div className="border border-[#d8d4ca] bg-white p-5"><p className="font-mono text-[7px] uppercase text-[#727b76]">Region supplied</p><p className="mt-2 text-xl">{region}</p><p className="mt-4 font-mono text-[8px] uppercase text-[#727b76]">Boundary evidence</p><p className="mt-1 font-mono text-sm">{report.climateBoundary}</p></div><div className="border border-[#d8d4ca] bg-white p-5"><p className="text-sm leading-6">Regional climate is treated as a boundary condition, not a decoration. Where a credible outdoor/design condition is present in the evidence, it propagates through thermal-load calculations and the stress test. Where regional weather data is absent, OVERHAUL leaves the climate adjustment explicitly unresolved rather than fabricating a “climate savings” multiplier.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{report.climateSignals.map((signal) => <div key={signal.label} className="border border-[#ebe7de] bg-[#faf9f5] p-3"><p className="font-mono text-[7px] uppercase text-[#727b76]">{signal.label}</p><p className="mt-1 font-mono text-sm">{signal.value}</p></div>)}</div></div></div></Section>

      <Section title="06 · Stress test" kicker="does the intervention hold?">{report.stress.length ? <div className="border border-[#d8d4ca] bg-white p-5"><StressGraph rows={report.stress}/><p className="mt-4 text-xs leading-5 text-[#656d68]">Each point is a rerun of the deterministic model under an explicit operating condition. It is a robustness view, not a measured forecast.</p></div> : <div className="border border-[#d8d4ca] bg-white p-5 text-sm text-[#656d68]">Stress testing is not quantified yet because the evidence does not establish the target retrofit parameter.</div>}</Section>

      <Section title="07 · 3D / system view" kicker="physical consequence"><div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><div className="border border-[#29312c] bg-[#121713] p-5"><svg viewBox="0 0 720 360" className="h-auto w-full" role="img" aria-label="Engineering asset schematic"><g fill="none" stroke="#7e8a84" strokeWidth="1"><rect x="80" y="90" width="360" height="180"/><path d="M80 90 170 40h360l-90 50M440 90l90-50v180l-90 50M170 40v180"/><path d="M80 180h360M170 40v50M350 90v180"/></g><g fill="#c6a65b"><circle cx="170" cy="135" r="5"/><circle cx="350" cy="135" r="5"/><circle cx="440" cy="180" r="5"/></g><g fill="#aeb7b1" fontFamily="monospace" fontSize="12"><text x="90" y="320">Existing asset geometry / system representation</text><text x="455" y="135">EVIDENCE</text><text x="455" y="157">→ MODEL</text><text x="455" y="179">→ RETROFIT</text><text x="455" y="201">→ VERIFY</text></g></svg></div><div className="border border-[#d8d4ca] bg-white p-5"><p className="text-sm leading-6">The visual is deliberately labeled as a system schematic unless explicit metric geometry is available. OVERHAUL does not turn a photograph into fake CAD dimensions.</p><div className="mt-5 space-y-2">{['Observed state','Counterfactual state','Causal metrics','Evidence links'].map((item) => <div key={item} className="flex items-center justify-between border-b border-[#ebe7de] py-3 text-xs"><span>{item}</span><span className="font-mono text-[8px] text-[#7b6a3e]">included</span></div>)}</div></div></div></Section>

      <Section title="08 · Decision & economics" kicker="what is justified"> <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Annual energy reduction', `${fmt(report.energySaving)} kWh/yr`], ['Annual cost reduction', money(report.costSaving)], ['Simple payback', report.payback], ['Decision state', report.decisionState]].map(([label, value]) => <div key={label} className="border border-[#d8d4ca] bg-white p-4"><p className="font-mono text-[7px] uppercase text-[#727b76]">{label}</p><p className="mt-2 font-mono text-lg">{value}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-[#656d68]">Installed cost, downtime and carbon are reported only when explicitly supplied or independently established. OVERHAUL does not invent procurement prices to create an attractive payback.</p></Section>

      <Section title="09 · Verification plan" kicker="close the loop"><div className="grid gap-3 md:grid-cols-3">{['Re-measure operating power / load','Compare actual runtime / energy against baseline','Record post-retrofit condition and comfort/performance'].map((item, i) => <div key={item} className="border border-[#d8d4ca] bg-white p-5"><p className="font-mono text-[7px] text-[#7b6a3e]">0{i + 1}</p><p className="mt-3 text-sm leading-5">{item}</p></div>)}</div></Section>

      <Section title="10 · Assumptions, gaps & provenance" kicker="read before action"><div className="grid gap-4 lg:grid-cols-2"><div className="border border-[#d8d4ca] bg-white p-5"><p className="font-mono text-[8px] uppercase text-[#727b76]">Known gaps</p><ul className="mt-3 space-y-2 text-sm text-[#5f6863]">{report.gaps.map((gap) => <li key={gap}>• {gap}</li>)}</ul></div><div className="border border-[#d8d4ca] bg-white p-5"><p className="font-mono text-[8px] uppercase text-[#727b76]">Engineering basis</p><p className="mt-3 text-sm leading-6">Physics consequences are calculated by the deterministic OVERHAUL engineering core. AI perception is used to extract and interpret evidence; it is not the source of invented engineering values.</p></div></div></Section>

      <footer className="report-page border-t border-[#cfcac0] pt-6 pb-10"><div className="flex flex-wrap justify-between gap-4"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#707974]">OVERHAUL · retrofit intelligence engine</p><p className="font-mono text-[8px] text-[#707974]">Evidence → Model → Retrofit → Simulate → Decide → Verify</p></div></footer>
    </article>
    <style jsx global>{`@media print {.no-print{display:none!important}.report-shell{background:white!important}.report-page{box-shadow:none!important;break-inside:avoid}.report-page,.report-shell section{break-inside:avoid}.report-shell article{max-width:none!important;padding:0!important}.report-shell{font-size:11pt!important}.report-shell h1{font-size:34pt!important}}`}</style>
  </main>;
}

function buildReport(scope: Scope, values: Values) {
  const evidence: Array<{ source: string; field: string; value: string; confidence: number }> = [];
  // Values are already the canonical numeric observations surfaced by the assessment workspace.
  const energyRows: Array<{ name: string; status: string; detail: string; active: boolean }> = [];
  let baselineEnergy: number | null = null, proposedEnergy: number | null = null, baselinePower: number | null = null, proposedPower: number | null = null, energySaving: number | null = null, costSaving: number | null = null;

  const load = n(values, "load_kw"); const capacity = n(values, "capacity_kw"); const efficiency = n(values, "efficiency", "cop"); const hours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours"); const rate = n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh");
  const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop"); const proposedHours = n(values, "proposed_runtime_hours");
  const area = n(values, "floor_area_m2", "floor_area"); const ua = n(values, "envelope_ua_w_per_k", "envelope_ua"); const outdoor = n(values, "outdoor_temp_c", "design_outdoor_temp_c"); const indoor = n(values, "indoor_temp_c", "temperature_c"); const cop = n(values, "efficiency", "cop"); const coolingHours = n(values, "annual_cooling_hours", "cooling_hours"); const existingR = n(values, "existing_r_value_m2k_w"); const proposedR = n(values, "proposed_r_value_m2k_w");

  if (scope === "equipment" && load != null && capacity != null && efficiency != null && hours != null) {
    const base = simulatePhysicsScenario({ subject: "equipment", baseline: { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate ?? 0 } });
    baselineEnergy = base.baseline.annualEnergyKWh; baselinePower = base.baseline.electricalPowerKW;
    if (proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== efficiency) {
      const r = simulatePhysicsScenario({ subject: "equipment", baseline: { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate ?? 0 }, retrofit: { efficiency: proposedEfficiency } });
      proposedEnergy = r.proposed.annualEnergyKWh; proposedPower = r.proposed.electricalPowerKW; energySaving = -r.delta.annualEnergyKWh; costSaving = r.delta.annualSavingINR;
      energyRows.push({ name: "Efficiency upgrade", status: "Quantified", detail: `${fmt(baselineEnergy)} → ${fmt(proposedEnergy)} kWh/yr`, active: true });
    } else energyRows.push({ name: "Efficiency upgrade", status: "Evidence required", detail: "Proposed efficiency/reference not established", active: false });
    if (proposedHours != null && proposedHours !== hours) energyRows.push({ name: "Runtime / controls", status: "Quantifiable", detail: `${fmt(hours, 0)} → ${fmt(proposedHours, 0)} h/yr target`, active: false });
    else energyRows.push({ name: "Runtime / controls", status: "Evidence required", detail: "Target runtime not established", active: false });
    energyRows.push({ name: "Condition-led maintenance", status: "Evidence required", detail: "Needs measured/reference condition evidence", active: false });
  } else if (area != null && ua != null && outdoor != null && indoor != null && capacity != null && cop != null && coolingHours != null) {
    const base = { floorAreaM2: area, envelopeUA_W_per_K: ua, ventilationM3s: 0, outdoorTempC: outdoor, indoorTempC: indoor, solarGainKW: 0, internalGainKW: 0, hvacCapacityKW: capacity, hvacCOP: cop, annualCoolingHours: coolingHours, electricityRateINRPerKWh: rate ?? 0 };
    const baseRun = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline: base });
    baselineEnergy = baseRun.baseline.annualEnergyKWh; baselinePower = baseRun.baseline.electricalPowerKW;
    if (proposedR != null && proposedR > 0 && existingR != null && proposedR !== existingR) {
      const proposedUA = area / proposedR; const r = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline: base, retrofit: { envelopeUA_W_per_K: proposedUA } });
      proposedEnergy = r.proposed.annualEnergyKWh; proposedPower = r.proposed.electricalPowerKW; energySaving = -r.delta.annualEnergyKWh; costSaving = r.delta.annualSavingINR;
      energyRows.push({ name: "Envelope retrofit", status: "Quantified", detail: `${fmt(baselineEnergy)} → ${fmt(proposedEnergy)} kWh/yr`, active: true });
    } else energyRows.push({ name: "Envelope retrofit", status: "Evidence required", detail: "Existing + proposed R-value not both established", active: false });
    const proposedHVACEff = n(values, "proposed_efficiency", "proposed_cop");
    if (proposedHVACEff != null && proposedHVACEff > 0 && proposedHVACEff !== cop) energyRows.push({ name: "HVAC efficiency upgrade", status: "Quantifiable", detail: `Target COP / efficiency: ${fmt(proposedHVACEff)}`, active: false });
    else energyRows.push({ name: "HVAC efficiency upgrade", status: "Evidence required", detail: "Proposed HVAC efficiency not established", active: false });
    energyRows.push({ name: "Controls / sequencing", status: "Evidence required", detail: "Needs schedule / BMS / setpoint evidence", active: false });
    energyRows.push({ name: "Capacity / right-sizing", status: "Study", detail: "Peak-load evidence required before resizing", active: false });
  }

  const baseline = baselineEnergy ?? 0; const proposed = proposedEnergy ?? baseline; const saving = energySaving ?? 0;
  const climateSignals = [['Outdoor design / observed', outdoor != null ? `${fmt(outdoor)} °C` : 'Not established'], ['Indoor target', indoor != null ? `${fmt(indoor)} °C` : 'Not established']].map(([label, value]) => ({ label, value }));
  const metrics = scope === "equipment" ? [
    { label: "Operating load", value: load != null ? `${fmt(load)} kW` : "—", note: "Evidence/user-input bound" },
    { label: "Rated capacity", value: capacity != null ? `${fmt(capacity)} kW` : "—", note: "Nameplate/reference bound" },
    { label: "Baseline efficiency", value: efficiency != null ? fmt(efficiency, 3) : "—", note: "Observed/reference value" },
    { label: "Annual runtime", value: hours != null ? `${fmt(hours, 0)} h` : "—", note: "Stated/observed runtime" },
  ] : [
    { label: "Area", value: area != null ? `${fmt(area)} m²` : "—", note: "Evidence/user-input bound" },
    { label: "Envelope UA", value: ua != null ? `${fmt(ua)} W/K` : "—", note: "Only when established" },
    { label: "HVAC capacity", value: capacity != null ? `${fmt(capacity)} kW` : "—", note: "Nameplate/reference bound" },
    { label: "HVAC COP", value: cop != null ? fmt(cop, 2) : "—", note: "Observed/reference value" },
  ];
  const stress = scope === "equipment" && load != null && capacity != null && efficiency != null && hours != null && proposedEfficiency != null && proposedEfficiency !== efficiency ? [0.25,0.5,0.75,1].map(f => { const l = capacity * f; const b = simulatePhysicsScenario({ subject:"equipment", baseline:{loadKW:l,ratedCapacityKW:capacity,efficiency,annualHours:hours,electricityRateINRPerKWh:rate??0} }); const r=simulatePhysicsScenario({ subject:"equipment",baseline:{loadKW:l,ratedCapacityKW:capacity,efficiency,annualHours:hours,electricityRateINRPerKWh:rate??0},retrofit:{efficiency:proposedEfficiency}}); return { label:`${Math.round(f*100)}%`, baseline:b.baseline.electricalPowerKW, proposed:r.proposed.electricalPowerKW }; }) : area != null && ua != null && outdoor != null && indoor != null && capacity != null && cop != null && coolingHours != null && proposedR != null && existingR != null && proposedR !== existingR ? [-2,0,2,4,6].map(d => { const temp=outdoor+d; const b={floorAreaM2:area,envelopeUA_W_per_K:ua,ventilationM3s:0,outdoorTempC:temp,indoorTempC:indoor,solarGainKW:0,internalGainKW:0,hvacCapacityKW:capacity,hvacCOP:cop,annualCoolingHours:coolingHours,electricityRateINRPerKWh:rate??0}; const current=simulatePhysicsScenario({subject:scope==='facility'?'facility':'building',baseline:b}); const r=simulatePhysicsScenario({subject:scope==='facility'?'facility':'building',baseline:b,retrofit:{envelopeUA_W_per_K:area/proposedR}}); return {label:`${temp.toFixed(0)}°C`,baseline:current.baseline.electricalPowerKW,proposed:r.proposed.electricalPowerKW}; }) : [];

  const evidenceKeys = ['floor_area_m2','envelope_ua_w_per_k','outdoor_temp_c','indoor_temp_c','capacity_kw','load_kw','efficiency','cop','annual_hours','annual_cooling_hours','electricity_rate_inr_per_kwh','existing_r_value_m2k_w','proposed_r_value_m2k_w','proposed_efficiency','proposed_runtime_hours'];
  evidenceKeys.forEach((key) => { const v = values[key]; if (typeof v === 'number' && Number.isFinite(v)) evidence.push({ source: 'Assessment state', field: key.replaceAll('_',' '), value: fmt(v,3), confidence: 1 }); });
  const gaps = [];
  if (!values.outdoor_temp_c && scope !== 'equipment') gaps.push('Outdoor/design climate condition is not established.');
  if (!values.electricity_rate_inr_per_kwh) gaps.push('Electricity tariff is not established; monetary savings remain unquantified.');
  if (!values.proposed_efficiency && !values.proposed_r_value_m2k_w && !values.proposed_runtime_hours) gaps.push('No explicit retrofit target has been supplied yet.');
  if (scope !== 'equipment' && !values.ventilation_m3s && !values.solar_gain_kw && !values.internal_gain_kw) gaps.push('Ventilation, solar and internal gains are not established; the current building thermal model is partial.');
  const rec = energySaving != null && energySaving > 0 && energyRows.some(r=>r.active) ? `The current evidence supports ${energyRows.find(r=>r.active)?.name} as a quantified retrofit pathway. The modeled annual energy change is ${fmt(saving)} kWh/yr under the stated boundary conditions.` : 'No retrofit is promoted as a quantified winner yet. OVERHAUL has identified pathways, but the evidence is not sufficient to justify a numerical intervention claim.';
  const cards = [{label:'Modeled energy change',value: proposedEnergy != null ? `${fmt(saving)} kWh/yr` : 'Not quantified'},{label:'Modeled cost change',value: costSaving != null ? money(costSaving) : 'Not quantified'},{label:'Evidence sources',value:`${evidenceCountPlaceholder(evidence)} values` }];
  return { baselineEnergy, proposedEnergy, baselinePower, proposedPower, energySaving: energySaving ?? 0, costSaving: costSaving ?? null, payback: 'Requires installed cost', decisionState: energySaving && energySaving > 0 ? 'Quantified pathway' : 'Evidence-gated', recommendation: rec, cards, metrics, evidence, pathways: energyRows, climateSignals, climateBoundary: outdoor != null ? `${fmt(outdoor)} °C stated boundary` : 'Unresolved', gaps, stress };
}
function evidenceCountPlaceholder(evidence: unknown[]) { return evidence.length.toString(); }

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) { return <section><div className="mb-3"><p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#7b6a3e]">{kicker}</p><h2 className="mt-1 font-display text-3xl text-[#1d2421]">{title}</h2></div>{children}</section>; }
function BarGraph({ title, baseline, proposed, unit }: { title: string; baseline: number | null; proposed: number | null; unit: string }) { const max = Math.max(baseline || 0, proposed || 0, 1); return <div><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase text-[#727b76]">{title}</p><p className="mt-1 text-xs text-[#727b76]">Current vs counterfactual</p></div><p className="font-mono text-[10px]">{unit}</p></div><div className="mt-5 grid grid-cols-[110px_1fr] items-end gap-3"><div className="space-y-8 text-right font-mono text-[8px] text-[#727b76]"><span>Current</span><span>Retrofit</span></div><div className="space-y-5">{[['Current',baseline],['Retrofit',proposed]].map(([label,value]) => <div key={label} className="flex items-center gap-3"><div className="h-8 flex-1 bg-[#ece9e1]"><div className="h-full bg-[#7b6a3e]" style={{width:`${((Number(value)||0)/max)*100}%`}} /></div><span className="w-24 font-mono text-[10px]">{fmt(Number(value)||null)} {unit}</span></div>)}</div></div></div>; }
function StressGraph({ rows }: { rows: Array<{ label:string; baseline:number; proposed:number }> }) { const max=Math.max(...rows.flatMap(r=>[r.baseline,r.proposed]),1); return <div><div className="grid h-64 items-end gap-2" style={{gridTemplateColumns:`repeat(${rows.length}, minmax(0,1fr))`}}>{rows.map(row=><div key={row.label} className="flex h-full items-end justify-center gap-1 border-b border-[#e1ddd3]"> <div className="w-1/3 bg-[#aeb7b1]" style={{height:`${Math.max(4,row.baseline/max*100)}%`}}/><div className="w-1/3 bg-[#7b6a3e]" style={{height:`${Math.max(4,row.proposed/max*100)}%`}}/></div>)}</div><div className="mt-3 grid gap-2" style={{gridTemplateColumns:`repeat(${rows.length}, minmax(0,1fr))`}}>{rows.map(row=><div key={row.label} className="text-center font-mono text-[8px] text-[#707974]">{row.label}</div>)}</div><div className="mt-4 flex justify-center gap-5 font-mono text-[8px] uppercase text-[#707974]"><span>■ Current</span><span className="text-[#7b6a3e]">■ Retrofit</span></div></div>; }
