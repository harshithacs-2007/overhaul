"use client";

import { useEffect, useState } from "react";

type ScanFailure = { sector: number; error: string };

export default function EvidenceHealthPanel() {
  const [failures, setFailures] = useState<string[]>([]);
  const [scanFailures, setScanFailures] = useState<ScanFailure[]>([]);

  useEffect(() => {
    const sync = () => {
      try {
        const extraction = JSON.parse(sessionStorage.getItem("overhaul:evidence-extraction-failures") || "[]");
        const scan = JSON.parse(sessionStorage.getItem("overhaul:scan-failures") || "[]");
        setFailures(Array.isArray(extraction) ? extraction.filter((item): item is string => typeof item === "string") : []);
        setScanFailures(Array.isArray(scan) ? scan.filter((item): item is ScanFailure => Boolean(item && typeof item.sector === "number" && typeof item.error === "string")) : []);
      } catch {
        setFailures([]);
        setScanFailures([]);
      }
    };
    sync();
    const events = ["overhaul:evidence-change", "overhaul:scan-failure-change", "overhaul:assessment-change"];
    events.forEach((event) => window.addEventListener(event, sync));
    return () => events.forEach((event) => window.removeEventListener(event, sync));
  }, []);

  if (!failures.length && !scanFailures.length) return null;

  return (
    <section className="border border-amber-200/25 bg-amber-200/[.025] p-5" aria-live="polite">
      <p className="font-mono text-[8px] uppercase tracking-[.14em] text-amber-200">Perception health</p>
      <h2 className="mt-1 font-display text-2xl">Some evidence was not machine-read.</h2>
      <p className="mt-2 text-[9px] leading-5 text-steel">The original evidence remains valid and is not replaced with guesses. Re-run the affected evidence when the perception service is available, or continue with explicit/manual anchors.</p>
      {failures.length ? <div className="mt-3 space-y-2">{failures.map((failure) => <div key={failure} className="border border-amber-200/10 bg-black/20 px-3 py-2 font-mono text-[8px] text-steel">{failure}</div>)}</div> : null}
      {scanFailures.length ? <div className="mt-3 space-y-2"><p className="font-mono text-[7px] uppercase text-steel">Scan sectors requiring re-analysis</p>{scanFailures.map((failure) => <div key={`${failure.sector}-${failure.error}`} className="border border-amber-200/10 bg-black/20 px-3 py-2 font-mono text-[8px] text-steel">Sector {failure.sector + 1}: {failure.error}</div>)}</div> : null}
    </section>
  );
}
