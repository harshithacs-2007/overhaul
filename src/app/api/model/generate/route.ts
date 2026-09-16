import { NextResponse } from "next/server";
import { sanitizeTwinModel, type TwinModel } from "@/lib/engineering/twinModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 6;
const MAX_BYTES = 12 * 1024 * 1024;
const MODEL = process.env.NEBIUS_TWIN_MODEL || process.env.NEBIUS_VISION_MODEL || "nvidia/nemotron-3-nano-omni";
const BASE_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "");

const schema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "scope", "title", "className", "geometryBasis", "geometryStatus", "units", "overall", "rooms", "walls", "openings", "assets", "sourceEvidenceIds", "confidence", "warnings", "nextEvidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["overhaul.twin.v2"] },
    scope: { type: "string", enum: ["building", "facility", "equipment"] },
    title: { type: "string" }, className: { type: "string" },
    geometryBasis: { type: "string", enum: ["dimensioned-floorplan", "scaled-floorplan", "photo-layout", "parametric"] },
    geometryStatus: { type: "string", enum: ["verified-metric", "scaled-plan", "relative-only"] },
    units: { type: "string", enum: ["m", "scene"] },
    overall: { type: "object", additionalProperties: false, required: ["widthM", "depthM", "heightM"], properties: { widthM: { type: "number", minimum: 0.1 }, depthM: { type: "number", minimum: 0.1 }, heightM: { type: "number", minimum: 0.1 } } },
    rooms: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "x", "y", "widthM", "depthM", "heightM", "source", "confidence"], properties: { id: { type: "string" }, name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, widthM: { type: "number", minimum: 0.01 }, depthM: { type: "number", minimum: 0.01 }, heightM: { type: "number", minimum: 0.01 }, source: { type: "string", enum: ["floorplan", "user", "inferred"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    walls: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "a", "b", "thicknessM", "heightM", "source", "confidence"], properties: { id: { type: "string" }, a: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } }, b: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } }, thicknessM: { type: "number", minimum: 0.01 }, heightM: { type: "number", minimum: 0.01 }, source: { type: "string", enum: ["floorplan", "user", "inferred"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    openings: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "x", "y", "widthM", "source", "confidence"], properties: { id: { type: "string" }, type: { type: "string", enum: ["door", "window", "opening"] }, x: { type: "number" }, y: { type: "number" }, widthM: { type: "number", minimum: 0.01 }, wallId: { type: "string" }, source: { type: "string", enum: ["floorplan"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    assets: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "className", "x", "y", "widthM", "depthM", "heightM", "rotationDeg", "source", "confidence"], properties: { id: { type: "string" }, label: { type: "string" }, className: { type: "string" }, x: { type: "number" }, y: { type: "number" }, widthM: { type: "number", minimum: 0.01 }, depthM: { type: "number", minimum: 0.01 }, heightM: { type: "number", minimum: 0.01 }, rotationDeg: { type: "number" }, source: { type: "string", enum: ["floorplan", "photo", "nameplate", "user", "inferred"] }, evidenceId: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, observedState: { type: "string" } } } },
    sourceEvidenceIds: { type: "array", items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 1 }, warnings: { type: "array", items: { type: "string" } }, nextEvidence: { type: "array", items: { type: "string" } },
  },
};

