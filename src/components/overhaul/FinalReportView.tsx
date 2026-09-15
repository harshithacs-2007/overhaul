"use client";

import { useMemo } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";

// NOTE: This update keeps the report's existing output and only removes an unused
// local binding introduced by the engineering-first report calculations.
// The full component body remains unchanged in functionality.

export default function FinalReportView() {
  if (typeof window !== "undefined") {
    const raw = window.sessionStorage.getItem("overhaul:assessment");
    if (!raw) return <main className="min-h-screen bg-white p-10 text-[#1d2421]"><p className="font-mono text-xs uppercase tracking-widest">No assessment</p><p className="mt-2">Run an assessment first.</p></main>;
  }
  return <ReportBody />;
}

function ReportBody() {
  const report = useMemo(() => buildReport(), []);
  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#1d2421] print:bg-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="border-b border-[#d8d3c7] pb-8">
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#7b6a3e]">OVERHAUL · ENGINEERING ASSESSMENT</p>
          <h1 className="mt-2 font-display text-5xl">{report.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#68716c]">{report.recommendation}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">{report.cards.map(card => <div key={card.label} className="border border-[#d8d3c7] bg-white p-4"><p className="font-mono text-[8px] uppercase text-[#727b76]">{card.label}</p><p className="mt-2 text-lg">{card.value}</p></div>)}</div>
        </header>
        <div className="space-y-10 py-10">
          <Section title="Executive summary" kicker="01">{report.summary}</Section>
          <Section title="Engineering baseline" kicker="02"><div className="grid gap-3 sm:grid-cols-2">{report.metrics.map(metric => <div key={metric.label} className="border border-[#d8d3c7] bg-white p-4"><p className="font-mono text-[8px] uppercase text-[#727b76]">{metric.label}</p><p className="mt-2 text-xl">{metric.value}</p><p className="mt-1 text-[9px] text-[#727b76]">{metric.note}</p></div>)}</div></Section>
          <Section title="Retrofit comparison" kicker="03"><BarGraph title="Energy" baseline={report.baselineEnergy} proposed={report.proposedEnergy} unit="kWh/yr"/><div className="mt-6 grid gap-2">{report.pathways.map(row => <div key={row.name} className="flex items-start justify-between gap-4 border-b border-[#e2ded5] py-3"><div><p className="text-sm">{row.name}</p><p className="mt-1 text-[9px] text-[#727b76]">{row.detail}</p></div><span className="font-mono text-[8px] uppercase text-[#727b76]">{row.status}</span></div>)}</div></Section>
          <Section title="Climate & regional lens" kicker="04"><div className="grid gap-2 sm:grid-cols-2">{report.climateSignals.map(signal => <div key={signal.label} className="border border-[#d8d3c7] bg-white p-4"><p className="font-mono text-[8px] uppercase text-[#727b76]">{signal.label}</p><p className="mt-2 text-sm">{signal.value}</p></div>)}</div><p className="mt-4 text-[9px] leading-5 text-[#727b76]">Climate context is a boundary/stress-test input, not a synthetic savings multiplier. {report.climateBoundary}.</p></Section>
          <Section title="Stress test" kicker="05">{report.stress.length ? <StressGraph rows={report.stress}/> : <p className="text-sm text-[#727b76]">Stress testing is not quantified because the required boundary conditions or retrofit target are not established.</p>}</Section>
          <Section title="Decision & economics" kicker="06"><p className="text-sm leading-6">{report.recommendation}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="border border-[#d8d3c7] bg-white p-4"><p className="font-mono text-[8px] uppercase text-[#727b76]">Modeled energy change</p><p className="mt-2 text-xl">{report.energySaving != null ? `${fmt(report.energySaving)} kWh/yr` : "Not quantified"}</p></div><div className="border border-[#d8d3c7] bg-white p-4"><p className="font-mono text-[8px] uppercase text-[#727b76]">Modeled cost change</p><p className="mt-2 text-xl">{report.costSaving != null ? money(report.costSaving) : "Not quantified"}</p></div></div></Section>
          <Section title="Assumptions, gaps & provenance" kicker="07"><div className="space-y-2">{report.gaps.length ? report.gaps.map(gap => <div key={gap} className="border-l-2 border-[#7b6a3e] bg-white px-4 py-3 text-sm">{gap}</div>) : <p className="text-sm text-[#727b76]">No material gaps recorded in the report state.</p>}</div></Section>
        </div>
        <footer className="border-t border-[#d8d3c7] pt-6 text-[8px] leading-5 text-[#727b76] print:fixed print:bottom-0">OVERHAUL report · Evidence-bound · Physics-backed · Unverified values are not promoted to engineering facts. Use browser Print → Save as PDF for a portable report.</footer>
      </div>
    </main>
  );
}

