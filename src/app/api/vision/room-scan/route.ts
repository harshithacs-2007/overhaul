import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { DATASET_BASIS, OVERHAUL_VISION_VOCABULARY } from "@/lib/vision/objectTaxonomy";

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

type Detection = { label: string; confidence: number; box: { x: number; y: number; width: number; height: number }; condition: string; evidence: string };

function cleanText(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function norm(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(the|unit|asset|machine|equipment|device|system)\b/g, " ").replace(/\s+/g, " ").trim(); }
function canonicalizeLabel(label: string) {
  const n = norm(label);
  if (/\b(ac|air conditioner|split ac|split air conditioner|wall mounted air conditioner)\b/.test(n)) return "split air conditioner";
  if (/\b(ceiling fan|fan)\b/.test(n)) return "ceiling fan";
  if (/\b(air handling unit|ahu)\b/.test(n)) return "air handling unit";
  if (/\b(variable frequency drive|vfd|drive)\b/.test(n)) return "variable frequency drive";
  if (/\b(electrical panel|distribution board|mcc panel|switchboard|control panel)\b/.test(n)) return "electrical panel";
  if (/\b(electric motor|induction motor|motor)\b/.test(n)) return "electric motor";
  if (/\b(pump|circulation pump|chilled water pump|condenser water pump)\b/.test(n)) return "pump";
  if (/\b(compressor|refrigeration compressor|air compressor)\b/.test(n)) return "compressor";
  if (/\b(refrigerator|refrigeration unit|display refrigerator)\b/.test(n)) return "refrigerator";
  if (/\b(chiller|air cooled chiller|water cooled chiller)\b/.test(n)) return "chiller";
  if (/\b(cooling tower)\b/.test(n)) return "cooling tower";
  if (/\b(duct|supply duct|return duct|exhaust duct)\b/.test(n)) return "duct";
  if (/\b(diffuser|supply diffuser)\b/.test(n)) return "diffuser";
  if (/\b(return grille|air grille|grille|vent)\b/.test(n)) return "air grille";
  if (/\b(window|windows)\b/.test(n)) return "window";
  if (/\b(door|doors)\b/.test(n)) return "door";
  return label.trim().slice(0, 120) || "unknown object";
}
function iou(a: Detection["box"], b: Detection["box"]) {
  const ax2 = a.x + a.width, ay2 = a.y + a.height, bx2 = b.x + b.width, by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y), ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}
function validBox(box: Detection["box"]) { return Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 && box.y + box.height <= 1; }

function prompt(scope: string, sector: number, sectorCount: number, mode: "inventory" | "engineering", targetHint?: string) {
  const vocabulary = OVERHAUL_VISION_VOCABULARY.join(", ").slice(0, 15000);
  const focus = mode === "inventory"
    ? `Perform a broad open-vocabulary inventory. Detect every clearly visible object you can identify, including ordinary room objects, furniture, appliances and engineering assets. Prefer a specific label when visible evidence supports it. Candidate vocabulary: ${vocabulary}`
    : "Perform a specialist engineering/retrofit inventory. Prioritize HVAC, electrical, mechanical, plumbing, envelope, safety and industrial equipment, plus visible degradation or access conditions. Also inspect labels/nameplates and extract only readable text.";
  const target = targetHint ? `TARGETED EVIDENCE REQUEST: ${targetHint}. Prioritize this target in this frame, but still return other clearly visible objects. If it is not actually visible, do not invent a substitute; state that limitation in coverage_notes.` : "No targeted evidence request is active.";
  return `You are OVERHAUL's visual perception layer for retrofit engineering.

Target scope: ${scope}. Camera sector ${sector + 1} of ${sectorCount}.
Pass: ${mode}.
${focus}
${target}

${DATASET_BASIS}

Return normalized 0..1 bounding boxes for visible objects. A box must enclose visible pixels belonging to the object, not where you think the hidden object continues.

Rules:
- Detect what is actually visible, not what is expected in a room.
- Do not infer hidden equipment, hidden dimensions, efficiency, energy loss, temperature, pressure, capacity, severity or failure state.
- Visual condition is an observation, never a confirmed engineering failure.
- For partially occluded objects, identify the visible object if the class is visually defensible; otherwise use a broader label.
- For unreadable text, omit it. Never autocomplete a manufacturer/model/number from memory.
- Multiple objects of the same class should be returned separately when they can be separated visually.
- Keep confidence tied to visible evidence.
- Bounding boxes must remain inside the image.`;
}

async function toDataUrl(file: File) { const bytes = new Uint8Array(await file.arrayBuffer()); return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`; }

async function callVision(apiKey: string, imageUrl: string, promptText: string) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: [{ type: "text", text: promptText }, { type: "image_url", image_url: { url: imageUrl } }] }], response_format: { type: "json_schema", json_schema: { name: "overhaul_room_scan", strict: true, schema } }, temperature: 0, max_tokens: 4200 }),
  });
  if (!response.ok) throw new Error(`Vision request failed with ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision response was empty");
  return JSON.parse(content) as { summary: string; detections: Detection[]; engineering_clues: string[]; coverage_notes: string[]; visible_details: Array<{ field: string; value: string; confidence: number }> };
}

