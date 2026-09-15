"use client";

import { useEffect, useMemo, useState } from "react";

type Finding = {
  id: string;
  type: string;
  label: string;
  confidence: number;
  views: number;
  evidence: string;
  engineeringStatus: "observed" | "requires-verification";
  requiredVerification: string;
  retrofitRelevance: string;
};

type Fusion = {
  summary?: string;
  objects?: Array<{ label: string; views: number; confidence: number; evidence: string }>;
  findings?: Finding[];
  coverage?: { viewsAnalysed: number; repeatConfirmed: number; blindSpots: string[] };
  nextEvidence?: string[];
};

type Scan = {
  sectors?: Array<{ result?: { summary?: string; detections?: Array<{ label: string; confidence: number; condition?: string; evidence?: string }>; engineering_clues?: string[]; coverage_notes?: string[] }; sector?: number }>;
  completed?: boolean;
};

export default function ScanFusionPanel() {
  const [fusion, setFusion] = useState<Fusion | null>(null);
  const [status, setStatus] = useState<"idle" | "analysing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const analyse = async () => {
    let scan: Scan | null = null;
    try { scan = JSON.parse(sessionStorage.getItem("overhaul:room-scan") || "null") as Scan | null; } catch { scan = null; }
    const analyses = (scan?.sectors || []).filter((sector) => sector.result).map((sector) => ({ sector: sector.sector ?? 0, ...sector.result }));
    if (!analyses.length) return;
    setStatus("analysing");
    setError(null);
    try {
      const assessment = JSON.parse(sessionStorage.getItem("overhaul:assessment") || "{}") as { assessmentSubject?: string };
      const response = await fetch("/api/vision/scan-fusion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: assessment.assessmentSubject || "building", analyses }) });
      const payload = await response.json() as { result?: Fusion; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Cross-view analysis failed.");
      setFusion(payload.result);
      setStatus("ready");
      sessionStorage.setItem("overhaul:scan-fusion", JSON.stringify(payload.result));
      window.dispatchEvent(new CustomEvent("overhaul:scan-fusion-change"));
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Cross-view analysis failed.");
    }
  };

  useEffect(() => {
    try {
      const existing = JSON.parse(sessionStorage.getItem("overhaul:scan-fusion") || "null") as Fusion | null;
      if (existing) { setFusion(existing); setStatus("ready"); return; }
    } catch {}
    void analyse();
    const onChange = () => void analyse();
    window.addEventListener("overhaul:evidence-change", onChange);
    return () => window.removeEventListener("overhaul:evidence-change", onChange);
  }, []);

  const findings = useMemo(() => fusion?.findings || [], [fusion]);
  const confirmed = findings.filter((finding) => finding.views >= 2).length;
  if (!fusion && status === "idle") return null;

  return <section className="overflow-hidden border border-amber-200/15 bg-[#080a09]">
    <div className="border-b border-steel/10 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[.18em] text-amber-200">Cross-view problem intelligence</p>
          <h2 className="mt-1 font-display text-2xl">Separate what the camera saw from what engineering still needs to prove.</h2>
          <p className="mt-2 max-w-4xl text-[10px] leading-5 text-steel">The scan is fused across independent views so repeated visible conditions are confirmed visually, while unmeasured faults remain explicitly verification-gated.</p>
        </div>
        <button type="button" onClick={() => void analyse()} disabled={status === "analysing"} className="border border-amber-200/25 px-3 py-2 font-mono text-[8px] uppercase text-amber-200 disabled:opacity-40">{status === "analysing" ? "Analysing…" : "Re-analyse sweep"}</button>
      </div>
    </div>

    {status === "error" ? <div className="border-b border-red-300/15 bg-red-300/[.03] px-5 py-4 text-[9px] text-red-200">{error}</div> : null}
    {fusion ? <>
      <div className="grid gap-2 border-b border-steel/10 p-5 sm:grid-cols-4">
        <Metric label="Analysed views" value={String(fusion.coverage?.viewsAnalysed ?? 0)} />
        <Metric label="Repeat-confirmed findings" value={String(fusion.coverage?.repeatConfirmed ?? confirmed)} />
        <Metric label="Findings" value={String(findings.length)} />
        <Metric label="Next evidence" value={String(fusion.nextEvidence?.length ?? 0)} />
      </div>
      {fusion.summary ? <div className="border-b border-steel/10 px-5 py-4 text-[10px] leading-5 text-paper">{fusion.summary}</div> : null}
      <div className="grid gap-3 p-5 lg:grid-cols-2">
        {findings.map((finding) => <article key={finding.id} className="border border-steel/12 bg-black/15 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-mono text-[7px] uppercase tracking-[.12em] text-steel">{finding.type}</p><h3 className="mt-1 text-sm text-paper">{finding.label}</h3></div>
            <span className={`border px-2 py-1 font-mono text-[7px] uppercase ${finding.engineeringStatus === "observed" ? "border-teal/25 text-teal" : "border-amber-200/25 text-amber-200"}`}>{finding.engineeringStatus}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Visual confidence" value={`${Math.round(finding.confidence * 100)}%`} /><Metric label="Views" value={String(finding.views)} /></div>
          <p className="mt-3 text-[9px] leading-5 text-steel"><span className="text-paper">Evidence:</span> {finding.evidence}</p>
          <p className="mt-2 text-[9px] leading-5 text-steel"><span className="text-paper">Verify:</span> {finding.requiredVerification}</p>
          <p className="mt-2 text-[9px] leading-5 text-steel"><span className="text-paper">Retrofit relevance:</span> {finding.retrofitRelevance}</p>
        </article>)}
      </div>
      {fusion.nextEvidence?.length ? <div className="border-t border-steel/10 px-5 py-4"><p className="font-mono text-[8px] uppercase text-amber-200">Next evidence to collect</p><div className="mt-2 flex flex-wrap gap-2">{fusion.nextEvidence.slice(0, 8).map((item) => <span key={item} className="border border-steel/15 px-2.5 py-1.5 text-[8px] text-steel">{item}</span>)}</div></div> : null}
    </> : <div className="grid min-h-[180px] place-items-center p-6 text-center text-[9px] text-steel">{status === "analysing" ? "Fusing the captured views and checking which observations repeat…" : "No analysed scan is available yet."}</div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>; }
