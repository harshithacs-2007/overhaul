"use client";

import { useEffect, useRef, useState } from "react";
import type { EvidenceExtractionResponse } from "@/lib/evidence/extraction";

type PerceptionStatus = "idle" | "analyzing" | "ready" | "error";

type StoredExtraction = EvidenceExtractionResponse & {
  fingerprint: string;
  analyzedAt: string;
};

const STORAGE_KEY = "overhaul:evidence-extractions";
const MAX_STORED = 20;

function fingerprint(file: File) {
  return `${file.name}::${file.type}::${file.size}::${file.lastModified}`;
}

function readStored(): StoredExtraction[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(items: StoredExtraction[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_STORED)));
}

function patchAssessmentStorage() {
  const extractions = readStored();
  if (!extractions.length) return;

  try {
    const raw = sessionStorage.getItem("overhaul:assessment");
    if (raw) {
      const assessment = JSON.parse(raw) as Record<string, unknown>;
      sessionStorage.setItem(
        "overhaul:assessment",
        JSON.stringify({ ...assessment, evidenceExtractions: extractions }),
      );
    }

    const resultRaw = sessionStorage.getItem("overhaul:result");
    if (resultRaw) {
      const result = JSON.parse(resultRaw) as Record<string, unknown>;
      sessionStorage.setItem(
        "overhaul:result",
        JSON.stringify({ ...result, evidenceExtractions: extractions }),
      );
    }
  } catch {
    // Keep perception results available even if a host-page payload is malformed.
  }
}

export function EvidencePerceptionBridge() {
  const [status, setStatus] = useState<PerceptionStatus>("idle");
  const [pending, setPending] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const active = useRef(new Set<string>());

  useEffect(() => {
    const originalSetItem = sessionStorage.setItem.bind(sessionStorage);
    const patchedSetItem = (key: string, value: string) => {
      if (key === "overhaul:assessment" || key === "overhaul:result") {
        try {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          originalSetItem(
            key,
            JSON.stringify({ ...parsed, evidenceExtractions: readStored() }),
          );
          return;
        } catch {
          // Fall back to the original payload rather than breaking navigation.
        }
      }
      originalSetItem(key, value);
    };

    sessionStorage.setItem = patchedSetItem;
    setReadyCount(readStored().length);

    const onChange = async (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.files?.length) return;

      const files = Array.from(input.files);
      const kind = input.getAttribute("data-evidence-kind") ??
        (input.hasAttribute("capture") ? "scan" : files[0]?.type === "application/pdf" ? "document" : "photo");

      for (const file of files) {
        const id = fingerprint(file);
        if (active.current.has(id)) continue;
        if (!file.size || file.size > 25 * 1024 * 1024) continue;
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") continue;

        active.current.add(id);
        setPending((value) => value + 1);
        setStatus("analyzing");

        try {
          const form = new FormData();
          form.append("file", file, file.name);
          form.append("evidenceId", id);
          form.append("evidenceKind", kind);

          const response = await fetch("/api/evidence/extract", {
            method: "POST",
            body: form,
          });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Evidence analysis failed");

          const result = json.result as EvidenceExtractionResponse;
          const next: StoredExtraction[] = [
            ...readStored().filter((item) => item.fingerprint !== id),
            { ...result, fingerprint: id, analyzedAt: new Date().toISOString() },
          ];
          writeStored(next);
          setReadyCount(next.length);
          patchAssessmentStorage();
          setStatus("ready");
        } catch (error) {
          console.error("OVERHAUL evidence perception failed", error);
          setStatus("error");
        } finally {
          active.current.delete(id);
          setPending((value) => Math.max(0, value - 1));
        }
      }

      input.value = "";
    };

    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("change", onChange, true);
      sessionStorage.setItem = originalSetItem;
    };
  }, []);

  if (status === "idle" && !readyCount) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 border border-steel/30 bg-navy/90 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-steel shadow-lg backdrop-blur"
    >
      {status === "analyzing" ? `AI perception · ${pending} analyzing` : null}
      {status === "ready" ? `AI perception · ${readyCount} extracted` : null}
      {status === "error" ? "AI perception · retry evidence" : null}
    </div>
  );
}
