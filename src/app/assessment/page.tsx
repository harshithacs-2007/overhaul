"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type AssessmentRecord = {
  assessmentSubject?: "building" | "facility" | "equipment";
  assessmentGoal?: string;
  createdAt?: string;
  evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }>;
  context?: {
    locationLabel?: string;
    latitude?: number;
    longitude?: number;
    floorAreaM2?: number;
    assetClass?: string | null;
    operatingHours?: number | null;
    hvacCapacityKW?: number | null;
    hvacCOP?: number | null;
    temperatureC?: number | null;
  };
};

type View = "overview" | "shadow" | "simulation" | "decision";
type SimResult = {
  baseline: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; utilization: number };
  proposed: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; utilization: number };
  delta: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; annualCostINR: number; annualSavingINR: number; savingPercent: number };
  verdict: string[];
};

const views: Array<[View, string]> = [
  ["overview", "Assessment"],
  ["shadow", "Digital Shadow"],
  ["simulation", "What-if"],
  ["decision", "Decision"],
];

export default function AssessmentPage() {
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState<string | null>(null);
  const [retrofit, setRetrofit] = useState(0);
  const [uncertainty, setUncertainty] = useState(42);
  const [simulation, setSimulation] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("overhaul:assessment");
      if (!raw) {
        setError("No assessment package found. Start a new assessment first.");
        return;
      }
      setAssessment(JSON.parse(raw) as AssessmentRecord);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load assessment package");
    }
  }, []);

  const evidenceCount = assessment?.evidence?.length ?? 0;
  const subject = assessment?.assessmentSubject ?? "equipment";
  const subjectLabel = subject.charAt(0).toUpperCase() + subject.slice(1);
  const goal = assessment?.assessmentGoal ?? "unknown";
  const location = assessment?.context?.locationLabel || "Location not locked";

  useEffect(() => {
    if (!assessment) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSimLoading(true);
      setSimError(null);
      try {
        const seed = buildNormalizedRecord(assessment, subject);
        const retrofitState = buildRetrofit(subject, retrofit, assessment);
        const response = await fetch("/api/simulate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, record: seed, retrofit: retrofitState }),
        });
        const payload = (await response.json()) as { result?: SimResult; error?: string; message?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || payload.message || "Simulation failed");
        if (!cancelled) setSimulation(payload.result);
      } catch (caught) {
        if (!cancelled) {
          setSimulation(null);
          setSimError(caught instanceof Error ? caught.message : "Unable to run simulation");
        }
      } finally {
        if (!cancelled) setSimLoading(false);
      }
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assessment, retrofit, subject]);

  const simulationConfidence = useMemo(() => Math.max(38, 100 - uncertainty), [uncertainty]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-clay">{error}</p>
        <Link href="/" className="mt-6 inline-block text-teal underline">Back to assessment</Link>
      </main>
    );
  }

  if (!assessment) {
    return <main className="mx-auto max-w-xl px-4 py-20 text-center text-steel">Loading assessment…</main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Link href="/" className="text-[11px] uppercase tracking-[0.16em] text-steel hover:text-paper">← New assessment</Link>
          <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-teal">Universal assessment workspace</p>
          <h1 className="font-display mt-2 text-4xl text-paper">{subjectLabel} intelligence</h1>
          <p className="mt-2 text-sm text-steel">{location} · {goal.replaceAll("_", " ")}</p>
        </div>
        <div className="border border-steel/20 p-4 text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Evidence</p>
          <p className="mt-1 font-mono-num text-2xl text-paper">{evidenceCount}</p>
          <p className="text-xs text-steel">items collected</p>
        </div>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto border-y border-steel/20 py-3">
        {views.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`shrink-0 border px-3 py-1.5 text-xs ${view === id ? "border-teal text-teal" : "border-steel/30 text-steel"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "overview" ? (
        <Overview assessment={assessment} evidenceCount={evidenceCount} uncertainty={uncertainty} onUncertainty={setUncertainty} />
      ) : null}

      {view === "shadow" ? (
        <ShadowView subject={subjectLabel} location={location} uncertainty={uncertainty} />
      ) : null}

      {view === "simulation" ? (
        <SimulationView retrofit={retrofit} setRetrofit={setRetrofit} simulation={simulation} loading={simLoading} error={simError} confidence={simulationConfidence} subject={subjectLabel} />
      ) : null}

      {view === "decision" ? (
        <DecisionView subject={subjectLabel} goal={goal} uncertainty={uncertainty} simulation={simulation} />
      ) : null}
    </main>
  );
}

function buildNormalizedRecord(assessment: AssessmentRecord, subject: "building" | "facility" | "equipment") {
  const c = assessment.context ?? {};
  const variables: Record<string, number | string | boolean | null> = {};
  if (c.floorAreaM2 != null) variables.floorAreaM2 = c.floorAreaM2;
  if (c.latitude != null) variables.latitude = c.latitude;
  if (c.longitude != null) variables.longitude = c.longitude;
  if (c.temperatureC != null) variables.temperatureC = c.temperatureC;
  if (c.hvacCapacityKW != null) variables.hvacCapacityKW = c.hvacCapacityKW;
  if (c.hvacCOP != null) variables.hvacCOP = c.hvacCOP;
  if (c.operatingHours != null) variables.annualHours = c.operatingHours * 365;
  if (subject === "equipment") {
    variables.loadKW = Number(c.hvacCapacityKW ?? 0) * 0.72;
    variables.ratedCapacityKW = Number(c.hvacCapacityKW ?? 0);
    variables.efficiency = Number(c.hvacCOP ?? 0);
  }
  return {
    datasetId: "assessment-input",
    timestamp: assessment.createdAt,
    subjectType: subject,
    variables,
    provenance: [{ sourcePath: "session:overhaul:assessment", confidence: "provided" as const }],
  };
}

function buildRetrofit(subject: "building" | "facility" | "equipment", intensity: number, assessment: AssessmentRecord) {
  const c = assessment.context ?? {};
  const fraction = intensity / 100;
  if (subject === "equipment") {
    const baselineCOP = Number(c.hvacCOP ?? 3.2);
    return {
      efficiency: baselineCOP * (1 + 0.35 * fraction),
      ratedCapacityKW: Math.max(1, Number(c.hvacCapacityKW ?? 30) * (1 + 0.05 * fraction)),
    };
  }
  return {
    envelopeUA_W_per_K: Math.max(10, Number(c.floorAreaM2 ?? 100) * 1.2 * (1 - 0.55 * fraction)),
    ventilationM3s: Math.max(0.02, 0.08 * (1 - 0.15 * fraction)),
    solarGainKW: Math.max(0, 4 * (1 - 0.2 * fraction)),
  };
}

function Overview({ assessment, evidenceCount, uncertainty, onUncertainty }: { assessment: AssessmentRecord; evidenceCount: number; uncertainty: number; onUncertainty: (value: number) => void }) {
  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel label="Target" value={assessment.assessmentSubject ? assessment.assessmentSubject.toUpperCase() : "—"} detail={assessment.context?.assetClass || "Asset class will be extracted from evidence"} />
        <Panel label="Context" value={assessment.context?.floorAreaM2 ? `${assessment.context.floorAreaM2} m²` : "Not provided"} detail={assessment.context?.operatingHours ? `${assessment.context.operatingHours} h/day` : "Operating schedule not established"} />
        <Panel label="Evidence" value={`${evidenceCount} items`} detail="Ready for perception and extraction" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border border-teal/25 bg-teal/5 p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-teal">Pipeline state</p>
          <div className="mt-4 space-y-3 text-sm text-paper">
            <StateRow done label="Evidence collected" />
            <StateRow done label="Structured model intake" />
            <StateRow label="AI perception + OCR" />
            <StateRow label="Digital Shadow calibration" />
            <StateRow label="Engineering validation" />
            <StateRow label="Retrofit optimization" />
          </div>
        </section>
        <section className="border border-clay/25 bg-clay/5 p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-clay">Uncertainty gate</p>
          <p className="mt-3 text-sm leading-relaxed text-paper">The real system should request another evidence item only when uncertainty could change the engineering decision.</p>
          <div className="mt-5 flex items-center gap-4">
            <input aria-label="Uncertainty level" type="range" min={0} max={100} value={uncertainty} onChange={(event) => onUncertainty(Number(event.target.value))} className="w-full accent-teal" />
            <span className="font-mono-num text-sm text-paper">{uncertainty}%</span>
          </div>
          <p className="mt-2 text-xs text-steel">Simulation confidence uses this intake gate; engineering outputs remain deterministic.</p>
        </section>
      </div>
    </div>
  );
}

function ShadowView({ subject, location, uncertainty }: { subject: string; location: string; uncertainty: number }) {
  return (
    <div className="mt-8 space-y-6">
      <section className="border border-steel/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] uppercase tracking-[0.16em] text-steel">Digital Shadow</p><h2 className="font-display mt-1 text-2xl text-paper">Expected behaviour vs observed evidence</h2></div>
          <span className="border border-steel/30 px-2 py-1 text-[10px] uppercase tracking-wide text-steel">Calibration pending</span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel">The shadow is a computational expected-behaviour model, not a decorative 3D twin. It should account for climate, load, schedule, controls, and connected systems before attributing deviation to degradation.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <ComparisonCard label="Observed" value="Awaiting measured state" />
        <ComparisonCard label="Expected" value="Awaiting calibrated model" />
        <ComparisonCard label="Deviation" value={`${uncertainty}% uncertainty`} />
      </div>
      <div className="border border-steel/20 p-5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Causal checks</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[["Climate / ambient effect", "Not yet evaluated"], ["Operating load effect", "Not yet evaluated"], ["Controls / setpoint effect", "Not yet evaluated"], ["Equipment degradation", "Not established"]].map(([label, value]) => <div key={label} className="border border-steel/15 p-4"><p className="text-sm text-paper">{label}</p><p className="mt-1 text-xs text-steel">{value}</p></div>)}
        </div>
        <p className="mt-4 text-xs text-steel">Subject: {subject} · Site: {location}</p>
      </div>
    </div>
  );
}

function SimulationView({ retrofit, setRetrofit, simulation, loading, error, confidence, subject }: { retrofit: number; setRetrofit: (value: number) => void; simulation: SimResult | null; loading: boolean; error: string | null; confidence: number; subject: string }) {
  const metrics = simulation ? [
    ["Thermal load", simulation.proposed.thermalLoadKW, " kW"],
    ["Electrical power", simulation.proposed.electricalPowerKW, " kW"],
    ["Annual energy", simulation.proposed.annualEnergyKWh, " kWh"],
    ["Annual saving", simulation.delta.annualSavingINR, " INR"],
  ] as const : [];

  return (
    <div className="mt-8 space-y-6">
      <section className="border border-gold/30 bg-gold/5 p-5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Live what-if simulation</p>
        <h2 className="font-display mt-1 text-2xl text-paper">Change the retrofit and watch the physics respond.</h2>
        <p className="mt-2 text-sm leading-relaxed text-steel">Every slider movement calls the deterministic simulation endpoint. No fabricated percentage curve is used for the displayed engineering metrics.</p>
        <div className="mt-6 flex items-center gap-4"><input aria-label="Retrofit intensity" type="range" min={0} max={100} value={retrofit} onChange={(event) => setRetrofit(Number(event.target.value))} className="w-full accent-teal" /><span className="font-mono-num text-sm text-paper">{retrofit}%</span></div>
      </section>

      {error ? <div className="border border-clay/30 bg-clay/5 p-4 text-sm text-clay">{error}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, unit]) => <motion.div key={label} layout className="border border-steel/20 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</p><p className="mt-2 font-mono-num text-2xl text-paper">{loading ? "…" : `${value.toFixed(1)}${unit}`}</p></motion.div>)}
        {!simulation ? <div className="border border-steel/20 p-4 sm:col-span-2 lg:col-span-4 text-sm text-steel">{loading ? "Running physics simulation…" : "Waiting for a calibrated engineering state."}</div> : null}
      </div>

      {simulation ? <>
        <div className="grid gap-4 md:grid-cols-3">
          <ComparisonCard label="Baseline utilization" value={`${(simulation.baseline.utilization * 100).toFixed(1)}%`} />
          <ComparisonCard label="Proposed utilization" value={`${(simulation.proposed.utilization * 100).toFixed(1)}%`} />
          <ComparisonCard label="Energy delta" value={`${simulation.delta.savingPercent.toFixed(1)}%`} />
        </div>
        <div className="border border-steel/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Engineering verdict</p>
          <div className="mt-4 space-y-2">{simulation.verdict.length ? simulation.verdict.map((item) => <p key={item} className="text-sm text-paper">• {item}</p>) : <p className="text-sm text-steel">No additional deterministic verdict triggered by this scenario.</p>}</div>
          <p className="mt-4 text-xs text-steel">{subject} · intake confidence preview {confidence.toFixed(0)}% · engine deterministic-physics</p>
        </div>
      </> : null}
    </div>
  );
}

function DecisionView({ subject, goal, uncertainty, simulation }: { subject: string; goal: string; uncertainty: number; simulation: SimResult | null }) {
  const confidence = Math.max(38, 100 - uncertainty);
  const recommendation = simulation && simulation.delta.annualSavingINR > 0 ? "Run this retrofit first" : "Collect stronger operating evidence first";
  return (
    <div className="mt-8 space-y-6">
      <section className="border border-steel/20 p-5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Decision layer</p>
        <h2 className="font-display mt-1 text-2xl text-paper">What should happen first?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">Ranking should follow the validated simulation, not an arbitrary static order.</p>
      </section>
      <div className="space-y-3">
        {["Establish equipment / system identity", "Calibrate expected behaviour", "Simulate retrofit paths"].map((title, index) => <motion.article key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className={`border p-5 ${index === 0 ? "border-gold/60 bg-gold/5" : "border-steel/20"}`}><span className="font-mono-num text-xs text-steel">0{index + 1}</span><h3 className="mt-2 text-lg text-paper">{title}</h3><p className="mt-2 text-sm leading-relaxed text-steel">{index === 2 && simulation ? `${recommendation}. Modeled annual saving: ${simulation.delta.annualSavingINR.toFixed(0)} INR.` : index === 0 ? "Use nameplate, documentation, and visual evidence before assigning model-specific parameters." : "Separate climate, load, schedule, and controls effects from actual degradation."}</p></motion.article>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-3"><Panel label="Subject" value={subject} detail={goal.replaceAll("_", " ")} /><Panel label="Decision confidence" value={`${confidence}%`} detail="Frontend intake gate; numerical consequences remain deterministic." /><Panel label="Next output" value="Engineering report" detail="Observed → validated → recommended → sequenced" /></div>
    </div>
  );
}

function Panel({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="border border-steel/20 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</p><p className="mt-2 text-lg text-paper">{value}</p><p className="mt-1 text-xs leading-relaxed text-steel">{detail}</p></div>; }
function ComparisonCard({ label, value }: { label: string; value: string }) { return <div className="border border-steel/20 p-5"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</p><p className="mt-2 font-mono-num text-xl text-paper">{value}</p></div>; }
function StateRow({ done = false, label }: { done?: boolean; label: string }) { return <div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${done ? "bg-teal" : "border border-steel/40"}`} /><span>{label}</span></div>; }
