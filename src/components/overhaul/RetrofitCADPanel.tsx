"use client";

import { useMemo, useState } from "react";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;

function numberValue(values: Values, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export default function RetrofitCADPanel({ scope, values, twin }: { scope: Scope; values: Values; twin: TwinModel }) {
  const [retrofit, setRetrofit] = useState("Replace the evidenced asset with a higher-efficiency retrofit equivalent while preserving installation footprint and service clearances.");
  const [kcl, setKcl] = useState("");
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const width = numberValue(values, "geometry_width_m", "width_m") ?? twin.overall.widthM;
  const depth = numberValue(values, "geometry_depth_m", "depth_m") ?? twin.overall.depthM;
  const height = numberValue(values, "geometry_height_m", "height_m") ?? twin.overall.heightM;
  const target = useMemo(() => twin.assets.find((asset) => !/retrofit-envelope-marker|RETROFIT TARGET|CONTROL \/ RUNTIME TARGET/i.test(`${asset.className} ${asset.observedState || ""}`)) ?? twin.assets[0] ?? null, [twin.assets]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/cad/zoo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, assetLabel: target?.label || "retrofit component", observedState: target?.observedState || "visual evidence only", retrofit, dimensions: { widthM: target?.widthM ?? width, depthM: target?.depthM ?? depth, heightM: target?.heightM ?? height } }) });
      const payload = await response.json() as { kcl?: string; provider?: string; warning?: string; error?: string };
      if (!response.ok || !payload.kcl) throw new Error(payload.error || "CAD generation failed.");
      setKcl(payload.kcl);
      setProvider(payload.warning ? `${payload.provider} · ${payload.warning}` : payload.provider || "Zoo CAD");
      sessionStorage.setItem("overhaul:retrofit-cad", JSON.stringify({ kcl: payload.kcl, provider: payload.provider, generatedAt: new Date().toISOString(), asset: target?.label || "retrofit component", retrofit }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CAD generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => { if (!kcl) return; await navigator.clipboard?.writeText(kcl); };

  return <section className="overflow-hidden border border-violet-200/15 bg-[#08070c] shadow-[0_26px_100px_rgba(0,0,0,.2)]"><div className="border-b border-steel/10 px-5 py-5"><p className="font-mono text-[8px] uppercase tracking-[.18em] text-violet-200">Counterfactual CAD layer</p><h2 className="mt-1 font-display text-3xl">Turn the retrofit into editable geometry.</h2><p className="mt-2 max-w-4xl text-[10px] leading-5 text-steel">The observed twin stays the baseline. This layer asks a CAD-specific model to construct the proposed intervention geometry from evidenced dimensions instead of replacing the evidence model with an invented mesh.</p></div><div className="grid gap-0 xl:grid-cols-[.72fr_1.28fr]"><div className="border-b border-steel/10 p-5 xl:border-b-0 xl:border-r"><div className="grid grid-cols-3 gap-2"><Metric label="Target" value={target?.label || "No asset"}/><Metric label="Width" value={`${width.toFixed(2)} m`}/><Metric label="Height" value={`${height.toFixed(2)} m`}/></div><label className="mt-4 block"><span className="font-mono text-[8px] uppercase tracking-[.14em] text-steel">Retrofit intent</span><textarea value={retrofit} onChange={(event) => setRetrofit(event.target.value)} rows={7} className="mt-2 w-full resize-none border border-steel/20 bg-black/20 p-3 text-[10px] leading-5 text-paper outline-none focus:border-violet-200/40"/></label><button type="button" onClick={() => void generate()} disabled={busy || !target} className="mt-4 w-full border border-violet-200/30 bg-violet-200/5 px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-violet-100 disabled:opacity-35">{busy ? "Generating CAD…" : "Generate retrofit CAD"}</button>{provider ? <p className="mt-3 text-[8px] leading-4 text-steel">{provider}</p> : null}{error ? <p className="mt-3 border border-clay/25 bg-clay/5 p-3 text-[9px] text-clay">{error}</p> : null}</div><div className="min-h-[360px] bg-black/20 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-[8px] uppercase text-steel">Parametric output</p><p className="mt-1 text-[10px] text-paper">Zoo-compatible KCL / deterministic fallback</p></div><button type="button" onClick={() => void copy()} disabled={!kcl} className="border border-steel/20 px-3 py-2 font-mono text-[8px] uppercase text-steel disabled:opacity-30">Copy KCL</button></div>{kcl ? <pre className="mt-4 max-h-[420px] overflow-auto border border-steel/10 bg-[#030404] p-4 font-mono text-[8px] leading-4 text-teal">{kcl}</pre> : <div className="mt-4 grid min-h-[280px] place-items-center border border-dashed border-steel/15 text-center"><div><p className="font-mono text-[8px] uppercase text-steel">CAD counterfactual idle</p><p className="mt-2 max-w-sm text-[9px] leading-5 text-steel">Generate a proposed geometry after the observed asset is reconstructed. This keeps current-state evidence and retrofit geometry separate.</p></div></div>}</div></div></section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 bg-black/15 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 text-[10px] text-paper">{value}</p></div>; }