function numberFrom(values: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function parametricTwin(scope: "building" | "facility" | "equipment", className: string, title: string, values: Record<string, unknown>): TwinModel | null {
  const width = numberFrom(values, "geometry_width_m", "width_m");
  const depth = numberFrom(values, "geometry_depth_m", "depth_m");
  const height = numberFrom(values, "geometry_height_m", "height_m");
  if (width == null || depth == null || height == null) return null;
  if (scope === "equipment") {
    return sanitizeTwinModel({ schemaVersion: "overhaul.twin.v2", scope, title, className, generatedAt: new Date().toISOString(), geometryBasis: "parametric", geometryStatus: "verified-metric", units: "m", overall: { widthM: width, depthM: depth, heightM: height }, rooms: [], walls: [], openings: [], assets: [{ id: "primary-asset", label: className, className, x: 0, y: 0, widthM: width, depthM: depth, heightM: height, rotationDeg: 0, source: "user", confidence: 1 }], sourceEvidenceIds: [], confidence: 1, warnings: ["Parametric equipment geometry is based only on explicitly supplied dimensions."], nextEvidence: ["Manufacturer dimensional drawing or nameplate dimensions"] });
  }
  return sanitizeTwinModel({ schemaVersion: "overhaul.twin.v2", scope, title, className, generatedAt: new Date().toISOString(), geometryBasis: "parametric", geometryStatus: "verified-metric", units: "m", overall: { widthM: width, depthM: depth, heightM: height }, rooms: [{ id: "primary-space", name: "Conditioned envelope", x: 0, y: 0, widthM: width, depthM: depth, heightM: height, source: "user", confidence: 1 }], walls: [{ id: "wall-n", a: { x: 0, y: 0 }, b: { x: width, y: 0 }, thicknessM: 0.01, heightM: height, source: "user", confidence: 1 }, { id: "wall-e", a: { x: width, y: 0 }, b: { x: width, y: depth }, thicknessM: 0.01, heightM: height, source: "user", confidence: 1 }, { id: "wall-s", a: { x: width, y: depth }, b: { x: 0, y: depth }, thicknessM: 0.01, heightM: height, source: "user", confidence: 1 }, { id: "wall-w", a: { x: 0, y: depth }, b: { x: 0, y: 0 }, thicknessM: 0.01, heightM: height, source: "user", confidence: 1 }], openings: [], assets: [], sourceEvidenceIds: [], confidence: 1, warnings: ["Parametric building geometry is based only on explicitly supplied dimensions; no visual dimensions were inferred."], nextEvidence: ["Dimensioned floor plan"] });
}

function prompt(input: { scope: string; className: string; industry: string; title: string; extracted: unknown[] }) {
  return `You are OVERHAUL's asset reconstruction engine. Build an editable geometric model from evidence for retrofit engineering.

Scope: ${input.scope}. Asset class: ${input.className}. Industry: ${input.industry}. Title: ${input.title}.

Hard integrity rules:
1. Never invent metric dimensions. If a number is not explicitly visible in a dimensioned drawing, nameplate, or user-entered field, it cannot be expressed as metres.
2. A clear but undimensioned plan may be represented proportionally with units='scene' and geometryStatus='scaled-plan'.
3. Photo-only geometry must be relative-only with units='scene'. It may describe relative placement and visible object proportions, but it must never be used as a metric engineering measurement.
4. Use geometryStatus='verified-metric' and units='m' only when overall dimensions are explicitly evidenced by a dimensioned plan, nameplate/manufacturer dimensions, or user input included in the supplied facts.
5. Preserve every visible equipment identity/specification fact without converting visual text into an unverified measurement.
6. Create rooms, walls, openings and visible assets separately. Coordinates must follow the stated plan convention.
7. Do not create a model with an empty geometric payload. When evidence is insufficient for geometry, return geometry with units='scene' only when relative structure is visually supported; otherwise the server will reject it.
8. Tie confidence to evidence quality, not model fluency.

Extracted engineering evidence and user anchors:
${JSON.stringify(input.extracted).slice(0, 42000)}

Return only JSON matching the schema.`;
}

async function fileToDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.NEBIUS_API_KEY;
    const form = await request.formData();
    const scope = String(form.get("scope") || "building") as "building" | "facility" | "equipment";
    const className = String(form.get("className") || scope).slice(0, 120);
    const industry = String(form.get("industry") || "other").slice(0, 80);
    const title = String(form.get("title") || "OVERHAUL Twin").slice(0, 120);
    let extracted: unknown[] = [];
    try { const parsed = JSON.parse(String(form.get("extracted") || "[]")) as { observations?: unknown[]; supplemental?: Record<string, unknown>; [key: string]: unknown }; extracted = [parsed]; } catch { extracted = []; }
    const supplemental = extracted[0] && typeof extracted[0] === "object" && (extracted[0] as { supplemental?: Record<string, unknown> }).supplemental ? (extracted[0] as { supplemental: Record<string, unknown> }).supplemental : {};
    const entries = form.getAll("file").filter((value): value is File => value instanceof File).slice(0, MAX_FILES);
    const images = entries.filter((file) => file.size > 0 && file.size <= MAX_BYTES && file.type.startsWith("image/"));

    // Never let an image-less submission overwrite a real scan twin with a made-up model.
    if (!images.length) {
      const parametric = parametricTwin(scope, className, title, supplemental);
      if (parametric) return NextResponse.json({ model: parametric, generated: "parametric", provider: "OVERHAUL deterministic geometry" });
      return NextResponse.json({ error: "No geometry evidence was supplied. Add a scan/photo or explicit width, depth and height; OVERHAUL will not invent a 3D model." }, { status: 422 });
    }
    if (!apiKey) return NextResponse.json({ error: "Nebius multimodal twin generation is not configured." }, { status: 503 });

    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt({ scope, className, industry, title, extracted }) }];
    for (const file of images) content.push({ type: "image_url", image_url: { url: await fileToDataUrl(file) } });
    const response = await fetch(`${BASE_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }], response_format: { type: "json_schema", json_schema: { name: "overhaul_twin", strict: true, schema } }, temperature: 0, max_tokens: 10000 }) });
    if (!response.ok) { console.error("Twin generation failed", response.status, (await response.text()).slice(0, 800)); return NextResponse.json({ error: "Twin generation failed." }, { status: 502 }); }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "null") as Record<string, unknown> | null;
    if (!parsed) return NextResponse.json({ error: "Twin model response was empty." }, { status: 502 });

    const hasMetricAnchor = Boolean(numberFrom(supplemental, "geometry_width_m", "width_m") && numberFrom(supplemental, "geometry_depth_m", "depth_m") && numberFrom(supplemental, "geometry_height_m", "height_m")) || extracted.some((item) => JSON.stringify(item).match(/(?:dimension|width|depth|height).{0,60}(?:m|meter|metre)/i));
    if (!hasMetricAnchor && parsed.units === "m") {
      parsed.units = "scene";
      parsed.geometryStatus = "relative-only";
      if (parsed.geometryBasis === "dimensioned-floorplan") parsed.geometryBasis = "photo-layout";
      parsed.warnings = [...(Array.isArray(parsed.warnings) ? parsed.warnings : []), "Metric scale was not evidenced; geometry has been downgraded to relative-only scene units."];
    }
    const twin = sanitizeTwinModel(parsed);
    if (!twin) return NextResponse.json({ error: "Twin geometry was rejected because it was incomplete or claimed unsupported metric precision." }, { status: 422 });
    return NextResponse.json({ model: { ...twin, generatedAt: new Date().toISOString() }, modelName: MODEL, provider: "Nebius Token Factory / NVIDIA Nemotron" });
  } catch (error) {
    console.error("Twin generation route error", error);
    return NextResponse.json({ error: "Twin generation failed." }, { status: 500 });
  }
}
