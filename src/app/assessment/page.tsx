"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type Subject = "building" | "facility" | "equipment";
type AssessmentRecord = { assessmentSubject?: Subject; assessmentGoal?: string; createdAt?: string; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }>; context?: { locationLabel?: string; floorAreaM2?: number; assetClass?: string | null; operatingHours?: number | null; hvacCapacityKW?: number | null; hvacCOP?: number | null; temperatureC?: number | null } };
type ShadowResult = { schemaVersion: string; subject: Subject; state: "insufficient-evidence" | "within-expected" | "deviating" | "critical-deviation"; score: number; observationsUsed: number; expectedSignalsMatched: number; signals: Array<{ key: string; observed: number; expected: number; unit: string; relativeResidual: number; severity: "normal" | "warning" | "critical"; basis: string }>; unknowns: string[]; nextEvidence: string[] };
type SimResult = { proposed: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number }; delta: { annualSavingINR: number; savingPercent: number }; verdict: string[] };
type View = "overview" | "shadow" | "simulation" | "decision";
const views: Array<[View, string]> = [["overview", "Assessment"], ["shadow", "Digital Shadow"], ["simulation", "What-if"], ["decision", "Decision"]];
const labelize = (value: string) => value.replaceAll("_", " ");

export default function AssessmentPage() {
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrofit, setRetrofit] = useState(0);
  const [simulation, setSimulation] = useState<SimResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [shadow, setShadow] = useState<ShadowResult | null>(null);
  const [shadowLoading, setShadowLoading] = useState(false);
  const [shadowError, setShadowError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("overhaul:assessment");
      if (!raw) return setLoadError("No assessment package found. Start a new assessment first.");
      setAssessment(JSON.parse(raw) as AssessmentRecord);
    } catch { setLoadError("Unable to load assessment package."); }
  }, []);

  const subject = assessment?.assessmentSubject ?? "equipment";
  const subjectLabel = subject.charAt(0).toUpperCase() + subject.slice(1);
  const location = assessment?.context?.locationLabel || "Location not locked";
  const evidenceCount = assessment?.evidence?.length ?? 0;

  useEffect(() => {
    if (!assessment) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSimulationLoading(true); setSimulationError(null);
      try {
        const response = await fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, record: buildNormalizedRecord(assessment, subject), retrofit: buildRetrofit(subject, retrofit, assessment) }) });
        const payload = (await response.json()) as { result?: SimResult; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Simulation failed");
        if (!cancelled) setSimulation(payload.result);
      } catch (caught) {
        if (!cancelled) { setSimulation(null); setSimulationError(caught instanceof Error ? caught.message : "Unable to run simulation"); }
      } finally { if (!cancelled) setSimulationLoading(false); }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [assessment, retrofit, subject]);

  useEffect(() => {
    if (!assessment) return;
    let cancelled = false;
    const calibrate = async () => {
      setShadowLoading(true); setShadowError(null);
      try {
        const observations = buildObservedShadowSignals(assessment, subject);
        const expectedSignals = buildExpectedShadowSignals(assessment, subject);
        const response = await fetch("/api/digital-shadow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, observations, expectedSignals }) });
        const payload = (await response.json()) as { result?: ShadowResult; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Digital Shadow calibration failed");
        if (!cancelled) setShadow(payload.result);
      } catch (caught) {
        if (!cancelled) { setShadow(null); setShadowError(caught instanceof Error ? caught.message : "Unable to calibrate Digital Shadow"); }
      } finally { if (!cancelled) setShadowLoading(false); }
    };
    void calibrate();
    return () => { cancelled = true; };
  }, [assessment, subject]);

  const decision = useMemo(() => buildDecision(subject, shadow, simulation), [subject, shadow, simulation]);
  if (loadError) return <main className="mx-auto max-w-xl px-4 py-20 text-center"><p className="text-clay">{loadError}</p><Link href="/" className="mt-6 inline-block text-teal underline">Back to assessment</Link></main>;
  if (!assessment) return <main className="mx-auto max-w-xl px-4 py-20 text-center text-steel">Loading assessment…</main>;

  return <main className="mx-auto min-h-screen max-w-5xl px-4 pb-20 pt-8 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div><Link href="/" className="text-[11px] uppercase tracking-[0.16em] text-steel hover:text-paper">← New assessment</Link><p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-teal">Universal assessment workspace</p><h1 className="font-display mt-2 text-4xl text-paper">{subjectLabel} intelligence</h1><p className="mt-2 text-sm text-steel">{location} · {labelize(assessment.assessmentGoal ?? "unknown")}</p></div>
      <div className="border border-steel/20 p-4 text-right"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">Evidence</p><p className="mt-1 font-mono-num text-2xl text-paper">{evidenceCount}</p><p className="text-xs text-steel">items collected</p></div>
    </header>

    <nav className="mt-8 flex gap-2 overflow-x-auto border-y border-steel/20 py-3">{views.map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`shrink-0 border px-3 py-1.5 text-xs ${view === id ? "border-teal text-teal" : "border-steel/30 text-steel hover:text-paper"}`}>{label}</button>)}</nav>
    {view === "overview" ? <Overview assessment={assessment} shadow={shadow} simulation={simulation} /> : null}
    {view === "shadow" ? <ShadowView assessment={assessment} shadow={shadow} loading={shadowLoading} error={shadowError} /> : null}
    {view === "simulation" ? <SimulationView retrofit={retrofit} setRetrofit={setRetrofit} simulation={simulation} loading={simulationLoading} error={simulationError} /> : null}
    {view === "decision" ? <DecisionView decision={decision} shadow={shadow} simulation={simulation} /> : null}
  </main>;
}

