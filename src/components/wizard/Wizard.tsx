"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { IsometricBuilding } from "@/components/IsometricBuilding";
import { Chip, ProgressBar, TapCard } from "@/components/ui/TapCard";
import { HVAC_SYSTEM_LABELS, KW_PER_TON } from "@/lib/calculations/hvac";
import { type ReportedIssue } from "@/lib/calculations/ranking";
import { DEMO_NOTES, emptyWizard, loadDemo, type WizardInput } from "./types";

type Subject = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit" | "unknown";
type EvidenceKind = "camera" | "photo" | "document";

type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  file: File;
  previewUrl: string | null;
};

const STEPS = ["Target", "Evidence", "Context", "Review"] as const;

const GOALS: Array<{ value: Goal; label: string; detail: string }> = [
  { value: "energy", label: "Energy", detail: "Reduce consumption and operating cost" },
  { value: "performance", label: "Performance", detail: "Find underperformance against expected behaviour" },
  { value: "comfort", label: "Comfort", detail: "Improve thermal or operating conditions" },
  { value: "reliability", label: "Reliability", detail: "Find degradation, risk, or maintenance priorities" },
  { value: "retrofit", label: "Retrofit planning", detail: "Compare what to change and what to do first" },
  { value: "unknown", label: "Not sure", detail: "Let the assessment determine the priority" },
];

const ISSUES: Array<{ value: ReportedIssue; label: string }> = [
  { value: "high_bills", label: "High energy cost" },
  { value: "uneven_temp", label: "Uneven temperature" },
  { value: "frequent_cycling", label: "Frequent cycling" },
  { value: "poor_airflow", label: "Poor airflow" },
];

