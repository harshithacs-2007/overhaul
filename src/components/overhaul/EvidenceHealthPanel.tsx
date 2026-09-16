"use client";

import { useEffect, useState } from "react";

export default function EvidenceHealthPanel() {
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => {
      try {
        const value = JSON.parse(sessionStorage.getItem("overhaul:evidence-extraction-failures") || "[]");
        setFailures(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
      } catch {
        setFailures([]);
      }
    };
    sync();
    window.addEventListener("overhaul:evidence-change", sync);
    return () => window.removeEventListener("overhaul:evidence-change", sync);
  }, []);

  if (!failures.length) return null;

  return (
    <section className="border border-amber-200/25 bg-amber-200/[.025] p-5" aria-live="polite">
      <p className="font-mono text-[8px] uppercase tracking-[.14em] text-amber-200">Perception health</p>
      <h2 className="mt-1 font-display text-2xl">Some evidence was not machine-read.</h2>
      <p className="mt-2 text-[9px] leading-5 text-steel">The original evidence remains valid and is not replaced with guesses. Re-run the affected evidence when the perception service is available, or continue with explicit/manual anchors.</p>
      <div className="mt-3 space-y-2">
        {failures.map((failure) => <div key={failure} className="border border-amber-200/10 bg-black/20 px-3 py-2 font-mono text-[8px] text-steel">{failure}</div>)}
      </div>
    </section>
  );
}
