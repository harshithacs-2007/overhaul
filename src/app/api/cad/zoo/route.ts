import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZOO_BASE_URL = (process.env.ZOO_BASE_URL || "https://api.zoo.dev").replace(/\/$/, "");

function safe(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function positive(value: unknown) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function fallbackKcl(label: string, width: number, depth: number, height: number) {
  const w = width * 1000; const d = depth * 1000; const h = height * 1000;
  return `// OVERHAUL deterministic CAD fallback\n// Asset: ${label}\n// Dimensions are supplied by verified evidence.\nconst width = ${w.toFixed(1)}mm\nconst depth = ${d.toFixed(1)}mm\nconst height = ${h.toFixed(1)}mm\n\n// Refine this counterfactual into an editable feature tree in Zoo Design Studio.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { assetLabel?: unknown; retrofit?: unknown; dimensions?: { widthM?: unknown; depthM?: unknown; heightM?: unknown }; observedState?: unknown; geometryStatus?: unknown; units?: unknown };
    const assetLabel = safe(body.assetLabel, 120) || "retrofit component";
    const retrofit = safe(body.retrofit, 500) || "improve the asset for retrofit comparison";
    const observedState = safe(body.observedState, 500);
    if (body.geometryStatus !== "verified-metric" || body.units !== "m") return NextResponse.json({ error: "CAD generation is locked until the digital twin has verified metric geometry from explicit evidence." }, { status: 422 });
    const width = positive(body.dimensions?.widthM); const depth = positive(body.dimensions?.depthM); const height = positive(body.dimensions?.heightM);
    if (width == null || depth == null || height == null) return NextResponse.json({ error: "Verified width, depth and height are required. OVERHAUL will not substitute guessed dimensions." }, { status: 422 });
    const prompt = `Create a parametric CAD counterfactual for an OVERHAUL retrofit digital twin. Asset: ${assetLabel}. Observed state: ${observedState || "visible asset; operating state remains evidence-gated"}. Retrofit intervention: ${retrofit}. Verified metric envelope: ${width}m wide × ${depth}m deep × ${height}m high. Preserve the observed envelope and model only the proposed retrofit geometry. Prefer simple editable solids, explicit dimensions, named parameters, and manufacturing-aware feature operations. Do not invent hidden components, performance values, material properties, or unverified dimensions. Return KCL suitable for Zoo's parametric CAD workflow.`;
    const token = process.env.ZOO_API_TOKEN;
    if (!token) return NextResponse.json({ provider: "OVERHAUL deterministic CAD fallback", status: "fallback", kcl: fallbackKcl(assetLabel, width, depth, height), prompt, warning: "ZOO_API_TOKEN is not configured; deterministic CAD scaffolding is shown without inventing geometry." });
    const response = await fetch(`${ZOO_BASE_URL}/ml/kcl/completions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, max_tokens: 6000, n: 1, temperature: 0.1, stream: false, extra: { language: "kcl" } }) });
    if (!response.ok) { console.error("Zoo KCL generation failed", response.status, (await response.text()).slice(0, 600)); return NextResponse.json({ provider: "OVERHAUL deterministic CAD fallback", status: "fallback", kcl: fallbackKcl(assetLabel, width, depth, height), prompt, warning: "Zoo CAD generation was unavailable; evidence-backed deterministic CAD scaffolding was retained." }); }
    const payload = await response.json() as { completions?: string[] }; const kcl = payload.completions?.[0]?.trim();
    if (!kcl) return NextResponse.json({ error: "Zoo returned no CAD completion." }, { status: 502 });
    return NextResponse.json({ provider: "Zoo KCL CAD model builder", status: "generated", kcl, prompt });
  } catch (error) { console.error("Zoo CAD route error", error); return NextResponse.json({ error: "CAD generation failed." }, { status: 500 }); }
}