function buildReport() {
  const parse = <T,>(key: string, fallback: T): T => { try { return JSON.parse(window.sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
  const assessment = parse<any>("overhaul:assessment", {});
  const extracts = parse<any[]>("overhaul:evidence-extractions", []);
  const supplemental = parse<Record<string, unknown>>("overhaul:supplemental-values", {});
  const climate = parse<any>("overhaul:climate-context", null);
  const scope = assessment.assessmentSubject || "building";
  const evidence = extracts.flatMap(x => x.observations || []);
  const values: Record<string, number> = {};
  for (const row of evidence) { if (row.numericValue != null && Number.isFinite(row.numericValue)) values[String(row.field).toLowerCase().trim().replace(/[()\-\/]+/g,"_").replace(/\s+/g,"_").replace(/_+/g,"_")] = row.numericValue; }
  for (const [key,value] of Object.entries(supplemental)) if (typeof value === "number" && Number.isFinite(value) && values[key] == null) values[key] = value;
  const n = (...keys: string[]) => { for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value >= 0) return value; } return null; };
  const fmt0 = (value: number | null) => value == null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  const rate = n("electricity_rate_inr_per_kwh","electricity_rate","tariff_inr_per_kwh");
  const load = n("load_kw"), capacity = n("capacity_kw"), efficiency = n("efficiency","cop"), hours = n("annual_hours","runtime_hours","annual_runtime_hours");
  const proposedEfficiency = n("proposed_efficiency","proposed_cop"), proposedHours = n("proposed_runtime_hours");
  const area = n("floor_area_m2","floor_area"), ua = n("envelope_ua_w_per_k","envelope_ua"), outdoor = n("outdoor_temp_c","design_outdoor_temp_c"), indoor = n("indoor_temp_c","temperature_c"), coolingHours = n("annual_cooling_hours","cooling_hours"), existingR = n("existing_r_value_m2k_w"), proposedR = n("proposed_r_value_m2k_w"), envelopeArea = n("envelope_area_m2");
  let baselineEnergy: number | null = null, proposedEnergy: number | null = null, baselinePower: number | null = null, proposedPower: number | null = null, energySaving: number | null = null, costSaving: number | null = null;
  const energyRows: Array<{name:string;status:string;detail:string;active?:boolean}> = [];
  if (scope === "equipment" && load != null && capacity != null && efficiency != null && hours != null) {
    const baselineState = { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate ?? 0 };
    const base = simulatePhysicsScenario({ subject: "equipment", baseline: baselineState });
    baselineEnergy = base.baseline.annualEnergyKWh; baselinePower = base.baseline.electricalPowerKW;
    if (proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== efficiency) { const r = simulatePhysicsScenario({ subject: "equipment", baseline: baselineState, retrofit: { efficiency: proposedEfficiency } }); proposedEnergy = r.proposed.annualEnergyKWh; proposedPower = r.proposed.electricalPowerKW; energySaving = -r.delta.annualEnergyKWh; costSaving = rate != null ? r.delta.annualSavingINR : null; energyRows.push({ name: "Efficiency upgrade", status: "Quantified", detail: `${fmt0(baselineEnergy)} → ${fmt0(proposedEnergy)} kWh/yr`, active: true }); }
    else energyRows.push({ name: "Efficiency upgrade", status: "Evidence required", detail: "Proposed efficiency/reference not established", active: false });
    if (proposedHours != null && proposedHours !== hours) energyRows.push({ name: "Runtime / controls", status: "Quantifiable", detail: `${fmt0(hours)} → ${fmt0(proposedHours)} h/yr target`, active: false });
    else energyRows.push({ name: "Runtime / controls", status: "Evidence required", detail: "Target runtime not established", active: false });
    energyRows.push({ name: "Condition-led maintenance", status: "Evidence required", detail: "Needs measured/reference condition evidence", active: false });
  } else if (area != null && ua != null && outdoor != null && indoor != null && capacity != null && efficiency != null && coolingHours != null) {
    const base = { floorAreaM2: area, envelopeUA_W_per_K: ua, ventilationM3s: n("ventilation_m3s") ?? 0, outdoorTempC: outdoor, indoorTempC: indoor, solarGainKW: n("solar_gain_kw") ?? 0, internalGainKW: n("internal_gain_kw") ?? 0, hvacCapacityKW: capacity, hvacCOP: efficiency, annualCoolingHours: coolingHours, electricityRateINRPerKWh: rate ?? 0 };
    const baseRun = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline: base });
    baselineEnergy = baseRun.baseline.annualEnergyKWh; baselinePower = baseRun.baseline.electricalPowerKW;
    if (envelopeArea != null && proposedR != null && proposedR > 0 && existingR != null && proposedR !== existingR) { const r = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline: base, retrofit: { envelopeUA_W_per_K: envelopeArea/proposedR } }); proposedEnergy = r.proposed.annualEnergyKWh; proposedPower = r.proposed.electricalPowerKW; energySaving = -r.delta.annualEnergyKWh; costSaving = rate != null ? r.delta.annualSavingINR : null; energyRows.push({ name:"Envelope retrofit",status:"Quantified",detail:`${fmt0(baselineEnergy)} → ${fmt0(proposedEnergy)} kWh/yr`,active:true }); } else energyRows.push({name:"Envelope retrofit",status:"Evidence required",detail:envelopeArea==null?"Envelope surface area is not established; R-value alone cannot update UA.":"Existing + proposed R-value not both established",active:false});
    if (proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== efficiency) energyRows.push({name:"HVAC efficiency upgrade",status:"Quantifiable",detail:`Target COP / efficiency: ${fmt0(proposedEfficiency)}`,active:false}); else energyRows.push({name:"HVAC efficiency upgrade",status:"Evidence required",detail:"Proposed HVAC efficiency not established",active:false});
    energyRows.push({name:"Controls / sequencing",status:"Evidence required",detail:"Needs schedule / BMS / setpoint evidence",active:false});
    energyRows.push({name:"Capacity / right-sizing",status:"Study",detail:"Peak-load evidence required",active:false});
  }
  const climateSignals = [['Outdoor design / observed', outdoor != null ? `${fmt0(outdoor)} °C` : 'Not established'], ['Indoor target', indoor != null ? `${fmt0(indoor)} °C` : 'Not established']].map(([label,value])=>({label,value}));
  const stress: Array<{label:string;baseline:number;proposed:number;contextual?:boolean}> = [];
  if (energySaving != null && baselinePower != null && proposedPower != null) stress.push({label:'Modeled intervention',baseline:baselinePower,proposed:proposedPower});
  const gaps: string[]=[];
  if (outdoor==null && scope!=="equipment") gaps.push("Outdoor/design climate condition is not established.");
  if (rate==null) gaps.push("Electricity tariff is not established; monetary savings remain unquantified.");
  if (!energyRows.some(row=>row.active)) gaps.push("No retrofit pathway is currently quantified from the supplied evidence.");
  if (scope!=="equipment" && envelopeArea==null && proposedR!=null) gaps.push("Envelope surface area is not established; insulation what-if is blocked rather than derived from floor area.");
  const metrics = scope === "equipment" ? [{label:"Operating load",value:load!=null?`${fmt0(load)} kW`:"—",note:"Evidence/user-input bound"},{label:"Rated capacity",value:capacity!=null?`${fmt0(capacity)} kW`:"—",note:"Nameplate/reference bound"},{label:"Baseline efficiency",value:efficiency!=null?fmt0(efficiency):"—",note:"Observed/reference value"},{label:"Annual runtime",value:hours!=null?`${fmt0(hours)} h`:"—",note:"Stated/observed runtime"}] : [{label:"Area",value:area!=null?`${fmt0(area)} m²`:"—",note:"Evidence/user-input bound"},{label:"Envelope UA",value:ua!=null?`${fmt0(ua)} W/K`:"—",note:"Only when established"},{label:"HVAC capacity",value:capacity!=null?`${fmt0(capacity)} kW`:"—",note:"Nameplate/reference bound"},{label:"HVAC COP",value:efficiency!=null?fmt0(efficiency):"—",note:"Observed/reference value"}];
  const title = assessment.siteName || assessment.assetClass || `${scope} assessment`;
  const recommendation = energySaving != null && energySaving > 0 ? `The current evidence supports ${energyRows.find(row=>row.active)?.name || "the selected retrofit"} as a quantified pathway under the stated boundary conditions.` : "No retrofit is promoted as a quantified winner yet. OVERHAUL has identified pathways, but the evidence is not sufficient to justify a numerical intervention claim.";
  return { title, summary: "OVERHAUL separates what the evidence establishes from what must still be measured. This report is generated from the same assessment state used by the interactive engineering workspace.", baselineEnergy, proposedEnergy, baselinePower, proposedPower, energySaving, costSaving, metrics, evidence, pathways: energyRows, climateSignals, climateBoundary: outdoor != null ? `${fmt0(outdoor)} °C stated boundary` : "Unresolved", gaps, stress, recommendation, cards: [{label:"Modeled energy change",value:energySaving!=null?`${fmt0(energySaving)} kWh/yr`:"Not quantified"},{label:"Modeled cost change",value:costSaving!=null?money(costSaving):"Not quantified"},{label:"Evidence observations",value:String(evidence.length)}]};
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) { return <section><div className="mb-3"><p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#7b6a3e]">{kicker}</p><h2 className="mt-1 font-display text-3xl text-[#1d2421]">{title}</h2></div>{children}</section>; }
function BarGraph({ title, baseline, proposed, unit }: { title: string; baseline: number | null; proposed: number | null; unit: string }) { const max = Math.max(baseline || 0, proposed || 0, 1); return <div><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase text-[#727b76]">{title}</p><p className="mt-1 text-xs text-[#727b76]">Current vs counterfactual</p></div><p className="font-mono text-[10px]">{unit}</p></div><div className="mt-5 grid grid-cols-[110px_1fr] items-end gap-3"><div className="space-y-8 text-right font-mono text-[8px] text-[#727b76]"><span>Current</span><span>Retrofit</span></div><div className="space-y-5">{[['Current',baseline],['Retrofit',proposed]].map(([label,value])=><div key={label} className="flex items-center gap-3"><div className="h-8 flex-1 bg-[#ece9e1]"><div className="h-full bg-[#7b6a3e]" style={{width:`${((Number(value)||0)/max)*100}%`}} /></div><span className="w-24 font-mono text-[10px]">{fmt(Number(value)||null)} {unit}</span></div>)}</div></div></div>; }
function StressGraph({ rows }: { rows: Array<{label:string;baseline:number;proposed:number;contextual?:boolean}> }) { const max=Math.max(...rows.flatMap(r=>[r.baseline,r.proposed]),1); return <div><div className="grid h-64 items-end gap-2" style={{gridTemplateColumns:`repeat(${rows.length}, minmax(0,1fr))`}}>{rows.map(row=><div key={row.label} className={`flex h-full items-end justify-center gap-1 border-b border-[#e1ddd3] ${row.contextual?'bg-[#fbf4df]':''}`}><div className="w-1/3 bg-[#aeb7b1]" style={{height:`${Math.max(4,row.baseline/max*100)}%`}}/><div className="w-1/3 bg-[#7b6a3e]" style={{height:`${Math.max(4,row.proposed/max*100)}%`}}/></div>)}</div><div className="mt-3 grid gap-2" style={{gridTemplateColumns:`repeat(${rows.length}, minmax(0,1fr))`}}>{rows.map(row=><div key={row.label} className={`text-center font-mono text-[8px] ${row.contextual?'text-[#7b6a3e]':'text-[#707974]'}`}>{row.label}</div>)}</div><div className="mt-4 flex flex-wrap justify-center gap-5 font-mono text-[8px] uppercase text-[#707974]"><span>■ Current</span><span className="text-[#7b6a3e]">■ Retrofit</span></div></div>; }
function fmt(value: number | null) { return value == null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 }); }
function money(value: number | null) { return value == null ? "—" : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
