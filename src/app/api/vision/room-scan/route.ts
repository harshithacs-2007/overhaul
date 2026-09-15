import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const MODEL = process.env.NEBIUS_VISION_MODEL || "nvidia/nemotron-3-nano-omni";
const BASE_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "");

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "detections", "engineering_clues", "coverage_notes", "visible_details"],
  properties: {
    summary: { type: "string" },
    detections: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "confidence", "box", "condition", "evidence"], properties: {
      label: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 },
      box: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: {
        x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 },
        width: { type: "number", minimum: 0, maximum: 1 }, height: { type: "number", minimum: 0, maximum: 1 },
      } },
      condition: { type: "string" }, evidence: { type: "string" },
    } } },
    engineering_clues: { type: "array", items: { type: "string" } },
    coverage_notes: { type: "array", items: { type: "string" } },
    visible_details: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "value", "confidence"], properties: {
      field: { type: "string" }, value: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 },
    } } },
  },
};

function prompt(scope: string, sector: number, sectorCount: number) {
  return `You are OVERHAUL's multimodal perception layer for an engineering retrofit workflow.

This frame is sector ${sector + 1} of ${sectorCount} in a guided visual sweep. Target: ${scope}.

Identify only what is visibly present. Return normalized bounding boxes in x/y/width/height from 0 to 1.

Look for engineering-relevant objects and visible conditions: HVAC equipment, ducts, diffusers, vents, pipes, valves, pumps, motors, fans, chillers, compressors, boilers, refrigeration, electrical panels, meters, windows, doors, insulation, radiators, lights, ceilings, leaks, corrosion, damaged insulation, blocked airflow, clutter around equipment, labels and nameplates.

Also extract clearly visible labelled details such as manufacturer, model, rated voltage, rated capacity, frequency, serial number, and other nameplate text into visible_details. NEVER infer them from appearance or a model family.

Rules:
- Never invent hidden specifications, measurements, faults, or dimensions.
- Visual condition is not a measured fault.
- Confidence is visual/extraction confidence only.
- Keep engineering clues evidence-grounded.
- For uncertain text, omit it rather than guessing.
- Bounding boxes cover the visible object/condition only.`;
}

async function toDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function POST(request: Request) {
  const rl = rateLimit(`vision-room-scan:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Camera analysis rate limit exceeded. Try again shortly." }, { status: 429 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const scope = String(form.get("scope") || "room").slice(0, 40);
    const rawSector = Number(form.get("sector") || 0);
    const rawSectorCount = Number(form.get("sectorCount") || 12);
    const sector = Number.isFinite(rawSector) ? Math.max(0, Math.min(99, rawSector)) : 0;
    const sectorCount = Number.isFinite(rawSectorCount) ? Math.max(1, Math.min(100, rawSectorCount)) : 12;

    if (!(file instanceof File)) return NextResponse.json({ error: "Scan frame is required." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Scan frame must be <= 8 MB." }, { status: 413 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Scan frame must be an image." }, { status: 415 });

    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Nebius computer vision is not configured on this deployment." }, { status: 503 });

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt(scope, sector, sectorCount) },
          { type: "image_url", image_url: { url: await toDataUrl(file) } },
        ] }],
        response_format: { type: "json_schema", json_schema: { name: "overhaul_room_scan", strict: true, schema } },
        temperature: 0.1,
        max_tokens: 3500,
      }),
    });

    if (!response.ok) {
      console.error("Nebius vision failed", response.status, (await response.text()).slice(0, 600));
      return NextResponse.json({ error: "Computer vision analysis failed." }, { status: 502 });
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Computer vision returned no structured result." }, { status: 502 });
    const result = JSON.parse(content);
    return NextResponse.json({ result: { ...result, model: MODEL, provider: "Nebius Token Factory / NVIDIA Nemotron", sector, sectorCount }, meta: { rateLimitRemaining: rl.remaining } });
  } catch (error) {
    console.error("Room scan route error", error);
    return NextResponse.json({ error: "Computer vision analysis failed." }, { status: 500 });
  }
}