function buildNormalizedRecord(assessment: AssessmentRecord, subject: Subject) { const c = assessment.context ?? {}; const variables: Record<string, number | string | boolean | null> = {}; if (c.floorAreaM2 != null) variables.floorAreaM2 = c.floorAreaM2; if (c.temperatureC != null) variables.temperatureC = c.temperatureC; if (c.hvacCapacityKW != null) variables.hvacCapacityKW = c.hvacCapacityKW; if (c.hvacCOP != null) variables.hvacCOP = c.hvacCOP; if (c.operatingHours != null) variables.annualHours = c.operatingHours * 365; return { datasetId: "assessment-input", timestamp: assessment.createdAt, subjectType: subject, variables, provenance: [{ sourcePath: "session:overhaul:assessment", confidence: "provided" as const }] }; }

function buildObservedShadowSignals(assessment: AssessmentRecord, subject: Subject) { const c = assessment.context ?? {}; const observations: Array<{ key: string; value: number; unit: string; source: "document"; confidence: number }> = []; if (typeof c.temperatureC === "number" && Number.isFinite(c.temperatureC)) observations.push({ key: "indoor_temp_c", value: c.temperatureC, unit: "°C", source: "document", confidence: 0.9 }); if (subject === "equipment" && typeof c.hvacCapacityKW === "number" && Number.isFinite(c.hvacCapacityKW)) observations.push({ key: "rated_capacity_kw", value: c.hvacCapacityKW, unit: "kW", source: "document", confidence: 0.9 }); return observations; }
function buildExpectedShadowSignals(assessment: AssessmentRecord, subject: Subject) { const c = assessment.context ?? {}; if (subject === "equipment" && typeof c.hvacCapacityKW === "number" && c.hvacCapacityKW > 0) return [{ key: "rated_capacity_kw", expected: c.hvacCapacityKW, unit: "kW", toleranceRelative: 0.05, basis: "assessment-provided rated capacity" }]; return []; }
function buildRetrofit(subject: Subject, intensity: number, assessment: AssessmentRecord) { const c = assessment.context ?? {}; const fraction = intensity / 100; if (subject === "equipment") { const baselineCOP = Number(c.hvacCOP ?? 3.2); return { efficiency: baselineCOP * (1 + 0.35 * fraction), ratedCapacityKW: Math.max(1, Number(c.hvacCapacityKW ?? 30) * (1 + 0.05 * fraction)) }; } return { envelopeUA_W_per_K: Math.max(10, Number(c.floorAreaM2 ?? 100) * 1.2 * (1 - 0.55 * fraction)), ventilationM3s: Math.max(0.02, 0.08 * (1 - 0.15 * fraction)), solarGainKW: Math.max(0, 4 * (1 - 0.2 * fraction)) }; }
function buildDecision(subject: Subject, shadow: ShadowResult | null, simulation: SimResult | null) { if (!shadow) return { status: "pending", headline: "Calibration unavailable", detail: "The engineering state could not be evaluated." }; if (shadow.state === "insufficient-evidence") return { status: "collect-evidence", headline: "Collect one more operating measurement before deciding", detail: shadow.nextEvidence[0] ?? "Provide a measured operating value that controls the calculation." }; if (shadow.state === "critical-deviation") return { status: "investigate", headline: "Investigate the deviation before approving a retrofit", detail: "The observed state is materially outside the expected envelope; diagnose the cause before changing equipment size or controls." }; if (simulation && simulation.delta.annualSavingINR > 0) return { status: "recommend", headline: `Prioritize the modeled retrofit (${Math.round(simulation.delta.savingPercent)}% annual energy reduction)`, detail: subject === "equipment" ? "The retrofit improves modeled efficiency while preserving a valid capacity range." : "The modeled intervention reduces load before HVAC capacity is reconsidered." }; return { status: "monitor", headline: "Within expected range — establish more operating history", detail: "No high-confidence deviation is established yet, so the correct action is monitoring and evidence collection rather than aggressive replacement." }; }

