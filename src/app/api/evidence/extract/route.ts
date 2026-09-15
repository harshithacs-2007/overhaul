import { NextResponse } from "next/server";
import {
  ENGINEERING_FIELD_HINTS,
  evidenceExtractionSchema,
  sanitizeEvidenceExtraction,
  type EvidenceExtractionResponse,
} from "@/lib/evidence/extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const MODEL = "gpt-5.6-terra";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isSupportedType(mimeType: string) {
  return ALLOWED_IMAGE_TYPES.has(mimeType) || mimeType === "application/pdf";
}

function buildPrompt(filename: string, mimeType: string) {
  const evidenceMode = mimeType === "application/pdf" ? "document/PDF" : "visual evidence/image";

  return `You are OVERHAUL's evidence perception engine for building, facility, and industrial equipment retrofit assessments.

Analyze this ${evidenceMode} file: ${filename}

Your job is evidence extraction, not engineering guessing.

Rules:
- Read visible/document text as faithfully as possible and return the OCR text in rawText.
- Extract only facts that are visibly present or explicitly stated in the evidence.
- Never invent, estimate, back-calculate, or assume a value from a model number, appearance, brand, typical specification, or context.
- For numerical engineering fields, preserve the stated value and unit. Do not convert units.
- Keep numericValue null when a value is not a clearly established number.
- confidence must reflect extraction certainty from the evidence itself, from 0 to 1.
- sourceText must quote the exact local text that supports the extracted observation when available.
- Use field names from this preferred vocabulary when applicable: ${ENGINEERING_FIELD_HINTS.join(", ")}.
- If a field is not in the vocabulary, use a concise snake_case field name rather than forcing a match.
- Distinguish a rated/nameplate value from an observed/operating value.
- A photo can identify visible equipment, labels, corrosion, leaks, insulation damage, airflow obstruction, etc., but it cannot establish hidden efficiency, internal wear, vibration, pressure, temperature, or actual power unless that evidence is explicitly shown.
- For energy bills, extract visible billing period, energy, demand, tariff, and cost values without treating them as instantaneous measurements.
- For floor plans or diagrams, describe visible assets and labels; do not infer exact geometry that is not dimensioned.
- In warnings, explicitly state important limitations or ambiguities.
- In nextEvidence, request the smallest useful next piece of evidence that could materially reduce uncertainty.

Return JSON matching the required schema exactly.`;
}

async function toDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${file.type};base64,${base64}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const evidenceId = String(formData.get("evidenceId") || crypto.randomUUID());

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Evidence file is required." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Evidence file must be non-empty and 25 MB or smaller." },
        { status: 413 },
      );
    }

    if (!isSupportedType(file.type)) {
      return NextResponse.json(
        { error: "OVERHAUL currently analyzes image files and PDF documents." },
        { status: 415 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Evidence perception is not configured on this deployment." },
        { status: 503 },
      );
    }

    const dataUrl = await toDataUrl(file);
    const content = file.type === "application/pdf"
      ? [
          {
            type: "input_file",
            filename: file.name,
            file_data: dataUrl,
            detail: "high",
          },
          { type: "input_text", text: buildPrompt(file.name, file.type) },
        ]
      : [
          { type: "input_text", text: buildPrompt(file.name, file.type) },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "overhaul_evidence_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "evidenceType",
                "rawText",
                "observations",
                "visibleAssets",
                "warnings",
                "nextEvidence",
              ],
              properties: {
                evidenceType: {
                  type: "string",
                  enum: [
                    "equipment_nameplate",
                    "equipment",
                    "building_exterior",
                    "building_interior",
                    "mechanical_room",
                    "floorplan",
                    "energy_bill",
                    "technical_document",
                    "other",
                  ],
                },
                rawText: { type: "string" },
                observations: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "field",
                      "value",
                      "numericValue",
                      "unit",
                      "confidence",
                      "sourceText",
                      "notes",
                    ],
                    properties: {
                      field: { type: "string" },
                      value: { type: "string" },
                      numericValue: { type: ["number", "null"] },
                      unit: { type: ["string", "null"] },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                      sourceText: { type: "string" },
                      notes: { type: "string" },
                    },
                  },
                },
                visibleAssets: { type: "array", items: { type: "string" } },
                warnings: { type: "array", items: { type: "string" } },
                nextEvidence: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
        max_output_tokens: 5000,
        store: false,
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error("OpenAI evidence extraction failed", openaiResponse.status, errorBody.slice(0, 500));
      return NextResponse.json(
        { error: "Evidence analysis failed. Please retry this file." },
        { status: 502 },
      );
    }

    const payload = await openaiResponse.json() as { output_text?: string };
    if (!payload.output_text) {
      return NextResponse.json(
        { error: "Evidence analysis returned no structured result." },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(payload.output_text);
    const validated = evidenceExtractionSchema.parse(parsed);
    const sanitized = sanitizeEvidenceExtraction(validated);

    const result: EvidenceExtractionResponse = {
      evidenceId,
      filename: file.name,
      mimeType: file.type,
      model: MODEL,
      ...sanitized,
    };

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Evidence extraction route error", error);
    return NextResponse.json(
      { error: "Evidence analysis failed. Please retry this file." },
      { status: 500 },
    );
  }
}
