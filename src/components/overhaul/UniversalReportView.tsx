"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FinalReportView from "./FinalReportView";
import Twin3DCanvas from "./Twin3DCanvas";
import { calculateMachineBaseline, calculateMachineRetrofit, extractBillEnergy } from "@/lib/engineering/machineRetrofitCalculations";
import { sanitizeTwinModel, type TwinModel } from "@/lib/engineering/twinModel";

type Values = Record<string, number | string | null | undefined>;
type Assessment = { assessmentSubject?: "building" | "facility" | "equipment"; assetClass?: string | null; siteName?: string | null; assetAgeYears?: number | null; industry?: string; assessmentGoal?: string } | null;
type Extraction = { sourceName?: string; sourceKind?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number }> };
type Fusion = { summary?: string; findings?: Array<{ id: string; type: string; label: string; confidence: number; views: number[]; evidence: string; engineeringStatus: string; requiredVerification?: string[]; retrofitRelevance?: string }>; coverage?: { viewsAnalysed?: number; repeatConfirmed?: number; blindSpots?: string[] }; nextEvidence?: string[] } | null;

function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function n(values: Values, ...keys: string[]) { for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value > 0) return value; } return null; }
function fmt(value: number | null, digits = 1) { return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: digits }); }
function money(value: number | null) { return value == null || !Number.isFinite(value) ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`; }

export default function UniversalReportView() {
  const [assessment, setAssessment] = useState<Assessment>(null);
  useEffect(() => { setAssessment(readJson<Assessment>("overhaul:assessment", null)); }, []);
  if (assessment?.assessmentSubject !== "equipment") return <FinalReportView />;
  return <MachineReport assessment={assessment} />;
}

function MachineReport({ assessment }: { assessment: NonNullable<Assessment> }) {
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [values, setValues] = useState<Values>({});
  const [twin, setTwin] = useState<TwinModel | null>(null);
  const [fusion, setFusion] = useState<Fusion>(null);
  const [scan, setScan] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextExtracts = readJson<Extraction[]>("overhaul:evidence-extractions", []);
      const supplemental = readJson<Values>("overhaul:supplemental-values", {});
      const nextValues: Values = {};
      for (const item of nextExtracts) for (const observation of item.observations || []) if (observation.numericValue != null && Number.isFinite(observation.numericValue)) nextValues[observation.field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_")] = observation.numericValue;
      for (const [key, value] of Object.entries(supplemental)) if (nextValues[key] == null && typeof value === "number" && Number.isFinite(value)) nextValues[key] = value;
      setExtracts(nextExtracts); setValues(nextValues); setTwin(sanitizeTwinModel(readJson<unknown>("overhaul:twin-model", null))); setFusion(readJson<Fusion>("overhaul:scan-fusion", null)); setScan(readJson<Record<string, unknown> | null>("overhaul:room-scan", null));
    };
    sync();
    window.addEventListener("overhaul:evidence-change", sync); window.addEventListener("overhaul:supplemental-change", sync); window.addEventListener("overhaul:twin-change", sync); window.addEventListener("overhaul:scan-fusion-change", sync);
    return () => { window.removeEventListener("overhaul:evidence-change", sync); window.removeEventListener("overhaul:supplemental-change", sync); window.removeEventListener("overhaul:twin-change", sync); window.removeEventListener("overhaul:scan-fusion-change", sync); };
  }, []);

  const billObs = useMemo(() => extracts.filter((item) => `${item.sourceKind || ""} ${item.sourceName || ""}`.toLowerCase().match(/bill|electric|utility|energy/)).flatMap((item) => item.observations || []), [extracts]);
  const bill = useMemo(() => extractBillEnergy(billObs), [billObs]);
  const baseline = useMemo(() => calculateMachineBaseline({
    loadKW: n(values, "load_kw", "observed_load_kw", "operating_load_kw"),
    ratedCapacityKW: n(values, "capacity_kw", "rated_capacity_kw"),
    powerKW: n(values, "power_kw", "observed_power_kw", "input_power_kw"),
    efficiency: n(values, "efficiency"), cop: n(values, "cop"), runtimeHours: n(values, "annual_hours", "runtime_hours", "annual_runtime_hours"),
    electricityRateINRPerKWh: n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"),
    billEnergyKWh: n(values, "bill_energy_kwh", "annual_bill_energy_kwh") ?? bill.totalKWh, billMonths: n(values, "bill_history_months", "bill_months"),
  }), [values, bill]);
  const retrofit = useMemo(() => calculateMachineRetrofit({
    loadKW: n(values, "load_kw", "observed_load_kw", "operating_load_kw"), ratedCapacityKW: n(values, "capacity_kw", "rated_capacity_kw"),
    powerKW: n(values, "power_kw", "observed_power_kw", "input_power_kw"), efficiency: n(values, "efficiency"), cop: n(values, "cop"), runtimeHours: n(values, "annual_hours", "runtime_hours", "annual_runtime_hours"), electricityRateINRPerKWh: n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"),
    targetEfficiency: n(values, "proposed_efficiency", "target_efficiency"), targetCOP: n(values, "proposed_cop", "target_cop"), targetRuntimeHours: n(values, "proposed_runtime_hours", "target_runtime_hours"), title: "Explicit retrofit target",
  }), [values]);

  const findings = fusion?.findings || [];
  const overall = twin?.overall || { widthM: 2.4, depthM: 1.5, heightM: 1.8 };
  const capacity = n(values, "capacity_kw", "rated_capacity_kw");
  const load = n(values, "load_kw", "observed_load_kw", "operating_load_kw");
  const currentPower = n(values, "power_kw", "observed_power_kw", "input_power_kw");
  const util = capacity && load ? load / capacity : null;
  const savingPercent = retrofit?.energySavingKWh != null && baseline.annualEnergyKWh ? retrofit.energySavingKWh / baseline.annualEnergyKWh * 100 : null;
  const print = () => window.print();

  return <main className="machine-report min-h-screen bg-[#f4f2eb] text-[#171c19]">
    <div className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[#d6d1c5] bg-[#f4f2eb]/95 px-4 py-3 backdrop-blur sm:px-7"><div><p className="font-mono text-[8px] uppercase tracking-[.18em] text-[#7b6a3e]">OVERHAUL · machine retrofit dossier</p><p className="mt-1 text-xs text-[#5c655f]">{assessment.siteName || assessment.assetClass || "Equipment assessment"}</p></div><div className="flex gap-2"><Link href="/assessment" className="border border-[#c9c4b8] px-3 py-2 font-mono text-[8px] uppercase">Back to analysis</Link><button type="button" onClick={print} className="border border-[#7b6a3e] bg-[#171c19] px-4 py-2 font-mono text-[8px] uppercase text-[#f4edda]">Print / PDF</button></div></div>
    <article className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-7 sm:py-10">
      <section className="overflow-hidden bg-[#121713] p-7 text-[#ece8dd] shadow-xl sm:p-10"><p className="font-mono text-[8px] uppercase tracking-[.24em] text-[#c6a65b]">Evidence → twin → engineering → retrofit → verify</p><h1 className="mt-4 max-w-4xl font-display text-5xl leading-[.94] sm:text-6xl">{assessment.siteName || assessment.assetClass || "Machine / appliance"}</h1><p className="mt-4 max-w-3xl text-sm leading-6 text-[#a9b0aa]">A machine-specific retrofit record built from the scanned asset, supplied identity/specification evidence, available electricity history, user anchors and deterministic engineering calculations.</p><div className="mt-8 grid gap-3 sm:grid-cols-4">{[["Asset", assessment.assetClass || "Equipment"],["Age", assessment.assetAgeYears != null ? `${fmt(assessment.assetAgeYears,0)} yr` : "Not supplied"],["Evidence", `${extracts.length} sources`],["Scan", scan ? "captured" : "not captured"]].map(([label,value]) => <div key={label} className="border border-[#354038] p-4"><p className="font-mono text-[7px] uppercase text-[#87918b]">{label}</p><p className="mt-2 text-sm">{value}</p></div>)}</div></section>

      <Section title="01 · Evidence vs engineering" kicker="no hidden inputs"><div className="grid gap-5 lg:grid-cols-2"><Card title="What the user supplied"><Row label="Rated capacity" value={capacity != null ? `${fmt(capacity)} kW` : "Not established"}/><Row label="Observed duty" value={load != null ? `${fmt(load)} kW` : "Not established"}/><Row label="Observed input power" value={currentPower != null ? `${fmt(currentPower)} kW` : "Not measured"}/><Row label="Runtime" value={baseline.annualizedBillEnergyKWh != null && baseline.billMonths != null ? `${fmt(baseline.billMonths,0)} months bill history` : n(values,"annual_hours","runtime_hours","annual_runtime_hours") != null ? `${fmt(n(values,"annual_hours","runtime_hours","annual_runtime_hours"),0)} h/yr` : "Not established"}/><Row label="Electricity history" value={bill.totalKWh != null ? `${fmt(bill.totalKWh)} kWh extracted` : "Not extracted"}/><Row label="Model / nameplate evidence" value={extracts.some((item)=>item.observations?.some((o)=>/model|manufacturer|serial|part/i.test(o.field))) ? "present" : "not detected"}/></Card><Card title="What OVERHAUL calculates"><Row label="Calculated power" value={baseline.calculatedPowerKW != null ? `${fmt(baseline.calculatedPowerKW)} kW` : "Blocked"}/><Row label="Annual energy" value={baseline.annualEnergyKWh != null ? `${fmt(baseline.annualEnergyKWh)} kWh/yr` : "Blocked"}/><Row label="Annualised bill" value={baseline.annualizedBillEnergyKWh != null ? `${fmt(baseline.annualizedBillEnergyKWh)} kWh/yr` : "Not annualised"}/><Row label="Bill period" value={baseline.billMonths != null ? `${fmt(baseline.billMonths,0)} months` : "Not established"}/><Row label="Utilisation" value={util != null ? `${fmt(util*100,0)}%` : "Not established"}/><Row label="Model basis" value={baseline.baselineBasis.length ? baseline.baselineBasis.join(" · ") : "Insufficient evidence"}/></Card></div></Section>

      <Section title="02 · Generated digital twin" kicker="physical representation"><div className="overflow-hidden border border-[#273029] bg-[#050808]"><div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]"><div className="min-h-[560px]"><Twin3DCanvas scope="equipment" mode="observed" model={twin} widthM={overall.widthM} depthM={overall.depthM} heightM={overall.heightM} capacityKW={capacity} loadKW={load} powerKW={currentPower} currentLoadKW={load} proposedLoadKW={load} currentPowerKW={currentPower} proposedPowerKW={retrofit?.powerKW ?? currentPower} currentUtilization={util} proposedUtilization={util} savingPercent={savingPercent} title={assessment.assetClass || "Equipment twin"}/></div><div className="border-t border-[#273029] p-5 text-[#e7e3d8] lg:border-l lg:border-t-0"><p className="font-mono text-[8px] uppercase text-[#c6a65b]">Twin record</p><p className="mt-3 text-sm">Geometry basis · <span className="text-[#2ce0ca]">{twin?.geometryBasis || "parametric"}</span></p><p className="mt-2 text-xs leading-5 text-[#8f9992]">{twin ? "Generated from submitted evidence and explicit anchors. Unresolved dimensions remain labelled instead of being fabricated." : "Twin unavailable; evidence is still retained for engineering analysis."}</p><div className="mt-5 space-y-2">{[["Width", `${fmt(overall.widthM,2)} m`],["Depth",`${fmt(overall.depthM,2)} m`],["Height",`${fmt(overall.heightM,2)} m`],["Assets in twin",`${twin?.assets.length ?? 0}`],["Twin confidence",twin ? `${fmt(twin.confidence*100,0)}%` : "—"]].map(([label,value])=><Row key={label} label={label} value={value} dark/>)}</div></div></div></div></Section>

      <Section title="03 · Scan findings" kicker="visual evidence only">{findings.length ? <div className="grid gap-3 lg:grid-cols-2">{findings.map((finding) => <div key={finding.id} className="border border-[#d6d1c5] bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[7px] uppercase tracking-[.12em] text-[#7b6a3e]">{finding.type}</p><h3 className="mt-1 text-sm">{finding.label}</h3></div><span className="font-mono text-[8px] text-[#5f6a64]">{fmt(finding.confidence*100,0)}% visual</span></div><p className="mt-3 text-xs leading-5 text-[#5e6661]">{finding.evidence || "No evidence text recorded."}</p><p className="mt-3 font-mono text-[8px] uppercase text-[#7b6a3e]">status · {finding.engineeringStatus}</p>{finding.requiredVerification?.length ? <p className="mt-2 text-[10px] leading-4 text-[#6a726d]">Verify · {finding.requiredVerification.join("; ")}</p> : null><p className="mt-2 text-[10px] leading-4 text-[#6a726d]">Retrofit relevance · {finding.retrofitRelevance || "Requires engineering linkage after verification."}</p></div>)}</div> : <Empty text="No fused scan finding is available. The report does not convert absence of detections into a healthy-state claim."/>}</Section>

      <Section title="04 · Deterministic problem check" kicker="physics before recommendation"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Observed input power" value={currentPower != null ? `${fmt(currentPower)} kW` : "Not measured"}/><Metric label="Calculated power" value={baseline.calculatedPowerKW != null ? `${fmt(baseline.calculatedPowerKW)} kW` : "Needs duty + efficiency/COP"}/><Metric label="Reference deviation" value={baseline.currentPowerKW != null && baseline.calculatedPowerKW != null ? `${fmt((baseline.currentPowerKW-baseline.calculatedPowerKW),2)} kW` : "Cannot establish"}/></div><div className="mt-4 border border-[#d6d1c5] bg-white p-5"><p className="text-sm leading-6">OVERHAUL treats a measured-versus-reference deviation as a calculation result only when the reference relationship is explicit. Visual condition is kept separate and requires verification before being promoted to a confirmed fault.</p>{baseline.gaps.length ? <div className="mt-4 border border-[#caa45a]/40 bg-[#fcf8eb] p-4"><p className="font-mono text-[8px] uppercase text-[#7b6a3e]">Current gaps</p>{baseline.gaps.map((gap)=><p key={gap} className="mt-2 text-xs text-[#636a65]">{gap}</p>)}</div> : null}</div></Section>

      <Section title="05 · Retrofit simulation" kicker="explicit counterfactual"><div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><Card title="Current state"><Row label="Power" value={baseline.currentPowerKW != null ? `${fmt(baseline.currentPowerKW)} kW` : baseline.calculatedPowerKW != null ? `${fmt(baseline.calculatedPowerKW)} kW calculated` : "—"}/><Row label="Annual energy" value={baseline.annualEnergyKWh != null ? `${fmt(baseline.annualEnergyKWh)} kWh/yr` : "—"}/><Row label="Annual cost" value={baseline.annualCostINR != null ? money(baseline.annualCostINR) : "—"}/></Card><Card title="Retrofit what-if"><Row label="Intervention" value={retrofit?.title || "No explicit target supplied"}/><Row label="Target power" value={retrofit?.powerKW != null ? `${fmt(retrofit.powerKW)} kW` : "—"}/><Row label="Post-retrofit annual energy" value={retrofit?.annualEnergyKWh != null ? `${fmt(retrofit.annualEnergyKWh)} kWh/yr` : "—"}/><Row label="Energy delta" value={retrofit?.energySavingKWh != null ? `${fmt(retrofit.energySavingKWh)} kWh/yr` : "—"}/><Row label="Cost delta" value={retrofit?.costSavingINR != null ? money(retrofit.costSavingINR) : "Tariff/baseline required"}/><Row label="Calculation basis" value={retrofit?.basis || "No calculation performed"}/></Card></div>{retrofit ? <div className="mt-4 border border-[#7b6a3e] bg-[#faf6e9] p-5"><p className="font-mono text-[8px] uppercase text-[#7b6a3e]">Counterfactual result</p><p className="mt-2 text-lg">{retrofit.energySavingKWh != null ? `${fmt(retrofit.energySavingKWh)} kWh/yr calculated energy change` : "Target is not comparable to an established annual baseline."}</p><p className="mt-2 text-xs leading-5 text-[#636a65]">Only the explicit target efficiency/COP/runtime changes. No generic percentage saving is inserted.</p></div> : null}</Section>

      <Section title="06 · Decision record" kicker="engineering handoff"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Twin confidence" value={twin ? `${fmt(twin.confidence*100,0)}%` : "—"}/><Metric label="Scan views" value={fusion?.coverage?.viewsAnalysed != null ? `${fusion.coverage.viewsAnalysed}` : scan ? "captured" : "—"}/><Metric label="Reference" value={baseline.calculatedPowerKW != null ? "established" : "missing"}/><Metric label="Retrofit simulation" value={retrofit ? "computed" : "blocked"}/></div><div className="mt-4 border border-[#d6d1c5] bg-white p-5"><p className="text-sm leading-6">{retrofit ? "The report contains an explicit counterfactual based on supplied engineering inputs." : "No numeric retrofit recommendation is claimed yet because the target/reference inputs are incomplete."} {fusion?.nextEvidence?.length ? `Next evidence: ${fusion.nextEvidence.join("; ")}` : "Further measurement requirements are shown alongside the findings and calculation gaps."}</p></div></Section>

      <Section title="07 · Verification" kicker="prove the retrofit worked"><div className="grid gap-3 md:grid-cols-3"><Card title="Before"><Row label="Baseline energy" value={baseline.annualEnergyKWh != null ? `${fmt(baseline.annualEnergyKWh)} kWh/yr` : "Establish baseline"}/></Card><Card title="After"><Row label="Measured post-retrofit" value="Enter measured energy / runtime"/></Card><Card title="Variance"><Row label="Verification" value="Compare prediction to measurement"/></Card></div></Section>

      <footer className="border-t border-[#cec9bd] py-7"><div className="flex flex-wrap justify-between gap-4 font-mono text-[8px] uppercase text-[#717a75]"><span>OVERHAUL · engineering retrofit record</span><span>Evidence → Twin → Physics → Retrofit → Verify</span></div></footer>
    </article>
    <style jsx global>{`@media print {.no-print{display:none!important}.machine-report{background:white!important}.machine-report article{max-width:none!important;padding:0!important}.machine-report section{break-inside:avoid}.machine-report canvas{max-width:100%!important}}`}</style>
  </main>;
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) { return <section><div className="mb-3"><p className="font-mono text-[7px] uppercase tracking-[.18em] text-[#7b6a3e]">{kicker}</p><h2 className="mt-1 font-display text-3xl text-[#1d2421]">{title}</h2></div>{children}</section>; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <div className="border border-[#d6d1c5] bg-white p-5"><p className="font-mono text-[8px] uppercase tracking-[.12em] text-[#727b76]">{title}</p><div className="mt-3">{children}</div></div>; }
function Row({ label, value, dark }: { label: string; value: string; dark?: boolean }) { return <div className={`flex items-center justify-between gap-4 border-b py-2 last:border-0 ${dark ? "border-[#334038]" : "border-[#ebe7df]"}`}><span className={`text-[9px] ${dark ? "text-[#919b95]" : "text-[#6d756f]"}`}>{label}</span><span className={`max-w-[66%] text-right font-mono text-[9px] ${dark ? "text-[#eee9dd]" : "text-[#1c211e]"}`}>{value}</span></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-[#d6d1c5] bg-white p-4"><p className="font-mono text-[7px] uppercase text-[#727b76]">{label}</p><p className="mt-2 font-mono text-lg">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="border border-[#d6d1c5] bg-white p-5 text-sm text-[#656d67]">{text}</div>; }