function Overview({ assessment, shadow, simulation }: { assessment: AssessmentRecord; shadow: ShadowResult | null; simulation: SimResult | null }) { const saving = simulation?.delta.savingPercent; return <div className="mt-8 space-y-6"><div className="grid gap-4 md:grid-cols-3"><Panel label="Target" value={(assessment.assessmentSubject ?? "equipment").toUpperCase()} detail={assessment.context?.assetClass || "Asset class will be refined from evidence"} /><Panel label="Digital Shadow" value={shadow ? `${Math.round(shadow.score)}/100` : "…"} detail={shadow?.state.replaceAll("-", " ") ?? "calibrating"} /><Panel label="What-if" value={saving != null ? `${saving.toFixed(1)}%` : "Ready"} detail={saving != null ? "modeled annual energy change" : "adjust retrofit to simulate"} /></div><section className="border border-teal/25 bg-teal/5 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-teal">Decision chain</p><div className="mt-5 grid gap-3 sm:grid-cols-5">{[["01","Evidence"],["02","Observed state"],["03","Expected state"],["04","Physics"],["05","Decision"]].map(([index,label],idx)=><motion.div key={index} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:idx*0.04}} className="border border-steel/20 p-4"><p className="font-mono-num text-[10px] text-steel">{index}</p><p className="mt-2 text-sm text-paper">{label}</p></motion.div>)}</div></section></div>; }

function ShadowView({ assessment, shadow, loading, error }: { assessment: AssessmentRecord; shadow: ShadowResult | null; loading: boolean; error: string | null }) { return <div className="mt-8 space-y-6"><section className="border border-teal/25 bg-teal/5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.16em] text-teal">Digital Shadow</p><h2 className="font-display mt-1 text-2xl text-paper">Observed vs expected behaviour</h2></div><StatusBadge state={shadow?.state ?? "insufficient-evidence"} loading={loading}/></div><p className="mt-3 max-w-3xl text-sm leading-relaxed text-steel">The shadow is computed from explicit assessment evidence and validated engineering references. Missing runtime measurements remain unknown; they are not replaced with guesses.</p></section>{error ? <div className="border border-clay/30 bg-clay/5 p-4 text-sm text-clay">{error}</div> : null}{shadow ? <><div className="grid gap-4 md:grid-cols-3"><ComparisonCard label="Observed" value={`${shadow.observationsUsed} signals`} detail="explicit evidence"/><ComparisonCard label="Expected" value={`${shadow.expectedSignalsMatched} matched`} detail="validated references"/><ComparisonCard label="Shadow score" value={`${Math.round(shadow.score)}/100`} detail="confidence × completeness × deviation"/></div><section className="border border-steel/20 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">Signal comparison</p><div className="mt-4 space-y-3">{shadow.signals.length === 0 ? <p className="text-sm text-steel">No signal has both an observed value and an expected reference yet.</p> : null}{shadow.signals.map(s=><div key={s.key} className="grid gap-3 border border-steel/15 p-4 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr] sm:items-center"><div><p className="text-sm text-paper">{labelize(s.key)}</p><p className="mt-1 text-xs text-steel">{s.basis}</p></div><Metric label="Observed" value={`${s.observed.toFixed(2)} ${s.unit}`}/><Metric label="Expected" value={`${s.expected.toFixed(2)} ${s.unit}`}/><Metric label="Residual" value={`${(s.relativeResidual*100).toFixed(1)}%`} emphasis={s.severity}/></div>)}</div></section><section className="border border-clay/25 bg-clay/5 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-clay">Next evidence</p>{shadow.nextEvidence.length ? <div className="mt-4 space-y-2">{shadow.nextEvidence.map(item=><div key={item} className="border border-clay/20 p-3 text-sm text-paper">{item}</div>)}</div> : <p className="mt-3 text-sm text-paper">No additional evidence request is currently triggered.</p>}</section></> : <div className="border border-steel/20 p-6 text-sm text-steel">Calibrating the assessment state…</div>}<p className="text-xs text-steel">Subject: {assessment.assessmentSubject ?? "equipment"} · Explicit intake values are kept separate from measured operating telemetry.</p></div>; }

