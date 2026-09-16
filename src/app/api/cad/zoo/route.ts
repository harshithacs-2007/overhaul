import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZOO_BASE_URL = (process.env.ZOO_BASE_URL || "https://api.zoo.dev").replace(/\/$/, "");

function safe(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fallbackKcl(label: string, width: number, depth: number, height: number) {
  const w = Math.max(width * 1000, 10);
  const d = Math.max(depth * 1000, 10);
  const h = Math.max(height * 1000, 10);
  return `// OVERHAUL deterministic CAD fallback\n// Asset: ${label}\n// Dimensions are supplied by the evidence model.\nconst width = ${w.toFixed(1)}mm\nconst depth = ${d.toFixed(1)}mm\nconst height = ${h.toFixed(1)}mm\n\n// Use Zoo Design Studio to refine this counterfactual into an editable feature tree.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { assetLabel?: unknown; retrofit?: unknown; dimensions?: { widthM?: unknown; depthM?: unknown; heightM?: unknown }; observedState?: unknown };
    const assetLabel = safe(body.assetLabel, 120) || "retrofit component";
    const retrofit = safe(body.retrofit, 500) || "improve the asset for retrofit comparison";
    const observedState = safe(body.observedState, 500);
    const width = Number(body.dimensions?.widthM);
    const depth = Number(body.dimensions?.depthM);
    const height = Number(body.dimensions?.heightM);
    const dimensions = { widthM: Number.isFinite(width) && width > 0 ? width : 1, depthM: Number.isFinite(depth) && depth > 0 ? depth : 1, heightM: Number.isFinite(height) && height > 0 ? height : 1 };
    const prompt = `Create a parametric CAD counterfactual for an OVERHAUL retrofit digital twin. Asset: ${assetLabel}. Observed state: ${observedState || "visible asset; operating state remains evidence-gated"}. Retrofit intervention: ${retrofit}. Use these existing metric envelope dimensions only as starting constraints: ${dimensions.widthM}m wide × ${dimensions.depthM}m deep × ${dimensions.heightM}m high. Preserve the observed envelope and model only the proposed retrofit geometry. Prefer simple editable solids, explicit dimensions, named parameters, and manufacturing-aware feature operations. Do not invent hidden components, performance values, material properties, or unverified dimensions. Return KCL suitable for Zoo's parametric CAD workflow.`;

    const token = process.env.ZOO_API_TOKEN;
    if (!token) {
      return NextResponse.json({ provider: "OVERHAUL fallback", status: "fallback", kcl: fallbackKcl(assetLabel, dimensions.widthM, dimensions.depthM, dimensions.heightM), prompt, warning: "ZOO_API_TOKEN is not configured; the UI remains usable with deterministic CAD scaffolding." });
    }

    const response = await fetch(`${ZOO_BASE_URL}/ml/kcl/completions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, max_tokens: 6000, n: 1, temperature: 0.1, stream: false, extra: { language: "kcl" } }) });
    if (!response.ok) {
      console.error("Zoo KCL generation failed", response.status, (await response.text()).slice(0, 600));
      return NextResponse.json({ provider: "OVERHAUL fallback", status: "fallback", kcl: fallbackKcl(assetLabel, dimensions.widthM, dimensions.depthM, dimensions.heightM), prompt, warning: "Zoo CAD generation was unavailable, so OVERHAUL kept the evidence-backed deterministic scaffold." });
    }
    const payload = await response.json() as { completions?: string[] };
    const kcl = payload.completions?.[0]?.trim();
    if (!kcl) return NextResponse.json({ error: "Zoo returned no CAD completion." }, { status: 502 });
    return NextResponse.json({ provider: "Zoo KCL CAD model builder", status: "generated", kcl, prompt });
  } catch (error) {
    console.error("Zoo CAD route error", error);
    return NextResponse.json({ error: "CAD generation failed." }, { status: 500 });
  }
}
