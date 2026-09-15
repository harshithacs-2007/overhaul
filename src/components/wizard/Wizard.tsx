"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { IsometricBuilding } from "@/components/IsometricBuilding";
import {
  Chip,
  ProgressBar,
  TapCard,
} from "@/components/ui/TapCard";
import { HVAC_SYSTEM_LABELS, KW_PER_TON } from "@/lib/calculations/hvac";
import { type ReportedIssue } from "@/lib/calculations/ranking";
import {
  DEMO_NOTES,
  emptyWizard,
  loadDemo,
  type WizardInput,
} from "./types";

type Subject = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit" | "unknown";
type EvidenceKind = "camera" | "photo" | "document";

const STEPS = ["Target", "Evidence", "Context", "Review"] as const;

const GOALS: Array<{ value: Goal; label: string; detail: string }> = [
  { value: "energy", label: "Energy", detail: "Reduce consumption and operating cost" },
  { value: "performance", label: "Performance", detail: "Find underperformance against expected behaviour" },
  { value: "comfort", label: "Comfort", detail: "Improve thermal or operating conditions" },
  { value: "reliability", label: "Reliability", detail: "Find degradation and failure risk" },
  { value: "retrofit", label: "Retrofit", detail: "Compare upgrade paths and sequence" },
  { value: "unknown", label: "Not sure", detail: "Let the assessment determine the priority" },
];

const SUBJECTS: Array<{ value: Subject; label: string; detail: string }> = [
  { value: "building", label: "Building", detail: "Home, apartment, office, hospital, retail, school" },
  { value: "facility", label: "Facility", detail: "Factory, plant, campus, warehouse, cold storage" },
  { value: "equipment", label: "Equipment", detail: "Chiller, compressor, pump, boiler, motor, machine" },
];

const ISSUE_OPTIONS: Array<{ id: string; label: string; issue: ReportedIssue | null }> = [
  { id: "high_bill", label: "High energy bill", issue: "high_bills" },
  { id: "poor_cooling", label: "Poor cooling / heating", issue: null },
  { id: "hotspots", label: "Hot or uncomfortable zones", issue: "uneven_temp" },
  { id: "noise", label: "Unusual noise / vibration", issue: null },
  { id: "aging", label: "Aging equipment", issue: null },
  { id: "frequent_faults", label: "Frequent faults / maintenance", issue: null },
  { id: "capacity", label: "Capacity concern", issue: null },
  { id: "none", label: "Nothing obvious", issue: null },
];

const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  camera: "Live scan",
  photo: "Photos",
  document: "Documents",
};

