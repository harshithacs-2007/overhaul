"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CATEGORY_LABELS,
  type EvidenceCategory,
  type EvidenceItem,
} from "@/lib/evidence/types";
import { MAX_EVIDENCE_BYTES } from "@/lib/evidence/validation";

interface QueuedFile {
  localId: string;
  file: File;
  category: EvidenceCategory;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  previewUrl?: string;
}

async function uploadFile(
  file: File,
  category: EvidenceCategory,
  onProgress: (n: number) => void
): Promise<EvidenceItem> {
  // XMLHttpRequest for upload progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("category", category);
    form.append("source", "upload");
    xhr.open("POST", "/api/evidence/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json.evidence);
        else reject(new Error(json.error || "Upload failed"));
      } catch {
        reject(new Error("Invalid server response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

export function UploadDropzone({ onClose }: { onClose?: () => void }) {
  const { addEvidence, setStatus } = useWorkspace();
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [defaultCategory, setDefaultCategory] =
    useState<EvidenceCategory>("exterior");
  const [dragging, setDragging] = useState(false);

  const enqueue = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const next: QueuedFile[] = list.map((file) => ({
        localId: `local_${file.name}_${file.size}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        category: defaultCategory,
        progress: 0,
        status: "queued",
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
      }));
      setQueue((q) => [...next, ...q]);
      setStatus(`${next.length} file(s) queued`);
    },
    [defaultCategory, setStatus]
  );

  const runUpload = async (localId: string) => {
    const item = queue.find((q) => q.localId === localId);
    if (!item) return;

    if (item.file.size > MAX_EVIDENCE_BYTES) {
      setQueue((q) =>
        q.map((x) =>
          x.localId === localId
            ? {
                ...x,
                status: "error",
                error: `Exceeds ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB limit`,
              }
            : x
        )
      );
      return;
    }

    setQueue((q) =>
      q.map((x) =>
        x.localId === localId ? { ...x, status: "uploading", progress: 0 } : x
      )
    );

    try {
      const evidence = await uploadFile(item.file, item.category, (n) => {
        setQueue((q) =>
          q.map((x) => (x.localId === localId ? { ...x, progress: n } : x))
        );
      });
      addEvidence(evidence);
      setQueue((q) =>
        q.map((x) =>
          x.localId === localId ? { ...x, status: "done", progress: 100 } : x
        )
      );
    } catch (err) {
      setQueue((q) =>
        q.map((x) =>
          x.localId === localId
            ? {
                ...x,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              }
            : x
        )
      );
    }
  };

  const uploadAll = async () => {
    const pending = queue.filter((q) => q.status === "queued" || q.status === "error");
    for (const p of pending) {
      await runUpload(p.localId);
    }
  };

  const removeQueued = (localId: string) => {
    setQueue((q) => {
      const target = q.find((x) => x.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return q.filter((x) => x.localId !== localId);
    });
  };

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between border-b border-steel/20 px-4 py-3">
        <div>
          <h2 className="font-display text-xl text-paper">Upload evidence</h2>
          <p className="text-xs text-steel">
            JPG, PNG, WebP, PDF · max {MAX_EVIDENCE_BYTES / (1024 * 1024)} MB each
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="border border-steel/30 px-3 py-1.5 text-xs text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <label className="flex items-center gap-3 text-xs text-steel">
          <span className="uppercase tracking-[0.12em]">Default category</span>
          <select
            value={defaultCategory}
            onChange={(e) =>
              setDefaultCategory(e.target.value as EvidenceCategory)
            }
            className="border border-steel/30 bg-navy px-2 py-1.5 text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            {EVIDENCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EVIDENCE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer border border-dashed px-6 py-12 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
            dragging
              ? "border-teal bg-teal/10"
              : "border-steel/35 hover:border-steel/60"
          }`}
        >
          <p className="text-sm text-paper">Drop files here or click to browse</p>
          <p className="mt-2 text-xs text-steel">Multiple files supported</p>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) enqueue(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {queue.length > 0 ? (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {queue.map((q) => (
              <li
                key={q.localId}
                className="flex items-center gap-3 border border-steel/20 px-3 py-2"
              >
                {q.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.previewUrl}
                    alt=""
                    className="h-10 w-10 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center border border-steel/20 font-mono-num text-[10px] text-steel">
                    PDF
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-paper">{q.file.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <select
                      value={q.category}
                      disabled={q.status === "uploading" || q.status === "done"}
                      onChange={(e) =>
                        setQueue((list) =>
                          list.map((x) =>
                            x.localId === q.localId
                              ? {
                                  ...x,
                                  category: e.target.value as EvidenceCategory,
                                }
                              : x
                          )
                        )
                      }
                      className="border border-steel/25 bg-transparent text-[10px] text-steel"
                    >
                      {EVIDENCE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {EVIDENCE_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <span className="font-mono-num text-[10px] text-steel">
                      {q.status === "uploading"
                        ? `${q.progress}%`
                        : q.status}
                    </span>
                    {q.error ? (
                      <span className="text-[10px] text-clay">{q.error}</span>
                    ) : null}
                  </div>
                  {q.status === "uploading" ? (
                    <div className="mt-1 h-0.5 bg-steel/20">
                      <div
                        className="h-full bg-teal transition-all"
                        style={{ width: `${q.progress}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  {(q.status === "queued" || q.status === "error") && (
                    <button
                      type="button"
                      onClick={() => void runUpload(q.localId)}
                      className="text-[10px] uppercase tracking-wide text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                    >
                      {q.status === "error" ? "Retry" : "Upload"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeQueued(q.localId)}
                    className="text-[10px] uppercase tracking-wide text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {queue.some((q) => q.status === "queued" || q.status === "error") ? (
          <button
            type="button"
            onClick={() => void uploadAll()}
            className="border border-teal bg-teal/10 px-4 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            Upload all
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