function mergeDetections(inventory: Detection[], engineering: Detection[]) {
  const merged: Array<Detection & { passes: number }> = [];
  for (const raw of [...inventory, ...engineering]) {
    if (!validBox(raw.box)) continue;
    const item = { ...raw, label: canonicalizeLabel(raw.label), confidence: Math.max(0, Math.min(1, raw.confidence)), passes: 1 };
    const match = merged.find((candidate) => norm(candidate.label) === norm(item.label) && iou(candidate.box, item.box) >= 0.25);
    if (!match) { merged.push(item); continue; }
    const best = match.confidence >= item.confidence ? match : item;
    match.label = best.label;
    match.condition = [match.condition, item.condition].filter(Boolean).join("; ").slice(0, 240);
    match.evidence = [match.evidence, item.evidence].filter(Boolean).join("; ").slice(0, 400);
    match.box = { x: (match.box.x + item.box.x) / 2, y: (match.box.y + item.box.y) / 2, width: (match.box.width + item.box.width) / 2, height: (match.box.height + item.box.height) / 2 };
    match.confidence = Math.min(0.96, Math.max(match.confidence, item.confidence) + 0.08);
    match.passes += 1;
  }
  return merged.sort((a, b) => (b.passes - a.passes) || (b.confidence - a.confidence)).slice(0, 40).map(({ passes, ...item }) => ({ ...item, confidence: Math.min(item.confidence, passes >= 2 ? 0.96 : 0.78) }));
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
    const targetHint = cleanText(form.get("targetHint"), 400);
    const sector = Number.isFinite(rawSector) ? Math.max(0, Math.min(99, rawSector)) : 0;
    const sectorCount = Number.isFinite(rawSectorCount) ? Math.max(1, Math.min(100, rawSectorCount)) : 12;
    if (!(file instanceof File)) return NextResponse.json({ error: "Scan frame is required." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Scan frame must be <= 8 MB." }, { status: 413 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Scan frame must be an image." }, { status: 415 });
    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Nebius computer vision is not configured on this deployment." }, { status: 503 });
    const imageUrl = await toDataUrl(file);
    const [inventoryResult, engineeringResult] = await Promise.allSettled([
      callVision(apiKey, imageUrl, prompt(scope, sector, sectorCount, "inventory", targetHint)),
      callVision(apiKey, imageUrl, prompt(scope, sector, sectorCount, "engineering", targetHint)),
    ]);
    const inventory = inventoryResult.status === "fulfilled" ? inventoryResult.value : { summary: "", detections: [], engineering_clues: [], coverage_notes: [], visible_details: [] };
    const engineering = engineeringResult.status === "fulfilled" ? engineeringResult.value : { summary: "", detections: [], engineering_clues: [], coverage_notes: [], visible_details: [] };
    if (!inventory.detections.length && !engineering.detections.length) return NextResponse.json({ error: "No confident visible objects were returned from this frame." }, { status: 502 });
    const detections = mergeDetections(inventory.detections, engineering.detections);
    const visibleDetails = [...inventory.visible_details, ...engineering.visible_details]
      .filter((detail) => detail.value.trim())
      .map((detail) => ({ ...detail, confidence: Math.max(0, Math.min(1, detail.confidence)) }))
      .filter((detail, index, all) => all.findIndex((candidate) => norm(`${candidate.field} ${candidate.value}`) === norm(`${detail.field} ${detail.value}`)) === index)
      .slice(0, 30);
    const engineeringClues = [...inventory.engineering_clues, ...engineering.engineering_clues].map((x) => cleanText(x, 300)).filter(Boolean).filter((x, i, a) => a.findIndex((v) => norm(v) === norm(x)) === i).slice(0, 20);
    const coverageNotes = [...inventory.coverage_notes, ...engineering.coverage_notes].map((x) => cleanText(x, 300)).filter(Boolean).filter((x, i, a) => a.findIndex((v) => norm(v) === norm(x)) === i).slice(0, 20);
    return NextResponse.json({ result: { summary: [inventory.summary, engineering.summary].filter(Boolean).join(" ").slice(0, 900), detections, engineering_clues: engineeringClues, coverage_notes: coverageNotes, visible_details: visibleDetails, sector, sectorCount, detectorPasses: { inventory: inventoryResult.status === "fulfilled", engineering: engineeringResult.status === "fulfilled" } }, model: MODEL, provider: "Nebius Token Factory / NVIDIA Nemotron", detectionStrategy: "two-pass open-vocabulary + engineering ensemble", datasetBasis: DATASET_BASIS, meta: { rateLimitRemaining: rl.remaining } });
  } catch (error) {
    console.error("Room scan route error", error);
    return NextResponse.json({ error: "Computer vision analysis failed." }, { status: 500 });
  }
}