function useDebounced<T>(value: T, ms: number): T {
  const [next, setNext] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setNext(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return next;
}

export function Wizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [data, setData] = useState<WizardInput>(emptyWizard);
  const [evidenceKinds, setEvidenceKinds] = useState<EvidenceKind[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [issues, setIssues] = useState<ReportedIssue[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<Array<{ id: number; label: string; latitude: number; longitude: number }>>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedLocation = useDebounced(locationQuery, 300);

  useEffect(() => {
    let cancelled = false;
    async function findLocation() {
      if (debouncedLocation.trim().length < 2) {
        setLocationResults([]);
        return;
      }
      setLocationLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(debouncedLocation.trim())}`);
        const json = await response.json();
        if (!cancelled) setLocationResults(Array.isArray(json.results) ? json.results : []);
      } catch {
        if (!cancelled) setLocationResults([]);
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }
    void findLocation();
    return () => {
      cancelled = true;
    };
  }, [debouncedLocation]);

  const patch = useCallback((partial: Partial<WizardInput>) => {
    setData((current) => ({ ...current, ...partial }));
  }, []);

  const move = useCallback((next: number) => {
    setDirection(next >= step ? 1 : -1);
    setStep(next);
    setError(null);
  }, [step]);

  const toggleEvidence = (kind: EvidenceKind) => {
    setEvidenceKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  };

  const toggleIssue = (option: (typeof ISSUE_OPTIONS)[number]) => {
    if (option.id === "none") {
      setIssues((current) => current.length === 0 ? [] : []);
      return;
    }
    if (!option.issue) return;
    setIssues((current) => current.includes(option.issue as ReportedIssue) ? current.filter((item) => item !== option.issue) : [...current, option.issue as ReportedIssue]);
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setEvidenceFiles((current) => [...current, ...Array.from(files)].slice(0, 12));
    if (!evidenceKinds.includes("photo")) setEvidenceKinds((current) => [...current, "photo"]);
  };

  const loadExample = () => {
    setData(loadDemo());
    setSubject("building");
    setGoal("energy");
    setLocationQuery("Bengaluru, India");
    setEvidenceKinds(["photo", "document"]);
    setIssues(["high_bills"]);
    setError(null);
    move(1);
  };

  const canContinue = () => {
    if (step === 0) return Boolean(subject && goal);
    if (step === 1) {
      if (subject === "equipment") return evidenceFiles.length > 0 || evidenceKinds.length > 0;
      return Boolean(data.locationLabel && Number.isFinite(data.latitude) && Number.isFinite(data.longitude));
    }
    return true;
  };

  const analyse = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (subject !== "building") {
        setError("The evidence model is ready for this subject. The equipment/facility engineering backend is the next build step, so no unsupported result is fabricated here.");
        return;
      }

      const payload: WizardInput = {
        ...data,
        reportedIssues: issues,
        hvacUnknown: data.hvacSystemType === "dont_know",
        capacityTons: data.capacityUnit === "tons" ? data.capacityValue : data.capacityValue / KW_PER_TON,
      };

      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Calculation failed");

      sessionStorage.setItem("overhaul:result", JSON.stringify({
        ...json,
        assessmentSubject: subject,
        assessmentGoal: goal,
        evidenceCount: evidenceFiles.length,
        evidenceKinds,
      }));
      router.push("/results");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const subjectLabel = subject ? SUBJECTS.find((item) => item.value === subject)?.label : "Assessment";
  const goalLabel = goal ? GOALS.find((item) => item.value === goal)?.label : null;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-16 pt-8 sm:px-6">
      <ProgressBar step={step} total={STEPS.length} />

      <header className="mt-8 flex items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Evidence-first engineering intelligence</p>
          <h1 className="font-display mt-2 text-4xl tracking-tight text-paper sm:text-5xl">Overhaul</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel">
            Show OVERHAUL what you are working with. It builds the engineering model from evidence first, then asks only for information that can change the decision.
          </p>
          {subject ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip selected>{subjectLabel}</Chip>
              {goalLabel ? <Chip selected>{goalLabel}</Chip> : null}
              {evidenceFiles.length > 0 ? <Chip selected>{evidenceFiles.length} evidence file{evidenceFiles.length === 1 ? "" : "s"}</Chip> : null}
            </div>
          ) : null}
        </div>
        <IsometricBuilding className="hidden h-28 w-36 text-steel/70 sm:block" />
      </header>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((label, index) => (
          <div key={label} className={`shrink-0 border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] ${index === step ? "border-teal text-teal" : index < step ? "border-steel/30 text-steel" : "border-steel/15 text-steel/45"}`}>
            {String(index + 1).padStart(2, "0")} · {label}
          </div>
        ))}
      </div>

      <div className="mt-8 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {step === 0 ? <TargetStep subject={subject} goal={goal} onSubject={(value) => { setSubject(value); setGoal(null); }} onGoal={setGoal} onDemo={loadExample} /> : null}
            {step === 1 ? <EvidenceStep subject={subject} data={data} patch={patch} locationQuery={locationQuery} setLocationQuery={setLocationQuery} locationResults={locationResults} locationLoading={locationLoading} evidenceKinds={evidenceKinds} toggleEvidence={toggleEvidence} onFiles={onFiles} fileCount={evidenceFiles.length} /> : null}
            {step === 2 ? <ContextStep subject={subject} data={data} patch={patch} issues={issues} toggleIssue={toggleIssue} /> : null}
            {step === 3 ? <ReviewStep subject={subject} goal={goal} data={data} evidenceKinds={evidenceKinds} fileCount={evidenceFiles.length} issues={issues} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {step === 0 ? <p className="mt-4 text-xs text-steel/75">{DEMO_NOTES}</p> : null}
      {error ? <div className="mt-5 border border-clay/40 px-4 py-3 text-sm leading-relaxed text-clay">{error}</div> : null}

      <footer className="mt-10 flex items-center justify-between border-t border-steel/20 pt-6">
        <button type="button" disabled={step === 0 || submitting} onClick={() => move(step - 1)} className="text-sm text-steel disabled:opacity-25">Back</button>
        {step < STEPS.length - 1 ? <button type="button" disabled={!canContinue()} onClick={() => move(step + 1)} className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal disabled:opacity-35">Continue</button> : <button type="button" disabled={submitting} onClick={() => void analyse()} className="border border-gold bg-gold/10 px-5 py-2.5 text-sm text-gold disabled:opacity-35">{submitting ? "Building model…" : "Build Engineering Assessment"}</button>}
      </footer>
    </main>
  );
}

function TargetStep({ subject, goal, onSubject, onGoal, onDemo }: { subject: Subject | null; goal: Goal | null; onSubject: (value: Subject) => void; onGoal: (value: Goal) => void; onDemo: () => void; }) {
  return (
    <section className="space-y-10">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Step 01</p>
        <h2 className="font-display mt-1 text-2xl text-paper">What are you assessing?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">Choose the actual subject. A machine can be assessed independently; a facility can contain buildings and equipment together.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {SUBJECTS.map((item) => <TapCard key={item.value} selected={subject === item.value} onClick={() => onSubject(item.value)} title={item.label} subtitle={item.detail}><div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-steel/70"><span>{item.value === "equipment" ? "Asset-level" : item.value === "facility" ? "Site-level" : "Structure-level"}</span><span>{subject === item.value ? "Selected" : "Select"}</span></div></TapCard>)}
      </div>
      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><p className="text-[10px] uppercase tracking-[0.18em] text-steel">Decision target</p><h3 className="mt-1 text-lg text-paper">What do you need to know?</h3></div>
          <button type="button" onClick={onDemo} className="border border-gold/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-gold hover:bg-gold/10">Load Demo</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GOALS.map((item) => <TapCard key={item.value} selected={goal === item.value} onClick={() => onGoal(item.value)} title={item.label} subtitle={item.detail} />)}
        </div>
      </div>
    </section>
  );
}

function EvidenceStep({ subject, data, patch, locationQuery, setLocationQuery, locationResults, locationLoading, evidenceKinds, toggleEvidence, onFiles, fileCount }: { subject: Subject | null; data: WizardInput; patch: (partial: Partial<WizardInput>) => void; locationQuery: string; setLocationQuery: (value: string) => void; locationResults: Array<{ id: number; label: string; latitude: number; longitude: number }>; locationLoading: boolean; evidenceKinds: EvidenceKind[]; toggleEvidence: (kind: EvidenceKind) => void; onFiles: (files: FileList | null) => void; fileCount: number; }) {
  return (
    <section className="space-y-8">
      <div><p className="text-[10px] uppercase tracking-[0.18em] text-steel">Step 02</p><h2 className="font-display mt-1 text-2xl text-paper">Give it evidence, not homework.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">Start with a scan, a few photos, or documents. OVERHAUL should extract names, dimensions, materials, labels, condition cues and context before asking technical questions.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        {(["camera", "photo", "document"] as EvidenceKind[]).map((kind) => <TapCard key={kind} selected={evidenceKinds.includes(kind)} onClick={() => toggleEvidence(kind)} title={EVIDENCE_LABELS[kind]} subtitle={kind === "camera" ? "Use the camera for fast spatial context" : kind === "photo" ? "Equipment, rooms, panels, roofs, nameplates" : "Bills, manuals, drawings, maintenance records"}><div className="mt-5 text-[10px] uppercase tracking-[0.14em] text-steel">{evidenceKinds.includes(kind) ? "Queued" : "Available"}</div></TapCard>)}
      </div>
      <label className="block cursor-pointer border border-dashed border-steel/35 p-6 transition-colors hover:border-steel/60"><input className="sr-only" type="file" accept="image/*,.pdf,.txt,.csv" multiple onChange={(event) => { onFiles(event.target.files); event.currentTarget.value = ""; }} /><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-paper">Drop evidence here or choose files</p><p className="mt-1 text-xs text-steel">Start with one image. Add more only when needed.</p></div><span className="text-[10px] uppercase tracking-[0.15em] text-teal">{fileCount} selected</span></div></label>
      {subject !== "equipment" ? <div><label className="text-[10px] uppercase tracking-[0.16em] text-steel">Site / location</label><input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="City, address, or facility location" className="mt-2 w-full border border-steel/30 bg-transparent px-4 py-3 text-sm text-paper outline-none placeholder:text-steel/50 focus:border-teal" />{locationLoading ? <p className="mt-2 text-xs text-steel">Resolving climate context…</p> : null}{locationResults.length > 0 ? <div className="mt-2 overflow-hidden border border-steel/25">{locationResults.slice(0, 5).map((item) => <button key={item.id} type="button" onClick={() => { patch({ locationLabel: item.label, latitude: item.latitude, longitude: item.longitude }); setLocationQuery(item.label); }} className="block w-full border-b border-steel/15 px-4 py-3 text-left text-xs text-steel last:border-b-0 hover:bg-teal/5 hover:text-paper">{item.label}</button>)}</div> : null}{data.locationLabel ? <p className="mt-2 text-[11px] text-teal">Climate context locked to {data.locationLabel}</p> : null}</div> : <div className="border border-steel/20 bg-steel/5 p-4"><p className="text-sm text-paper">Equipment can be assessed without a site address.</p><p className="mt-1 text-xs leading-relaxed text-steel">Location becomes useful later when outdoor conditions, connected systems, operating profile, or service environment can affect the diagnosis.</p></div>}
    </section>
  );
}

function ContextStep({ subject, data, patch, issues, toggleIssue }: { subject: Subject | null; data: WizardInput; patch: (partial: Partial<WizardInput>) => void; issues: ReportedIssue[]; toggleIssue: (option: (typeof ISSUE_OPTIONS)[number]) => void; }) {
  const isEquipment = subject === "equipment";
  const isFacility = subject === "facility";
  return (
    <section className="space-y-8">
      <div><p className="text-[10px] uppercase tracking-[0.18em] text-steel">Step 03</p><h2 className="font-display mt-1 text-2xl text-paper">Only the context that changes the answer.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">Everything else stays inferred, measured, or explicitly unknown. You do not need to know engineering terminology.</p></div>
      {isEquipment ? <div className="grid gap-3 sm:grid-cols-2"><Field label="Equipment family"><select value={data.hvacSystemType} onChange={(event) => patch({ hvacSystemType: event.target.value as WizardInput["hvacSystemType"] })} className="field-input"><option value="dont_know">I don't know</option>{Object.entries(HVAC_SYSTEM_LABELS).filter(([value]) => value !== "dont_know").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Rated capacity, when known"><div className="flex gap-2"><input type="number" min={0} step="0.1" value={data.capacityValue} onChange={(event) => patch({ capacityValue: Number(event.target.value) || 0 })} className="field-input" /><select value={data.capacityUnit} onChange={(event) => patch({ capacityUnit: event.target.value as WizardInput["capacityUnit"] })} className="w-24 border border-steel/30 bg-transparent px-3 py-2 text-sm text-paper outline-none focus:border-teal"><option value="tons">tons</option><option value="kW">kW</option></select></div></Field><Field label="Typical operating zones"><select value={data.zoning} onChange={(event) => patch({ zoning: event.target.value as WizardInput["zoning"] })} className="field-input"><option value="single">Single zone</option><option value="multiple">Multiple zones</option></select></Field></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label={isFacility ? "Approximate conditioned area" : "Approximate floor area"}><div className="flex gap-2"><input type="number" min={1} value={data.floorAreaM2} onChange={(event) => patch({ floorAreaM2: Number(event.target.value) || 1 })} className="field-input" /><span className="flex items-center border border-steel/15 px-3 text-xs text-steel">m²</span></div></Field><Field label="Building / site type"><select value={data.buildingType} onChange={(event) => patch({ buildingType: event.target.value as WizardInput["buildingType"] })} className="field-input"><option value="home">Home / residential</option><option value="office">Office / commercial</option><option value="mixed">Mixed / other</option></select></Field><Field label="Air movement"><select value={data.ventilation} onChange={(event) => patch({ ventilation: event.target.value as WizardInput["ventilation"] })} className="field-input"><option value="natural">Mostly natural</option><option value="mechanical">Mechanical ventilation</option></select></Field></div>}
      <div><div className="mb-3"><p className="text-[10px] uppercase tracking-[0.16em] text-steel">Observed symptoms</p><p className="mt-1 text-xs text-steel">Select what is actually happening. These are evidence signals, not diagnosis.</p></div><div className="flex flex-wrap gap-2">{ISSUE_OPTIONS.map((option) => <Chip key={option.id} selected={option.issue ? issues.includes(option.issue) : option.id === "none" && issues.length === 0} onClick={() => toggleIssue(option)}>{option.label}</Chip>)}</div></div>
      <div className="border border-steel/20 p-4"><p className="text-xs text-steel">Unknown is valid. OVERHAUL must not invent a machine age, efficiency, refrigerant, internal fault, or measured performance.</p></div>
    </section>
  );
}

function ReviewStep({ subject, goal, data, evidenceKinds, fileCount, issues }: { subject: Subject | null; goal: Goal | null; data: WizardInput; evidenceKinds: EvidenceKind[]; fileCount: number; issues: ReportedIssue[]; }) {
  const subjectText = SUBJECTS.find((item) => item.value === subject)?.label ?? "Not selected";
  const goalText = GOALS.find((item) => item.value === goal)?.label ?? "Not selected";
  const issueText = issues.length ? issues.map((issue) => ISSUE_OPTIONS.find((item) => item.issue === issue)?.label ?? issue).join(", ") : "None reported";
  return (
    <section className="space-y-8">
      <div><p className="text-[10px] uppercase tracking-[0.18em] text-steel">Step 04</p><h2 className="font-display mt-1 text-2xl text-paper">Ready to build the model.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">Evidence becomes a structured asset model with confidence and provenance before the engineering layer runs.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><Summary label="Assessment" value={subjectText} /><Summary label="Decision target" value={goalText} /><Summary label="Evidence" value={`${fileCount} file${fileCount === 1 ? "" : "s"} · ${evidenceKinds.length} source type${evidenceKinds.length === 1 ? "" : "s"}`} /><Summary label="Observed symptoms" value={issueText} /><Summary label="Location" value={subject === "equipment" ? "Not required initially" : data.locationLabel || "Not locked"} /><Summary label="Manual inputs" value="Minimal · unresolved variables remain explicit" /></div>
      <div className="border border-teal/25 bg-teal/5 p-5"><p className="text-sm text-paper">Assessment chain</p><p className="mt-2 text-xs leading-relaxed text-steel">Evidence → AI extraction → confidence/provenance → digital shadow → expected vs observed → engineering validation → retrofit simulation → ranked action sequence.</p></div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</span><div className="mt-2">{children}</div></label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/20 p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-steel">{label}</p><p className="mt-2 text-sm leading-relaxed text-paper">{value}</p></div>;
}