const HVAC_OPTIONS = Object.entries(HVAC_SYSTEM_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const SUBJECT_META: Record<Subject, { label: string; detail: string; prompt: string }> = {
  building: {
    label: "Building",
    detail: "Home, apartment, office, hospital, retail, school, or other structure",
    prompt: "Capture the building envelope, HVAC, and visible operating context.",
  },
  facility: {
    label: "Facility",
    detail: "Plant, factory, campus, warehouse, cold store, or multi-system site",
    prompt: "Capture the site plus the main energy and process assets that interact with it.",
  },
  equipment: {
    label: "Equipment",
    detail: "Chiller, compressor, pump, boiler, fan, motor, refrigeration, or other machinery",
    prompt: "Capture the equipment, nameplate, installation condition, and any available operating evidence.",
  },
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Wizard() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [data, setData] = useState<WizardInput>(emptyWizard);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = useCallback((partial: Partial<WizardInput>) => {
    setData((current) => ({ ...current, ...partial }));
  }, []);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next > STEPS.length - 1) return;
      setDir(next > step ? 1 : -1);
      setError(null);
      setNotice(null);
      setStep(next);
    },
    [step]
  );

  const addEvidence = useCallback((kind: EvidenceKind, files: FileList | null) => {
    if (!files?.length) return;
    const incoming: EvidenceItem[] = Array.from(files).map((file) => ({
      id: uid(),
      kind,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setEvidence((current) => [...current, ...incoming]);
    setNotice(`${incoming.length} evidence item${incoming.length === 1 ? "" : "s"} added.`);
  }, []);

  const removeEvidence = useCallback((id: string) => {
    setEvidence((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  useEffect(() => {
    return () => {
      evidence.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [evidence]);

  const onDemo = () => {
    setData(loadDemo());
    setSubject("building");
    setGoal("energy");
    setEvidence([]);
    setError(null);
    setNotice("Demo model loaded. You can still add real evidence before continuing.");
    go(1);
  };

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(subject && goal);
    if (step === 1) return evidence.length > 0;
    return true;
  }, [evidence.length, goal, step, subject]);

  const submit = async () => {
    if (!subject || !goal) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const payload: WizardInput = {
        ...data,
        hvacUnknown: data.hvacSystemType === "dont_know",
        capacityTons:
          data.capacityUnit === "tons" ? data.capacityValue : data.capacityValue / KW_PER_TON,
      };

      const formData = new FormData();
      formData.append("subject", subject);
      formData.append("goal", goal);
      formData.append("payload", JSON.stringify(payload));
      evidence.forEach((item) => formData.append("evidence", item.file, item.file.name));

      if (subject === "building") {
        const res = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Engineering calculation failed");
        sessionStorage.setItem(
          "overhaul:result",
          JSON.stringify({
            ...json,
            assessmentSubject: subject,
            assessmentGoal: goal,
            evidenceCount: evidence.length,
          })
        );
        router.push("/results");
        return;
      }

      sessionStorage.setItem(
        "overhaul:assessment",
        JSON.stringify({
          assessmentSubject: subject,
          assessmentGoal: goal,
          evidence: evidence.map((item) => ({
            id: item.id,
            kind: item.kind,
            name: item.file.name,
            type: item.file.type,
            size: item.file.size,
          })),
          payload,
          evidenceReady: true,
          analysisStatus: "awaiting-engineering-analysis",
        })
      );
      setNotice(
        `${SUBJECT_META[subject].label} evidence package is ready. Engineering analysis is the next layer.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const modeLabel = subject ? SUBJECT_META[subject].label : "Assessment";

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-16 pt-8 sm:px-6">
      <ProgressBar step={step} total={STEPS.length} />

      <header className="mt-8 flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-steel">Evidence-first engineering intelligence</p>
          <h1 className="font-display mt-2 text-4xl tracking-tight text-paper sm:text-5xl">Overhaul</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-steel">
            Build the smallest defensible model from photos, scans, documents, and a few basic facts — then let the engineering layer determine what matters.
          </p>
          {subject && goal ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip selected>{modeLabel}</Chip>
              <Chip selected>{GOALS.find((item) => item.value === goal)?.label ?? "Assessment"}</Chip>
              <Chip selected>{evidence.length} evidence</Chip>
            </div>
          ) : null}
        </div>
        <IsometricBuilding className="hidden h-28 w-36 text-steel/70 sm:block" />
      </header>

      <div className="mt-8">
        <div className="flex items-center justify-between border-y border-steel/20 py-3">
          <div className="flex gap-4 overflow-x-auto">
            {STEPS.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => index <= step && go(index)}
                className={`shrink-0 text-[11px] uppercase tracking-[0.14em] ${index === step ? "text-teal" : index < step ? "text-paper" : "text-steel/50"}`}
              >
                {String(index + 1).padStart(2, "0")} {name}
              </button>
            ))}
          </div>
          <span className="hidden text-[11px] text-steel sm:block">{step + 1}/{STEPS.length}</span>
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.section
          key={step}
          custom={dir}
          initial={{ x: dir > 0 ? 32 : -32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir > 0 ? -32 : 32, opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="mt-8 flex-1"
        >
          {step === 0 ? (
            <TargetStep
              subject={subject}
              goal={goal}
              onSubject={(value) => {
                setSubject(value);
                setGoal(null);
                setEvidence([]);
              }}
              onGoal={setGoal}
              onDemo={onDemo}
            />
          ) : null}

          {step === 1 ? (
            <EvidenceStep
              subject={subject}
              evidence={evidence}
              cameraInputRef={cameraInputRef}
              photoInputRef={photoInputRef}
              documentInputRef={documentInputRef}
              onFiles={(kind, files) => addEvidence(kind, files)}
              onRemove={removeEvidence}
            />
          ) : null}

          {step === 2 ? (
            <ContextStep
              subject={subject}
              data={data}
              patch={patch}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
            />
          ) : null}

          {step === 3 ? (
            <ReviewStep
              subject={subject}
              goal={goal}
              evidence={evidence}
              data={data}
              onJump={go}
            />
          ) : null}
        </motion.section>
      </AnimatePresence>

      {notice ? (
        <div className="mt-5 border border-teal/30 bg-teal/5 px-4 py-3 text-sm text-teal">{notice}</div>
      ) : null}
      {error ? (
        <div className="mt-5 border border-clay/40 bg-clay/5 px-4 py-3 text-sm leading-relaxed text-clay">{error}</div>
      ) : null}

      <footer className="mt-10 flex items-center justify-between border-t border-steel/20 pt-6">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => go(step - 1)}
          className="text-sm text-steel disabled:opacity-25"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canNext}
            onClick={() => go(step + 1)}
            className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal transition-colors hover:bg-teal/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !subject || !goal || evidence.length === 0}
            onClick={() => void submit()}
            className="border border-gold bg-gold/10 px-5 py-2.5 text-sm text-gold transition-colors hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? "Building model…" : subject === "building" ? "Run Engineering Assessment" : "Build Assessment Package"}
          </button>
        )}
      </footer>
    </main>
  );
}

function TargetStep({
  subject,
  goal,
  onSubject,
  onGoal,
  onDemo,
}: {
  subject: Subject | null;
  goal: Goal | null;
  onSubject: (value: Subject) => void;
  onGoal: (value: Goal) => void;
  onDemo: () => void;
}) {
  return (
    <div className="space-y-10">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Start with the thing that needs improvement</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">What are we assessing?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          Overhaul is not a building-only calculator. Choose the subject and the system will collect evidence appropriate to it.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(SUBJECT_META).map(([value, meta]) => {
          const typedValue = value as Subject;
          return (
            <TapCard
              key={typedValue}
              selected={subject === typedValue}
              onClick={() => onSubject(typedValue)}
              title={meta.label}
              subtitle={meta.detail}
            >
              <div className="mt-5 border-t border-steel/15 pt-4 text-xs leading-relaxed text-steel">{meta.prompt}</div>
            </TapCard>
          );
        })}
      </div>

      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Desired outcome</p>
        <h3 className="mt-2 text-lg text-paper">What are you trying to improve?</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GOALS.map((item) => (
            <TapCard
              key={item.value}
              selected={goal === item.value}
              onClick={() => onGoal(item.value)}
              title={item.label}
              subtitle={item.detail}
            />
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onDemo}
        className="border border-gold/50 px-4 py-2.5 text-[11px] uppercase tracking-[0.15em] text-gold hover:bg-gold/10"
      >
        Load Demo Example
      </button>
      <p className="-mt-5 text-xs text-steel/75">{DEMO_NOTES}</p>
    </div>
  );
}

function EvidenceStep({
  subject,
  evidence,
  cameraInputRef,
  photoInputRef,
  documentInputRef,
  onFiles,
  onRemove,
}: {
  subject: Subject | null;
  evidence: EvidenceItem[];
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  documentInputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (kind: EvidenceKind, files: FileList | null) => void;
  onRemove: (id: string) => void;
}) {
  const subjectLabel = subject ? SUBJECT_META[subject].label : "asset";

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Evidence before questions</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">Show Overhaul what exists.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          Start with what is easy to capture. AI can extract labels, components, geometry, condition cues, and documents later; the engineering layer will decide what still needs verification.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <EvidenceAction
          title="Camera / scan"
          detail={`Capture ${subjectLabel} from several angles`}
          button="Open camera"
          onClick={() => cameraInputRef.current?.click()}
        />
        <EvidenceAction
          title="Photos"
          detail="Add existing photos of equipment, systems, rooms, or installation"
          button="Choose photos"
          onClick={() => photoInputRef.current?.click()}
        />
        <EvidenceAction
          title="Documents"
          detail="Nameplates, manuals, invoices, bills, BMS exports, maintenance records"
          button="Add documents"
          onClick={() => documentInputRef.current?.click()}
        />
      </div>

      <input ref={cameraInputRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => onFiles("camera", event.target.files)} />
      <input ref={photoInputRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => onFiles("photo", event.target.files)} />
      <input ref={documentInputRef} className="hidden" type="file" accept="image/*,.pdf,.csv,.txt,.doc,.docx,.xls,.xlsx" multiple onChange={(event) => onFiles("document", event.target.files)} />

      <section className="border border-steel/20">
        <div className="flex items-center justify-between border-b border-steel/20 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Evidence tray</p>
            <p className="mt-1 text-sm text-paper">{evidence.length} item{evidence.length === 1 ? "" : "s"} collected</p>
          </div>
          <span className="text-xs text-steel">No technical form-filling required</span>
        </div>

        {evidence.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-paper">Add at least one piece of evidence to continue.</p>
            <p className="mt-2 text-xs text-steel">A nameplate photo is often more useful than asking you to type model, capacity, and efficiency separately.</p>
          </div>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {evidence.map((item) => (
              <div key={item.id} className="flex gap-3 border border-steel/15 bg-paper/[0.02] p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden border border-steel/15 bg-steel/5">
                  {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.12em] text-steel">FILE</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-paper">{item.file.name}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-steel">{item.kind} · {formatBytes(item.file.size)}</p>
                  <button type="button" onClick={() => onRemove(item.id)} className="mt-3 text-xs text-clay hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EvidenceAction({
  title,
  detail,
  button,
  onClick,
}: {
  title: string;
  detail: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className="border border-steel/20 p-4">
      <p className="text-sm font-medium text-paper">{title}</p>
      <p className="mt-2 min-h-12 text-xs leading-relaxed text-steel">{detail}</p>
      <button type="button" onClick={onClick} className="mt-4 w-full border border-teal/50 bg-teal/5 px-3 py-2 text-xs text-teal hover:bg-teal/10">{button}</button>
    </div>
  );
}

function ContextStep({
  subject,
  data,
  patch,
  showAdvanced,
  setShowAdvanced,
}: {
  subject: Subject | null;
  data: WizardInput;
  patch: (partial: Partial<WizardInput>) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
}) {
  const [query, setQuery] = useState(data.locationLabel);
  const [results, setResults] = useState<Array<{ id: number; label: string; latitude: number; longitude: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const json = await response.json();
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const locationRequired = subject !== "equipment";

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Minimum context</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">Give the model only what changes the physics.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          Most technical parameters stay hidden until evidence proves they matter. This step only establishes context that affects climate, operating conditions, or the initial engineering model.
        </p>
      </section>

      {locationRequired ? (
        <section className="space-y-3">
          <label className="text-[10px] uppercase tracking-[0.16em] text-steel">Location</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, region, site, or address"
            className="w-full border border-steel/25 bg-transparent px-4 py-3 text-sm text-paper outline-none placeholder:text-steel/50 focus:border-teal"
          />
          {loading ? <p className="text-xs text-steel">Looking up location…</p> : null}
          {results.length > 0 ? (
            <div className="border border-steel/20">
              {results.slice(0, 5).map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    setQuery(result.label);
                    patch({ locationLabel: result.label, latitude: result.latitude, longitude: result.longitude });
                    setResults([]);
                  }}
                  className="block w-full border-b border-steel/10 px-4 py-3 text-left text-sm text-paper last:border-b-0 hover:bg-teal/5"
                >
                  {result.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <div className="border border-teal/25 bg-teal/5 px-4 py-4 text-sm leading-relaxed text-steel">
          A standalone equipment assessment does not require a building location to identify the asset. Location can still be added later when it affects climate or operating comparison.
        </div>
      )}

      {subject === "equipment" ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <TapCard selected={data.hvacSystemType !== "dont_know"} onClick={() => patch({ hvacSystemType: data.hvacSystemType === "dont_know" ? "split_ac" : data.hvacSystemType })} title="I know the equipment type" subtitle="Useful, but not required if the evidence contains a nameplate." />
          <TapCard selected={data.hvacSystemType === "dont_know"} onClick={() => patch({ hvacSystemType: "dont_know", hvacUnknown: true })} title="I don't know" subtitle="Leave identification to the evidence pipeline." />
        </section>
      ) : null}

      {subject === "building" ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Approximate floor area" value={String(data.floorAreaM2)} suffix="m²" onChange={(value) => patch({ floorAreaM2: Number(value) || 0 })} />
          <div>
            <label className="text-[10px] uppercase tracking-[0.16em] text-steel">Building type</label>
            <select value={data.buildingType} onChange={(event) => patch({ buildingType: event.target.value as WizardInput["buildingType"] })} className="mt-2 w-full border border-steel/25 bg-transparent px-3 py-3 text-sm text-paper outline-none focus:border-teal">
              <option className="bg-black" value="home">Home</option>
              <option className="bg-black" value="office">Office</option>
              <option className="bg-black" value="mixed">Mixed-use</option>
            </select>
          </div>
        </section>
      ) : null}

      <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-steel hover:text-paper">
        {showAdvanced ? "Hide technical context" : "Show optional technical context"}
      </button>

      {showAdvanced ? (
        <section className="space-y-5 border-t border-steel/15 pt-5">
          <p className="text-xs leading-relaxed text-steel">Only enter values you actually know. Unknowns remain unknown and should be requested later only when they can change the decision.</p>
          {subject !== "equipment" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase tracking-[0.16em] text-steel">HVAC type</label>
                <select value={data.hvacSystemType} onChange={(event) => patch({ hvacSystemType: event.target.value as WizardInput["hvacSystemType"] })} className="mt-2 w-full border border-steel/25 bg-transparent px-3 py-3 text-sm text-paper outline-none focus:border-teal">
                  {HVAC_OPTIONS.map((option) => <option key={option.value} className="bg-black" value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <Field label="Rated capacity" value={String(data.capacityValue)} suffix={data.capacityUnit} onChange={(value) => patch({ capacityValue: Number(value) || 0 })} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value, suffix, onChange }: { label: string; value: string; suffix?: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</label>
      <div className="mt-2 flex border border-steel/25 focus-within:border-teal">
        <input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-paper outline-none" />
        {suffix ? <span className="border-l border-steel/15 px-3 py-3 text-xs text-steel">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ReviewStep({
  subject,
  goal,
  evidence,
  data,
  onJump,
}: {
  subject: Subject | null;
  goal: Goal | null;
  evidence: EvidenceItem[];
  data: WizardInput;
  onJump: (step: number) => void;
}) {
  const goalLabel = GOALS.find((item) => item.value === goal)?.label ?? "Assessment";
  const photoCount = evidence.filter((item) => item.kind !== "document").length;
  const documentCount = evidence.filter((item) => item.kind === "document").length;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Model intake</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">Ready to build the assessment?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          This is a provenance-first handoff. Captured evidence becomes observations; observations become structured parameters; only validated parameters should drive engineering calculations.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard title="Target" value={subject ? SUBJECT_META[subject].label : "Not selected"} detail={subject ? SUBJECT_META[subject].detail : "Choose a target first"} onClick={() => onJump(0)} />
        <SummaryCard title="Goal" value={goalLabel} detail="The optimization objective for ranking" onClick={() => onJump(0)} />
        <SummaryCard title="Evidence" value={`${evidence.length} item${evidence.length === 1 ? "" : "s"}`} detail={`${photoCount} photo/scan · ${documentCount} document${documentCount === 1 ? "" : "s"}`} onClick={() => onJump(1)} />
        <SummaryCard title="Context" value={data.locationLabel || (subject === "equipment" ? "Standalone asset" : "Location pending")} detail={subject === "building" ? `${Math.round(data.floorAreaM2 || 0)} m² initial area` : "Only known values are used"} onClick={() => onJump(2)} />
      </div>

      <section className="border border-gold/25 bg-gold/5 px-4 py-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gold">What happens next</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["01", "Extract", "AI reads the evidence"],
            ["02", "Structure", "Observations become parameters"],
            ["03", "Validate", "Physics/data checks the values"],
            ["04", "Decide", "Retrofit options are ranked"],
          ].map(([number, title, detail]) => (
            <div key={number}>
              <div className="font-mono-num text-xs text-gold">{number}</div>
              <div className="mt-1 text-sm text-paper">{title}</div>
              <div className="mt-1 text-xs leading-relaxed text-steel">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-steel">
        Unsupported values will not be silently invented. A missing parameter should become a targeted evidence request only when it could change the recommendation.
      </p>
    </div>
  );
}

function SummaryCard({ title, value, detail, onClick }: { title: string; value: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="border border-steel/20 p-4 text-left hover:border-steel/40">
      <p className="text-[10px] uppercase tracking-[0.16em] text-steel">{title}</p>
      <p className="mt-2 text-base text-paper">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-steel">{detail}</p>
    </button>
  );
}
