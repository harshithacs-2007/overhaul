"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  EVIDENCE_CATEGORY_LABELS,
  type EvidenceItem,
} from "@/lib/evidence/types";
import type { BuildingElement } from "@/lib/building/types";

export function Inspector() {
  const {
    state,
    selectedEvidence,
    setCenterMode,
    setSelection,
    setInspectorOpenMobile,
    linkEvidence,
    updateEvidence,
  } = useWorkspace();
  const reduce = useReducedMotion();

  const selectedElement = (() => {
    if (state.selection.type !== "element") return null;
    const elementId = state.selection.id;
    return state.building.elements.find((e) => e.id === elementId) ?? null;
  })();

  return (
    <aside
      className="flex h-full flex-col border-l border-steel/20 bg-navy/95"
      aria-label="Contextual inspector"
    >
      <div className="flex items-center justify-between border-b border-steel/20 px-4 py-3 lg:block">
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">
          Inspector
        </p>
        <button
          type="button"
          className="text-xs text-steel lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          onClick={() => setInspectorOpenMobile(false)}
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {state.selection.type === "none" && (
            <motion.div
              key="empty"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="text-sm text-steel"
            >
              <p className="font-display text-lg text-paper">Nothing selected</p>
              <p className="mt-2 leading-relaxed">
                Select evidence or a building element. Known fields stay empty
                until you provide them — never invented.
              </p>
            </motion.div>
          )}

          {selectedEvidence && (
            <motion.div
              key={selectedEvidence.id}
              initial={reduce ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -8 }}
            >
              <EvidenceInspector
                item={selectedEvidence}
                onReview={() =>
                  updateEvidence(selectedEvidence.id, {
                    reviewState: "needs_review",
                  })
                }
                onConfirm={() =>
                  updateEvidence(selectedEvidence.id, {
                    reviewState: "confirmed",
                  })
                }
                onGotoEvidence={() => setCenterMode("evidence")}
              />
            </motion.div>
          )}

          {selectedElement && (
            <motion.div
              key={selectedElement.id}
              initial={reduce ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -8 }}
            >
              <ElementInspector
                element={selectedElement}
                evidence={state.evidence}
                onReviewEvidence={() => {
                  setCenterMode("evidence");
                  setSelection({ type: "none" });
                }}
                onAddInfo={() => setCenterMode("manual")}
                onLink={(evidenceId) =>
                  linkEvidence(selectedElement.id, evidenceId)
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}

function EvidenceInspector({
  item,
  onReview,
  onConfirm,
  onGotoEvidence,
}: {
  item: EvidenceItem;
  onReview: () => void;
  onConfirm: () => void;
  onGotoEvidence: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-steel">
          Evidence
        </p>
        <h3 className="font-display mt-1 text-2xl text-paper">
          {EVIDENCE_CATEGORY_LABELS[item.category]}
        </h3>
      </div>

      {item.mediaType === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.file.previewUrl}
          alt=""
          className="w-full border border-steel/20 object-cover"
        />
      ) : (
        <div className="border border-steel/20 px-3 py-8 text-center text-xs text-steel">
          PDF · {item.file.originalFilename}
        </div>
      )}

      <dl className="space-y-3 text-sm">
        <Row label="Source" value={item.source} />
        <Row label="Status" value={item.status} />
        <Row label="Review" value={item.reviewState.replaceAll("_", " ")} />
        <Row
          label="Analysis"
          value={item.analysisState.replaceAll("_", " ")}
        />
        <Row
          label="Captured"
          value={new Date(item.captureTimestamp).toLocaleString()}
        />
        <Row
          label="Persistence"
          value={
            item.file.persistence === "temporary"
              ? "Temporary (no permanent storage configured)"
              : "Permanent"
          }
        />
        <Row
          label="Size"
          value={`${(item.file.sizeBytes / 1024).toFixed(1)} KB`}
        />
      </dl>

      <p className="border border-steel/20 px-3 py-2 text-xs text-steel">
        No technical properties detected. Analysis state is explicitly{" "}
        <span className="text-paper">not analyzed</span>.
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onReview}
          className="border border-steel/40 px-3 py-2 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Mark needs review
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="border border-teal px-3 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Confirm evidence
        </button>
        <button
          type="button"
          onClick={onGotoEvidence}
          className="text-left text-xs text-steel underline-offset-2 hover:underline"
        >
          Open evidence library
        </button>
      </div>
    </div>
  );
}

function ElementInspector({
  element,
  evidence,
  onReviewEvidence,
  onAddInfo,
  onLink,
}: {
  element: BuildingElement;
  evidence: EvidenceItem[];
  onReviewEvidence: () => void;
  onAddInfo: () => void;
  onLink: (evidenceId: string) => void;
}) {
  const linked = evidence.filter((e) =>
    element.linkedEvidenceIds.includes(e.id)
  );
  const known = element.fields.filter((f) => f.state === "known" && f.value);
  const unknown = element.fields.filter((f) => f.state !== "known" || !f.value);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-steel">
          Building element
        </p>
        <h3 className="font-display mt-1 text-2xl uppercase tracking-wide text-paper">
          {element.label}
        </h3>
      </div>

      <section>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-steel">
          Evidence
        </h4>
        <p className="mt-1 font-mono-num text-sm text-paper">
          {linked.length} item{linked.length === 1 ? "" : "s"}
        </p>
        {linked.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {linked.map((e) => (
              <li key={e.id} className="truncate text-xs text-steel">
                {e.file.originalFilename}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-steel">None linked yet</p>
        )}
        {evidence.length > 0 ? (
          <label className="mt-3 block text-[10px] text-steel">
            Link evidence
            <select
              className="mt-1 w-full border border-steel/30 bg-navy px-2 py-1.5 text-xs text-paper"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onLink(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Select…
              </option>
              {evidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {EVIDENCE_CATEGORY_LABELS[e.category]} ·{" "}
                  {e.file.originalFilename}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-steel">
          Known
        </h4>
        {known.length === 0 ? (
          <p className="mt-1 font-mono-num text-sm text-paper">—</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-paper">
            {known.map((f) => (
              <li key={f.key}>
                {f.label}: {f.value}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-steel">
          Unknown
        </h4>
        <ul className="mt-2 space-y-1 text-sm text-steel">
          {unknown.map((f) => (
            <li key={f.key}>{f.label}</li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onReviewEvidence}
          className="border border-steel/40 px-3 py-2 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Review evidence
        </button>
        <button
          type="button"
          onClick={onAddInfo}
          className="border border-teal px-3 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Add information
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-steel/15 pb-2">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-steel">
        {label}
      </dt>
      <dd className="text-right text-xs text-paper">{value}</dd>
    </div>
  );
}