function SimulationView({ retrofit, setRetrofit, simulation, loading, error }: { retrofit: number; setRetrofit: (value:number)=>void; simulation: SimResult | null; loading:boolean; error:string | null }) { return <div className="mt-8 space-y-6"><section className="border border-gold/30 bg-gold/5 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-gold">Live what-if simulation</p><h2 className="font-display mt-1 text-2xl text-paper">Change the intervention. Recalculate the physics.</h2><div className="mt-6 flex items-center gap-4"><input aria-label="Retrofit intensity" type="range" min={0} max={100} value={retrofit} onChange={e=>setRetrofit(Number(e.target.value))} className="w-full accent-teal"/><span className="font-mono-num text-sm text-paper">{retrofit}%</span></div></section>{error ? <div className="border border-clay/30 bg-clay/5 p-4 text-sm text-clay">{error}</div> : null}{loading && !simulation ? <div className="border border-steel/20 p-6 text-sm text-steel">Recomputing…</div> : null}{simulation ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Thermal load" value={`${simulation.proposed.thermalLoadKW.toFixed(2)} kW`}/><Metric label="Electrical power" value={`${simulation.proposed.electricalPowerKW.toFixed(2)} kW`}/><Metric label="Annual energy" value={`${Math.round(simulation.proposed.annualEnergyKWh).toLocaleString()} kWh`}/><Metric label="Annual saving" value={`₹${Math.round(simulation.delta.annualSavingINR).toLocaleString()}`} emphasis={simulation.delta.annualSavingINR>=0?"normal":"critical"}/></div><section className="border border-steel/20 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">Engineering verdict</p><div className="mt-3 space-y-2">{simulation.verdict.map(item=><div key={item} className="text-sm text-paper">• {item}</div>)}</div></section></> : null}</div>; }

function DecisionView({ decision, shadow, simulation }: { decision:{status:string;headline:string;detail:string}; shadow:ShadowResult|null; simulation:SimResult|null }) { const statusClass = decision.status === "recommend" ? "border-teal/30 bg-teal/5" : decision.status === "investigate" ? "border-clay/30 bg-clay/5" : "border-steel/20"; return <div className="mt-8 space-y-6"><section className={`border p-6 ${statusClass}`}><p className="text-[10px] uppercase tracking-[0.16em] text-teal">Decision</p><h2 className="font-display mt-2 text-3xl text-paper">{decision.headline}</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-steel">{decision.detail}</p></section><div className="grid gap-4 md:grid-cols-3"><ComparisonCard label="Shadow" value={shadow?`${Math.round(shadow.score)}/100`:"—"} detail={shadow?.state.replaceAll("-"," ")??"not evaluated"}/><ComparisonCard label="Modeled saving" value={simulation?`${simulation.delta.savingPercent.toFixed(1)}%`:"—"} detail="annual energy change"/><ComparisonCard label="Guardrail" value={decision.status === "collect-evidence" ? "Evidence first" : "Validated"} detail="no unsupported engineering claim"/></div></div>; }
function Panel({label,value,detail}:{label:string;value:string;detail:string}){return <section className="border border-steel/20 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</p><p className="mt-2 font-mono-num text-2xl text-paper">{value}</p><p className="mt-1 text-xs text-steel">{detail}</p></section>}
function ComparisonCard({label,value,detail}:{label:string;value:string;detail:string}){return <section className="border border-steel/20 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</p><p className="mt-2 text-xl text-paper">{value}</p><p className="mt-1 text-xs text-steel">{detail}</p></section>}
function Metric({label,value,emphasis}:{label:string;value:string;emphasis?:"normal"|"warning"|"critical"}){const tone=emphasis==="critical"?"text-clay":emphasis==="warning"?"text-gold":"text-paper";return <div><p className="text-[10px] uppercase tracking-[0.12em] text-steel">{label}</p><p className={`mt-1 font-mono-num text-sm ${tone}`}>{value}</p></div>}
function StatusBadge({state,loading}:{state:string;loading:boolean}){return <span className="border border-steel/30 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-steel">{loading?"calibrating":state.replaceAll("-"," ")}</span>}
