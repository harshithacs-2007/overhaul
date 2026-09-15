"use client";

import { useMemo } from "react";
import { buildEquipmentReference } from "@/lib/engineering/equipmentReference";
import { diagnoseResiduals, type DiagnosticDomain } from "@/lib/engineering/diagnosisEngine";

type RawObservation = { field: string; numericValue: number | null; unit: string | null; confidence: number };
type Extraction = { evidenceId?: string; evidenceType?: string; observations?: RawObservation[] };
type Signal = { key: string; observed: number; expected: number; unit: string; toleranceRelative: number; confidence: number };

function canonical(field: string): string { return field.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

function buildSignals(extracts: Extraction[]): Signal[] {
  const values = new Map<string, { value: number; unit: string; confidence: number }>();
  for (const extract of extracts) for (const observation of extract.observations ?? []) {
    if (observation.numericValue == null || !Number.isFinite(observation.numericValue)) continue;
    const key = canonical(observation.field);
    if (!values.has(key)) values.set(key, { value: observation.numericValue, unit: observation.unit ?? "", confidence: observation.confidence });
  }

  const references = buildEquipmentReference(extracts.map((extract) => ({
    evidenceId: extract.evidenceId,
    evidenceType: extract.evidenceType,
    observations: (extract.observations ?? []).map((observation) => ({
      field: observation.field,
      value: observation.numericValue == null ? "" : String(observation.numericValue),
      numericValue: observation.numericValue,
      unit: observation.unit,
      sourceText: "",
    })),
  })));
  const expected = new Map(references.map((item) => [canonical(item.key), item]));
  return Array.from(values.entries()).filter(([key]) => expected.has(key)).map(([key, item]) => ({ key, observed: item.value, expected: expected.get(key)!.expected, unit: item.unit || expected.get(key)!.unit, toleranceRelative: expected.get(key)!.toleranceRelative, confidence: item.confidence }));
}

export default function DiagnosticPanel({ extracts, domain = "equipment" }: { extracts: Extraction[]; domain?: DiagnosticDomain }) {
  const signals = useMemo(() => buildSignals(extracts), [extracts]);
  const result = useMemo(() => diagnoseResiduals({ domain, signals }), [domain, signals]);
  return (
    <section className="mx-auto mt-4 max-w-[1500px] px-4 sm:px-6 lg:px-8"><div className="border border-steel/20 bg-black/15 p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal">Diagnostic decision engine</p>
      <div className="mt-1 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-display text-3xl sm:text-4xl">Residual → cause → evidence → action.</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-steel">OVERHAUL does not turn an abnormal signal directly into a replacement recommendation. It identifies supported cause candidates and asks for the smallest discriminating measurement needed to separate them.</p></div><span className="font-mono text-[9px] uppercase text-steel">{signals.length} comparable signals · {domain}</span></div>
      {result.status === "no-abnormality" ? <div className="mt-5 border border-teal/25 bg-teal/5 p-4 text-sm text-paper">No abnormal residuals exceeded their configured evidence tolerance.</div> : null}
      {result.status === "insufficient-evidence" ? <div className="mt-5 border border-clay/25 bg-clay/5 p-4"><p className="font-mono text-[9px] uppercase text-clay">Decision blocked</p><div className="mt-2 space-y-1 text-xs leading-5 text-steel">{result.evidenceRequests.map((item) => <p key={item}>· {item}</p>)}</div></div> : null}
      {result.candidates.length ? <div className="mt-5 space-y-3">{result.candidates.map((candidate) => <article key={candidate.causeId} className="border border-steel/15 p-4"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-teal">{candidate.causeId}</p><h3 className="mt-1 text-lg">{candidate.cause}</h3></div><span className={`font-mono text-[8px] uppercase ${candidate.severity === "critical" ? "text-clay" : candidate.severity === "warning" ? "text-amber-300" : "text-teal"}`}>{candidate.severity}</span></div><p className="mt-2 text-xs leading-5 text-steel">{candidate.consequence}</p><div className="mt-4 grid gap-3 md:grid-cols-3"><Block title="Supporting signals">{candidate.supportingSignals.join(" · ")}</Block><Block title="Discriminating evidence">{candidate.discriminatingEvidence.join(" · ")}</Block><Block title="Candidate actions">{candidate.recommendedActionIds.join(" · ")}</Block></div></article>)}</div> : null}
      {result.evidenceRequests.length ? <div className="mt-5 border border-teal/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-teal">Next best measurement</p><p className="mt-2 text-xs leading-5 text-steel">{result.evidenceRequests[0]}</p></div> : null}
    </div></section>
  );
}
function Block({ title, children }: { title: string; children: string }) { return <div className="border border-steel/15 p-3"><p className="font-mono text-[8px] uppercase text-steel">{title}</p><p className="mt-2 text-xs leading-5 text-paper">{children}</p></div>; }
