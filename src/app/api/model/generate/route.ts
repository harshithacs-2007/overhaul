import { NextResponse } from "next/server";
import { sanitizeTwinModel } from "@/lib/engineering/twinModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 6;
const MAX_BYTES = 12 * 1024 * 1024;
const MODEL = process.env.NEBIUS_TWIN_MODEL || process.env.NEBIUS_VISION_MODEL || "nvidia/nemotron-3-nano-omni";
const BASE_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "");

const schema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "scope", "title", "className", "geometryBasis", "overall", "rooms", "walls", "openings", "assets", "sourceEvidenceIds", "confidence", "warnings", "nextEvidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["overhaul.twin.v2"] },
    scope: { type: "string", enum: ["building", "facility", "equipment"] },
    title: { type: "string" }, className: { type: "string" },
    geometryBasis: { type: "string", enum: ["dimensioned-floorplan", "scaled-floorplan", "photo-layout", "parametric"] },
    overall: { type: "object", additionalProperties: false, required: ["widthM", "depthM", "heightM"], properties: { widthM: { type: "number", minimum: 0.1 }, depthM: { type: "number", minimum: 0.1 }, heightM: { type: "number", minimum: 0.1 } } },
    rooms: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "x", "y", "widthM", "depthM", "heightM", "source", "confidence"], properties: { id: { type: "string" }, name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, widthM: { type: "number", minimum: 0.1 }, depthM: { type: "number", minimum: 0.1 }, heightM: { type: "number", minimum: 0.1 }, source: { type: "string", enum: ["floorplan", "user", "inferred"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    walls: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "a", "b", "thicknessM", "heightM", "source", "confidence"], properties: { id: { type: "string" }, a: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } }, b: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } }, thicknessM: { type: "number", minimum: 0.03 }, heightM: { type: "number", minimum: 0.5 }, source: { type: "string", enum: ["floorplan", "user", "inferred"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    openings: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "x", "y", "widthM", "source", "confidence"], properties: { id: { type: "string" }, type: { type: "string", enum: ["door", "window", "opening"] }, x: { type: "number" }, y: { type: "number" }, widthM: { type: "number", minimum: 0.1 }, wallId: { type: "string" }, source: { type: "string", enum: ["floorplan"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    assets: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "className", "x", "y", "widthM", "depthM", "heightM", "rotationDeg", "source", "confidence"], properties: { id: { type: "string" }, label: { type: "string" }, className: { type: "string" }, x: { type: "number" }, y: { type: "number" }, widthM: { type: "number", minimum: 0.05 }, depthM: { type: "number", minimum: 0.05 }, heightM: { type: "number", minimum: 0.05 }, rotationDeg: { type: "number" }, source: { type: "string", enum: ["floorplan", "photo", "nameplate", "user", "inferred"] }, evidenceId: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, observedState: { type: "string" } } } },
    sourceEvidenceIds: { type: "array", items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 1 }, warnings: { type: "array", items: { type: "string" } }, nextEvidence: { type: "array", items: { type: "string" } },
  },
};

function normalizeName(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback; }

function prompt(input: { scope: string; className: string; industry: string; title: string; hasFloorplan: boolean; extracted: unknown[] }) {
  return `You are OVERHAUL's asset reconstruction engine. Build a useful, editable parametric twin from evidence for retrofit engineering.

Scope: ${input.scope}. Asset class: ${input.className}. Industry: ${input.industry}. Title: ${input.title}.
A floor plan is present: ${input.hasFloorplan ? "YES" : "NO"}.

Goal: turn floor-plan imagery + photos + extracted engineering facts into a structured 2D/3D model that can drive a browser 3D scene and CAD export.

Coordinate convention: x east/right, y north/up in plan view, z vertical. Units are metres.

Geometry rules:
1. If a dimension is explicitly shown on a floor plan, use it and mark geometryBasis as dimensioned-floorplan.
2. If a floor plan is clear but undimensioned, reconstruct proportional geometry from the drawing and mark geometryBasis scaled-floorplan. Do not claim metric accuracy.
3. If only photos are available, create photo-layout geometry only when relative placement is visually defensible; otherwise use parametric and keep confidence low.
4. Never derive exact metric dimensions from visual appearance alone. Never invent hidden dimensions.
5. Create walls, rooms, openings and visible equipment/fixtures separately.
6. Place detected HVAC/equipment/machines where the evidence supports location. Do not assign coordinates that the evidence does not establish.
7. For equipment-only assets, create a parametric 3D envelope from explicit dimensions if present; otherwise use conservative generic envelope geometry and mark warnings that dimensions remain unresolved.
8. Keep every object confidence tied to evidence quality.
9. Use source='floorplan' for plan-derived geometry, source='photo' for photo-located assets, source='nameplate' for identity/spec evidence, and source='inferred' only for structural continuity such as a wall edge that is visually implied by a clear floor-plan boundary.
10. The returned model must be immediately renderable: no NaN, no missing required objects.

Retrofit relevance: preserve visible HVAC zones, mechanical rooms, service spaces, windows/doors, thermal-envelope boundaries, and equipment because later logic uses them to reason about intervention pathways.

Extracted engineering evidence (not geometry truth): ${JSON.stringify(input.extracted).slice(0, 30000)}

Return only JSON matching the schema.`;
}

async function fileToDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Nebius multimodal twin generation is not configured." }, { status: 503 });
    const form = await request.formData();
    const scope = normalizeName(form.get("scope"), "building");
    const className = normalizeName(form.get("className"), scope);
    const industry = normalizeName(form.get("industry"), "other");
    const title = normalizeName(form.get("title"), "OVERHAUL Twin");
    const evidenceRaw = String(form.get("extracted") || "[]");
    let extracted: unknown[] = [];
    try { extracted = JSON.parse(evidenceRaw) as unknown[]; } catch { extracted = []; }
    const entries = form.getAll("file").filter((value): value is File => value instanceof File).slice(0, MAX_FILES);
    const images = entries.filter((file) => file.size > 0 && file.size <= MAX_BYTES && file.type.startsWith("image/"));
    const hasFloorplan = entries.some((file) => /floor|plan|layout|blueprint|drawing/i.test(file.name));
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt({ scope, className, industry, title, hasFloorplan, extracted }) }];
    for (const file of images) content.push({ type: "image_url", image_url: { url: await fileToDataUrl(file) } });

    const response = await fetch(`${BASE_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }], response_format: { type: "json_schema", json_schema: { name: "overhaul_twin", strict: true, schema } }, temperature: 0.05, max_tokens: 8000 }) });
    if (!response.ok) { console.error("Twin generation failed", response.status, (await response.text()).slice(0, 800)); return NextResponse.json({ error: "Twin generation failed." }, { status: 502 }); }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "null");
    const twin = sanitizeTwinModel(parsed);
    if (!twin) return NextResponse.json({ error: "Twin model was structurally invalid." }, { status: 502 });
    return NextResponse.json({ model: { ...twin, generatedAt: new Date().toISOString(), model: MODEL, provider: "Nebius Token Factory / NVIDIA Nemotron" } });
  } catch (error) {
    console.error("Twin generation route error", error);
    return NextResponse.json({ error: "Twin generation failed." }, { status: 500 });
  }
}
