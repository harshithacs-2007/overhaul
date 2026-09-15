"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { IsometricBuilding } from "@/components/IsometricBuilding";
import { Chip, ProgressBar, TapCard } from "@/components/ui/TapCard";
import { HVAC_SYSTEM_LABELS, KW_PER_TON } from "@/lib/calculations/hvac";
import type { ReportedIssue } from "@/lib/calculations/ranking";
import { DEMO_NOTES, emptyWizard, loadDemo, type WizardInput } from "./types";

type Subject = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit" | "unknown";
type EvidenceKind = "scan" | "photo" | "document";

type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  file: File;
  previewUrl: string | null;
};

type LocationResult = {
  id: number;
  label: string;
  latitude: number;
  longitude: number;
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

const SUBJECT_META: Record<Subject, { label: string; detail: string; prompt: string }> = {
  building: {
    label: "Building",
    detail: "Home, apartment, office, hospital, retail, school, or other structure",
    prompt: "Capture the envelope, HVAC, occupied spaces, and visible operating context.",
  },
  facility: {
    label: "Facility",
    detail: "Plant, factory, campus, warehouse, cold store, or multi-system site",
    prompt: "Capture the site plus the major energy and process assets that interact with it.",
  },
  equipment: {
    label: "Equipment",
    detail: "Chiller, compressor, pump, boiler, fan, motor, refrigeration, or other machinery",
    prompt: "Capture the equipment, nameplate, installation condition, and any available operating evidence.",
  },
};

const EQUIPMENT_CLASSES = [
  "Chiller",
  "Compressor",
  "Pump",
  "Boiler",
  "Cooling tower",
  "Fan / motor",
  "Refrigeration",
  "Process equipment",
  "Other machinery",
] as const;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function labelForSubject(subject: Subject | null) {
  return subject ? SUBJECT_META[subject].label : "Assessment";
}

export function Wizard() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [data, setData] = useState<WizardInput>(emptyWizard);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = useCallback((partial: Partial<WizardInput>) => {
    setData((current) => ({ ...current, ...partial }));
  }, []);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= STEPS.length) return;
      setDirection(next > step ? 1 : -1);
      setError(null);
      setNotice(null);
      setStep(next);
    },
    [step]
  );

  const clearEvidence = useCallback(() => {
    setEvidence((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }, []);

  const addEvidence = useCallback((kind: EvidenceKind, files: FileList | null) => {
    if (!files?.length) return;

    const incoming = Array.from(files)
      .filter((file) => file.size > 0)
      .filter((file) => file.size <= 25 * 1024 * 1024)
      .map<EvidenceItem>((file) => ({
        id: uid(),
        kind,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));

    if (!incoming.length) {
      setError("No usable files were added. Each file must be non-empty and 25 MB or smaller.");
      return;
    }

    setEvidence((current) => [...current, ...incoming].slice(0, 20));
    setNotice(
      `${incoming.length} evidence item${incoming.length === 1 ? "" : "s"} added. Overhaul will extract what it can before asking for anything else.`
    );
  }, []);

  const removeEvidence = useCallback((id: string) => {
    setEvidence((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = locationQuery.trim();

    if (query.length < 2) {
      setLocationResults([]);
      setLocationLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLocationLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const json = await response.json();
        if (!cancelled) {
          setLocationResults(Array.isArray(json.results) ? json.results : []);
        }
      } catch {
        if (!cancelled) setLocationResults([]);
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locationQuery]);

  useEffect(() => {
    return () => {
      evidence.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [evidence]);

  const onDemo = () => {
    clearEvidence();
    const demo = loadDemo();
    setData(demo);
    setSubject("building");
    setGoal("energy");
    setLocationQuery(demo.locationLabel);
    setLocationResults([]);
    setError(null);
    setNotice("Demo model loaded. Add real evidence or run this known example to inspect the engineering result.");
    go(1);
  };

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(subject && goal);
    if (step === 1) return evidence.length > 0;
    return true;
  }, [evidence.length, goal, step, subject]);

  const chooseLocation = (result: LocationResult) => {
    setLocationQuery(result.label);
    patch({
      locationLabel: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setLocationResults([]);
    setNotice("Location locked. Climate data can now be resolved from coordinates.");
  };

  const onFileInput = (kind: EvidenceKind) => (event: ChangeEvent<HTMLInputElement>) => {
    addEvidence(kind, event.target.files);
    event.target.value = "";
  };

  const submit = async () => {
    if (!subject || !goal) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const payload: WizardInput = {
        ...data,
        reportedIssues: data.reportedIssues ?? [],
        hvacUnknown: data.hvacSystemType === "dont_know",
        capacityTons:
          data.capacityUnit === "tons"
            ? data.capacityValue
            : data.capacityValue / KW_PER_TON,
      };

      const assessment = {
        assessmentSubject: subject,
        assessmentGoal: goal,
        createdAt: new Date().toISOString(),
        evidence: evidence.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.file.name,
          type: item.file.type,
          size: item.file.size,
        })),
        context: payload,
        status: "evidence-collected" as const,
      };

      sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));

      if (subject === "building") {
        const response = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Engineering calculation failed");
        }

        sessionStorage.setItem(
          "overhaul:result",
          JSON.stringify({
            ...json,
            assessmentSubject: subject,
            assessmentGoal: goal,
            evidenceCount: evidence.length,
            evidenceMetadata: assessment.evidence,
          })
        );
        router.push("/results");
        return;
      }

      router.push("/assessment");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleIssue = (issue: ReportedIssue) => {
    setData((current) => {
      const currentIssues = current.reportedIssues ?? [];
      const next = currentIssues.includes(issue)
        ? currentIssues.filter((item) => item !== issue)
        : [...currentIssues, issue];
      return { ...current, reportedIssues: next };
    });
  };

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-16 pt-8 sm:px-6">
      <ProgressBar step={step} total={STEPS.length} />

      <header className="mt-8 flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-steel">
            Evidence-first engineering intelligence
          </p>
          <h1 className="font-display mt-2 text-4xl tracking-tight text-paper sm:text-5xl">
            Overhaul
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-steel">
            Start with evidence. Overhaul builds the smallest defensible model, separates known from unknown, and only asks for information that can change the decision.
          </p>

          {subject && goal ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip selected>{labelForSubject(subject)}</Chip>
              <Chip selected>
                {GOALS.find((item) => item.value === goal)?.label ?? "Assessment"}
              </Chip>
              <Chip selected>{evidence.length} evidence</Chip>
            </div>
          ) : null}
        </div>

        <IsometricBuilding className="hidden h-28 w-36 text-steel/70 sm:block" />
      </header>

      <div className="mt-8 border-y border-steel/20 py-3">
        <div className="flex gap-5 overflow-x-auto">
          {STEPS.map((name, index) => (
            <button
              key={name}
              type="button"
              disabled={index > step}
              onClick={() => go(index)}
              className={`shrink-0 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                index === step
                  ? "text-teal"
                  : index < step
                    ? "text-paper hover:text-teal"
                    : "text-steel/40"
              }`}
            >
              {String(index + 1).padStart(2, "0")} {name}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.section
          key={step}
          custom={direction}
          initial={{ x: direction > 0 ? 28 : -28, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction > 0 ? -28 : 28, opacity: 0 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          className="mt-8 flex-1"
        >
          {step === 0 ? (
            <TargetStep
              subject={subject}
              goal={goal}
              onSubject={(next) => {
                if (next !== subject) clearEvidence();
                setSubject(next);
                setGoal(null);
                setError(null);
              }}
              onGoal={(next) => {
                setGoal(next);
                setError(null);
              }}
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
              onFiles={addEvidence}
              onRemove={removeEvidence}
            />
          ) : null}

          {step === 2 ? (
            <ContextStep
              subject={subject}
              data={data}
              patch={patch}
              locationQuery={locationQuery}
              setLocationQuery={setLocationQuery}
              locationResults={locationResults}
              locationLoading={locationLoading}
              chooseLocation={chooseLocation}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              onToggleIssue={toggleIssue}
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
        <div className="mt-5 border border-teal/30 bg-teal/5 px-4 py-3 text-sm leading-relaxed text-teal">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 border border-clay/40 bg-clay/5 px-4 py-3 text-sm leading-relaxed text-clay">
          {error}
        </div>
      ) : null}

      <footer className="mt-10 flex items-center justify-between border-t border-steel/20 pt-6">
        <button
          type="button"
          disabled={step === 0 || submitting}
          onClick={() => go(step - 1)}
          className="text-sm text-steel disabled:opacity-25"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canContinue || submitting}
            onClick={() => go(step + 1)}
            className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal transition-colors hover:bg-teal/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={!subject || !goal || evidence.length === 0 || submitting}
            onClick={() => void submit()}
            className="border border-gold bg-gold/10 px-5 py-2.5 text-sm text-gold transition-colors hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting
              ? subject === "building"
                ? "Calculating…"
                : "Preparing assessment…"
              : subject === "building"
                ? "Run Engineering Assessment"
                : "Open Assessment Workspace"}
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
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">
          Start with the thing that needs improvement
        </p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">
          What are we assessing?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          One workflow covers buildings, facilities, and standalone equipment. You do not need to know the engineering parameters in advance.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.entries(SUBJECT_META) as Array<[Subject, (typeof SUBJECT_META)[Subject]]>).map(
          ([value, meta]) => (
            <TapCard
              key={value}
              selected={subject === value}
              onClick={() => onSubject(value)}
              title={meta.label}
              subtitle={meta.detail}
            >
              <div className="mt-5 border-t border-steel/15 pt-4 text-xs leading-relaxed text-steel">
                {meta.prompt}
              </div>
            </TapCard>
          )
        )}
      </div>

      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Assessment objective</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

      <div className="border border-gold/30 bg-gold/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Judge-ready demo</p>
            <p className="mt-1 text-sm text-paper">Load a known building example to exercise the existing deterministic engine.</p>
          </div>
          <button
            type="button"
            onClick={onDemo}
            className="border border-gold/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-gold hover:bg-gold/10"
          >
            Load demo
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-steel/80">{DEMO_NOTES}</p>
      </div>
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
  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Evidence first</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">Show Overhaul what exists.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          Do not describe the machine from memory. Give Overhaul evidence and let the perception layer extract model, geometry, visible condition, labels, and other observations.
        </p>
        <p className="mt-2 text-xs text-steel/70">
          {subject ? SUBJECT_META[subject].prompt : "Choose a target first."}
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <EvidenceButton
          title="Scan / camera"
          detail="Use the device camera for a live evidence capture or walkthrough."
          onClick={() => cameraInputRef.current?.click()}
        />
        <EvidenceButton
          title="Add photos"
          detail="Exterior, equipment, room, nameplate, installation, controls, or condition."
          onClick={() => photoInputRef.current?.click()}
        />
        <EvidenceButton
          title="Add documents"
          detail="Bills, manuals, maintenance logs, drawings, datasheets, or reports."
          onClick={() => documentInputRef.current?.click()}
        />
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => onFiles("scan", event.target.files)}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => onFiles("photo", event.target.files)}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept="application/pdf,.pdf,application/msword,.doc,.docx,.csv,.txt,.xlsx,.xls"
        multiple
        className="hidden"
        onChange={(event) => onFiles("document", event.target.files)}
      />

      {evidence.length === 0 ? (
        <div className="border border-dashed border-steel/30 p-8 text-center">
          <p className="text-sm text-paper">No evidence collected yet.</p>
          <p className="mt-2 text-xs leading-relaxed text-steel">
            One useful photo is better than ten generic questions. Start with the most informative view.
          </p>
        </div>
      ) : (
        <div className="border border-steel/20">
          <div className="flex items-center justify-between border-b border-steel/15 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Evidence package</p>
              <p className="mt-1 text-sm text-paper">{evidence.length} item{evidence.length === 1 ? "" : "s"}</p>
            </div>
            <p className="text-xs text-steel">Up to 20 items · 25 MB each</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {evidence.map((item) => (
              <div key={item.id} className="border border-steel/20 p-3">
                <div className="flex gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-steel/20 bg-steel/5">
                    {item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.previewUrl} alt="Evidence preview" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-steel">{item.kind}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-paper">{item.file.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-steel">{item.kind}</p>
                    <p className="mt-2 text-xs text-steel">{formatBytes(item.file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="self-start text-xs text-steel hover:text-clay"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceButton({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group border border-steel/25 p-5 text-left transition-colors hover:border-teal/60 hover:bg-teal/5"
    >
      <p className="text-sm font-medium text-paper group-hover:text-teal">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-steel">{detail}</p>
      <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-teal">Add evidence →</p>
    </button>
  );
}

function ContextStep({
  subject,
  data,
  patch,
  locationQuery,
  setLocationQuery,
  locationResults,
  locationLoading,
  chooseLocation,
  showAdvanced,
  setShowAdvanced,
  onToggleIssue,
}: {
  subject: Subject | null;
  data: WizardInput;
  patch: (partial: Partial<WizardInput>) => void;
  locationQuery: string;
  setLocationQuery: (value: string) => void;
  locationResults: LocationResult[];
  locationLoading: boolean;
  chooseLocation: (result: LocationResult) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  onToggleIssue: (issue: ReportedIssue) => void;
}) {
  const hvacOptions = Object.entries(HVAC_SYSTEM_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Minimum context</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">Tell us only what the evidence cannot.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          These inputs are context for the engineering model. They are not a request to manually describe every component.
        </p>
      </section>

      <section className="space-y-3">
        <label className="text-[10px] uppercase tracking-[0.16em] text-steel">Site / operating location</label>
        <div className="relative">
          <input
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.target.value)}
            placeholder={subject === "equipment" ? "Optional site, city, or facility location" : "City, region, or facility location"}
            className="w-full border border-steel/25 bg-transparent px-4 py-3 text-sm text-paper outline-none placeholder:text-steel/40 focus:border-teal"
          />
          {locationLoading ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-steel">Finding…</span>
          ) : null}
          {locationResults.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full border border-steel/25 bg-[#050505] shadow-xl">
              {locationResults.slice(0, 6).map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => chooseLocation(result)}
                  className="block w-full border-b border-steel/15 px-4 py-3 text-left text-sm text-paper last:border-b-0 hover:bg-teal/5"
                >
                  {result.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {subject !== "equipment" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Approx. area"
            value={String(data.floorAreaM2)}
            suffix="m²"
            type="number"
            min={1}
            onChange={(value) => patch({ floorAreaM2: Math.max(1, Number(value) || 1) })}
          />
          <SelectField
            label="Use type"
            value={data.buildingType}
            options={[
              ["home", "Home / apartment"],
              ["office", "Office / commercial"],
              ["mixed", "Mixed / other"],
            ]}
            onChange={(value) => patch({ buildingType: value as WizardInput["buildingType"] })}
          />
        </div>
      ) : null}

      {subject === "equipment" ? (
        <div className="space-y-4">
          <SelectField
            label="Equipment class"
            value={(data as WizardInput & { equipmentClass?: string }).equipmentClass ?? ""}
            options={[["", "Not sure — let evidence identify it"], ...EQUIPMENT_CLASSES.map((item) => [item, item] as [string, string])]}
            onChange={(value) =>
              patch({
                ...(value ? { hvacSystemType: value as WizardInput["hvacSystemType"] } : {}),
              })
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Typical operating hours"
              value={(data as WizardInput & { operatingHours?: number }).operatingHours?.toString() ?? ""}
              suffix="h/day"
              type="number"
              min={0}
              max={24}
              placeholder="Optional"
              onChange={(value) => patch({} as Partial<WizardInput>)}
            />
            <p className="border border-steel/20 p-4 text-xs leading-relaxed text-steel">
              Actual efficiency, wear, load, vibration, pressure, and temperature performance stay <span className="text-paper">unknown</span> until evidence or measurements establish them.
            </p>
          </div>
        </div>
      ) : null}

      {subject === "building" ? (
        <section className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-steel">HVAC context</p>
            <p className="mt-1 text-xs text-steel">Basic context only. The evidence layer should identify the actual equipment later.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="System type"
              value={data.hvacSystemType}
              options={hvacOptions.map((item) => [item.value, item.label] as [string, string])}
              onChange={(value) => patch({ hvacSystemType: value as WizardInput["hvacSystemType"] })}
            />
            <SelectField
              label="Ventilation"
              value={data.ventilation}
              options={[
                ["natural", "Natural / mixed"],
                ["mechanical", "Mechanical"],
              ]}
              onChange={(value) => patch({ ventilation: value as WizardInput["ventilation"] })}
            />
          </div>
        </section>
      ) : null}

      {subject !== "equipment" ? (
        <section className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-steel">What is already being felt?</p>
            <p className="mt-1 text-xs text-steel">These observations only adjust priority; they do not become engineering measurements.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ISSUES.map((item) => (
              <Chip
                key={item.value}
                selected={(data.reportedIssues ?? []).includes(item.value)}
                onClick={() => onToggleIssue(item.value)}
              >
                {item.label}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs uppercase tracking-[0.15em] text-steel hover:text-paper"
      >
        {showAdvanced ? "Hide advanced context" : "Show advanced context"}
      </button>

      {showAdvanced ? (
        <div className="grid gap-4 border-t border-steel/15 pt-5 sm:grid-cols-2">
          <Field
            label="Energy rate"
            value={String(data.energyRateINR)}
            suffix="local equivalent"
            type="number"
            min={0}
            step={0.01}
            onChange={(value) => patch({ energyRateINR: Math.max(0, Number(value) || 0) })}
          />
          <div className="border border-steel/20 p-4 text-xs leading-relaxed text-steel">
            Advanced inputs are optional. The evidence/engineering layers should replace assumptions with traced values as more information becomes available.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  suffix,
  type = "text",
  min,
  max,
  step,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  suffix?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</span>
      <div className="mt-2 flex border border-steel/25 focus-within:border-teal">
        <input
          type={type}
          min={min}
          max={max}
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-paper outline-none placeholder:text-steel/40"
        />
        {suffix ? <span className="border-l border-steel/15 px-3 py-3 text-xs text-steel">{suffix}</span> : null}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full border border-steel/25 bg-[#050505] px-4 py-3 text-sm text-paper outline-none focus:border-teal"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue} className="bg-[#050505] text-paper">
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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
  const known: string[] = [];
  const unknown: string[] = [];

  if (evidence.length > 0) known.push(`${evidence.length} evidence item${evidence.length === 1 ? "" : "s"} collected`);
  else unknown.push("No evidence collected");

  if (data.locationLabel && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
    known.push("Site coordinates available");
  } else {
    unknown.push("Location not locked");
  }

  if (subject === "building") {
    known.push(`${data.floorAreaM2} m² context area`);
    known.push(`HVAC context: ${HVAC_SYSTEM_LABELS[data.hvacSystemType] ?? data.hvacSystemType}`);
    if (data.hvacSystemType === "dont_know") unknown.push("HVAC identity and capacity");
  } else if (subject === "facility") {
    known.push("Facility subject selected");
    unknown.push("Asset inventory and process interactions until evidence extraction");
  } else if (subject === "equipment") {
    known.push("Standalone equipment subject selected");
    unknown.push("Actual load, efficiency, degradation, and internal condition until evidence/measurements establish them");
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Model intake review</p>
        <h2 className="font-display mt-2 text-2xl text-paper sm:text-3xl">Ready to build the assessment.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
          This screen deliberately shows what is known and what remains unknown. Unknown values are not silently guessed.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Target" value={labelForSubject(subject)} />
        <SummaryCard label="Objective" value={GOALS.find((item) => item.value === goal)?.label ?? "Not selected"} />
        <SummaryCard label="Evidence" value={`${evidence.length} item${evidence.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-teal/25 bg-teal/5 p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-teal">Established / provided</p>
          <div className="mt-4 space-y-2">
            {known.map((item) => (
              <p key={item} className="text-sm text-paper">✓ {item}</p>
            ))}
          </div>
        </div>
        <div className="border border-clay/25 bg-clay/5 p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-clay">Unknown / needs evidence</p>
          <div className="mt-4 space-y-2">
            {unknown.length ? unknown.map((item) => <p key={item} className="text-sm text-paper">? {item}</p>) : <p className="text-sm text-paper">None flagged at intake.</p>}
          </div>
        </div>
      </div>

      <div className="border border-steel/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Evidence principle</p>
            <p className="mt-2 text-sm leading-relaxed text-paper">
              Overhaul should extract first, validate second, and ask only when a missing variable can change the decision.
            </p>
          </div>
          <div className="font-mono-num text-xs text-steel">{data.locationLabel || "location pending"}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onJump(1)} className="border border-steel/30 px-4 py-2 text-xs text-steel hover:border-paper hover:text-paper">Review evidence</button>
        <button type="button" onClick={() => onJump(2)} className="border border-steel/30 px-4 py-2 text-xs text-steel hover:border-paper hover:text-paper">Adjust context</button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-steel/20 p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-steel">{label}</p>
      <p className="mt-2 text-sm text-paper">{value}</p>
    </div>
  );
}
