"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CATEGORY_LABELS,
  type EvidenceCategory,
  type EvidenceItem,
} from "@/lib/evidence/types";

function ReviewBadge({ state }: { state: EvidenceItem["reviewState"] }) {
  return (
    <span className="border border-steel/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-steel">
      {state.replaceAll("_", " ")}
    </span>
  );
}

function AnalysisBadge({ state }: { state: EvidenceItem["analysisState"] }) {
  const tone =
    state === "not_analyzed"
      ? "text-steel border-steel/30"
      : state === "analysis_failed"
        ? "text-clay border-clay/40"
        : "text-teal border-teal/40";
  return (
    <span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${tone}`}>
      {state.replaceAll("_", " ")}
    </span>
  );
}

export function EvidencePanel() {
  const {
    state,
    setSelection,
    setCenterMode,
    removeEvidence,
    categorize,
    updateEvidence,
    replaceEvidence,
  } = useWorkspace();
  const reduce = useReducedMotion();
  const selectedId =
    state.selection.type === "evidence" ? state.selection.id : null;

  const replaceFile = async (id: string, file: File) => {
    const existing = state.evidence.find((e) => e.id === id);
    if (!existing) return;
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("category", existing.category);
    form.append("source", existing.source);
    const res = await fetch("/api/evidence/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Replace failed");
    // Remove old storage if possible
    try {
      await fetch(
        `/api/evidence/file/${encodeURIComponent(existing.file.storageKey)}`,
        { method: "DELETE" }
      );
    } catch {
      /* non-fatal */
    }
    replaceEvidence(id, json.evidence as EvidenceItem);
  };

  if (!state.evidence.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="font-display text-2xl text-paper">No evidence yet</p>
        <p className="mt-2 max-w-sm text-sm text-steel">
          Scan with camera or upload files. Analysis stays &quot;Not analyzed&quot;
          until a real detector is connected.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setCenterMode("camera")}
            className="border border-gold/70 px-4 py-2 text-sm text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            Scan with camera
          </button>
          <button
            type="button"
            onClick={() => setCenterMode("upload")}
            className="border border-teal/70 px-4 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            Upload evidence
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-steel/20 px-4 py-3">
        <div>
          <h2 className="font-display text-xl text-paper">Evidence</h2>
          <p className="font-mono-num text-xs text-steel">
            {state.evidence.length} item{state.evidence.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCenterMode("camera")}
            className="border border-steel/30 px-2.5 py-1 text-[11px] text-steel hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            Camera
          </button>
          <button
            type="button"
            onClick={() => setCenterMode("upload")}
            className="border border-steel/30 px-2.5 py-1 text-[11px] text-steel hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            Upload
          </button>
        </div>
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {state.evidence.map((item, i) => (
          <motion.li
            key={item.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.2) }}
          >
            <button
              type="button"
              onClick={() => setSelection({ type: "evidence", id: item.id })}
              className={`flex w-full gap-3 border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                selectedId === item.id
                  ? "border-teal bg-teal/10"
                  : "border-steel/20 hover:border-steel/45"
              }`}
            >
              {item.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.file.previewUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-steel/25 font-mono-num text-[10px] text-steel">
                  PDF
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-paper">
                    {EVIDENCE_CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="font-mono-num text-[10px] text-steel">
                    {item.source}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-steel">
                  {item.file.originalFilename}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ReviewBadge state={item.reviewState} />
                  <AnalysisBadge state={item.analysisState} />
                  <span className="border border-steel/25 px-1.5 py-0.5 text-[10px] text-steel">
                    {item.status}
                  </span>
                </div>
              </div>
            </button>

            {selectedId === item.id ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 border border-t-0 border-steel/20 px-3 py-2">
                <label className="flex items-center gap-2 text-[10px] text-steel">
                  Category
                  <select
                    value={item.category}
                    onChange={(e) =>
                      categorize(item.id, e.target.value as EvidenceCategory)
                    }
                    className="border border-steel/25 bg-navy px-1 py-0.5 text-paper"
                  >
                    {EVIDENCE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {EVIDENCE_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateEvidence(item.id, { reviewState: "confirmed" })
                  }
                  className="text-[10px] uppercase tracking-wide text-teal"
                >
                  Confirm
                </button>
                <label className="cursor-pointer text-[10px] uppercase tracking-wide text-steel">
                  Replace
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void replaceFile(item.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    void fetch(
                      `/api/evidence/file/${encodeURIComponent(item.file.storageKey)}`,
                      { method: "DELETE" }
                    );
                    removeEvidence(item.id);
                  }}
                  className="text-[10px] uppercase tracking-wide text-clay"
                >
                  Remove
                </button>
              </div>
            ) : null}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
