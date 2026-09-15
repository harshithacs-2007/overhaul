import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const MODEL = "gpt-5.6-terra";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "detections", "engineering_clues", "coverage_notes"],
  properties: {
    summary: { type: "string" },
    detections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "confidence", "box", "condition", "evidence"],
        properties: {
          label: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          box: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "number", minimum: 0, maximum: 1 },
              y: { type: "number", minimum: 0, maximum: 1 },
              width: { type: "number", minimum: 0, maximum: 1 },
              height: { type: "number", minimum: 0, maximum: 1 },
            },
          },
          condition: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    engineering_clues: { type: "array", items: { type: "string" } },
    coverage_notes: { type: "array", items: { type: "string" } },
  },
};

function prompt(scope: string, sector: number, sectorCount: number) {
  return `You are OVERHAUL computer vision for a live room/facility scan.

This is sector ${sector + 1} of ${sectorCount} in a guided 360-degree visual sweep. Assessment scope: ${scope}.

Detect only what is visibly present in the image. Return normalized bounding boxes in x/y/width/height from 0 to 1.

Look for visible engineering-relevant objects and conditions: HVAC indoor/outdoor units, ducts, diffusers, vents, pipes, valves, pumps, motors, fans, chillers, compressors, boilers, electrical panels, meters, windows, doors, insulation, radiators, lights, ceiling systems, leaks, corrosion, damaged insulation, blocked airflow, clutter around equipment, and visible labels/nameplates.

Important:
- Never invent a hidden specification, capacity, efficiency, temperature, pressure, or geometry.
- A visual condition is not the same as a measured fault.
- Use confidence for visual detection confidence only.
- Keep engineering clues descriptive and evidence-grounded.
- If something is uncertain, say so.
- The bounding box should cover the visible object/condition, not the whole room.`;
}

async function toDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const scope = String(form.get("scope") || "building");
    const sector = Number(form.get("sector") || 0);
    const sectorCount = Math.max(1, Number(form.get("sectorCount") || 12));

    if (!(file instanceof File)) return NextResponse.json({ error: "Scan frame is required." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Scan frame must be <= 8 MB." }, { status: 413 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Scan frame must be an image." }, { status: 415 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Computer vision is not configured on this deployment." }, { status: 503 });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt(scope, sector, sectorCount) },
          { type: "input_image", image_url: await toDataUrl(file), detail: "high" },
        ]}],
        text: { format: { type: "json_schema", name: "overhaul_room_scan", strict: true, schema } },
        max_output_tokens: 3500,
        store: false,
      }),
    });

    if (!response.ok) {
      console.error("Room scan vision failed", response.status, (await response.text()).slice(0, 500));
      return NextResponse.json({ error: "Computer vision analysis failed." }, { status: 502 });
    }

    const payload = await response.json() as { output_text?: string };
    if (!payload.output_text) return NextResponse.json({ error: "Computer vision returned no structured result." }, { status: 502 });
    const result = JSON.parse(payload.output_text);
    return NextResponse.json({ result: { ...result, model: MODEL, sector, sectorCount } });
  } catch (error) {
    console.error("Room scan route error", error);
    return NextResponse.json({ error: "Computer vision analysis failed." }, { status: 500 });
  }
}
