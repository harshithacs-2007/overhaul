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
const MAX_DATASET_PARSE_CHARS = 1_000_000;
const MAX_DATASET_PROMPT_CHARS = 60_000;
const MAX_DATASET_ROWS = 10_000;
const MAX_DATASET_COLUMNS = 60;
const MAX_DATASET_OBSERVATIONS = 220;
const MODEL = "gpt-5.6-terra";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DATASET_TYPES = new Set(["text/csv", "text/tab-separated-values", "application/json"]);

function isDatasetType(mimeType: string, filename: string) {
  const name = filename.toLowerCase();
  return DATASET_TYPES.has(mimeType) || name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".json");
}

function isSupportedType(mimeType: string, filename: string) {
  return ALLOWED_IMAGE_TYPES.has(mimeType) || mimeType === "application/pdf" || isDatasetType(mimeType, filename);
}

function normalizeField(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_").slice(0, 80);
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim()); current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseDataset(text: string, filename: string) {
  const trimmed = text.trim();
  if (!trimmed) return { headers: [] as string[], rows: [] as string[][], truncated: false };
  if (filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
      const objects = source.filter((row: unknown) => row && typeof row === "object" && !Array.isArray(row)) as Record<string, unknown>[];
      const headers = Array.from(new Set(objects.flatMap((row) => Object.keys(row)))).slice(0, MAX_DATASET_COLUMNS);
      const rows = objects.slice(0, MAX_DATASET_ROWS).map((row) => headers.map((header) => row[header] == null ? "" : String(row[header])));
      return { headers, rows, truncated: false };
    } catch {
      return { headers: [] as string[], rows: [] as string[][], truncated: false };
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const truncated = lines.length > MAX_DATASET_ROWS + 1;
  const selectedLines = lines.slice(0, MAX_DATASET_ROWS + 1);
  if (!selectedLines.length) return { headers: [] as string[], rows: [] as string[][], truncated };
  const delimiter = filename.toLowerCase().endsWith(".tsv") || selectedLines[0].split("\t").length > selectedLines[0].split(",").length ? "\t" : ",";
  const headers = parseDelimitedLine(selectedLines[0], delimiter).slice(0, MAX_DATASET_COLUMNS).map((header, index) => header || `column_${index + 1}`);
  const rows = selectedLines.slice(1).map((line) => parseDelimitedLine(line, delimiter).slice(0, headers.length));
  return { headers, rows, truncated };
}

function pushObservation(observations: EvidenceExtractionResponse["observations"], observation: EvidenceExtractionResponse["observations"][number]) {
  if (observations.length < MAX_DATASET_OBSERVATIONS) observations.push(observation);
}

function deterministicDatasetObservations(text: string, filename: string) {
  const parseInput = text.length > MAX_DATASET_PARSE_CHARS ? text.slice(0, MAX_DATASET_PARSE_CHARS) : text;
  const dataset = parseDataset(parseInput, filename);
  const truncatedByChars = text.length > MAX_DATASET_PARSE_CHARS;
  if (!dataset.headers.length || !dataset.rows.length) return { observations: [], warnings: ["Dataset could not be parsed into tabular rows."] };

  const observations: EvidenceExtractionResponse["observations"] = [];
  pushObservation(observations, { field: "dataset_row_count", value: String(dataset.rows.length), numericValue: dataset.rows.length, unit: "rows", confidence: 1, sourceText: `Parsed ${dataset.rows.length} tabular rows from ${filename}.`, notes: truncatedByChars || dataset.truncated ? "Parsed sample only; upload contains additional data beyond the analyzed sample." : "Deterministic count from the uploaded dataset." });
  pushObservation(observations, { field: "dataset_column_count", value: String(dataset.headers.length), numericValue: dataset.headers.length, unit: "columns", confidence: 1, sourceText: `Parsed ${dataset.headers.length} columns from ${filename}.`, notes: "Deterministic dataset structure statistic." });

  let timestampIndex = -1;
  const timestampPattern = /(timestamp|datetime|date_time|date|time)/i;
  dataset.headers.some((header, index) => { if (timestampPattern.test(header)) { timestampIndex = index; return true; } return false; });
  if (timestampIndex >= 0) {
    const dates = dataset.rows.map((row) => new Date(row[timestampIndex])).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a.getTime() - b.getTime());
    if (dates.length >= 2) {
      const gaps = dates.slice(1).map((date, i) => (date.getTime() - dates[i].getTime()) / 3600000).filter((gap) => gap >= 0 && Number.isFinite(gap));
      const medianGap = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
      pushObservation(observations, { field: "dataset_period_start", value: dates[0].toISOString(), numericValue: dates[0].getTime() / 1000, unit: "epoch_s", confidence: 1, sourceText: `Timestamp column “${dataset.headers[timestampIndex]}” parsed across ${dates.length} rows.`, notes: "Deterministic earliest timestamp; informational dataset metadata." });
      pushObservation(observations, { field: "dataset_period_end", value: dates[dates.length - 1].toISOString(), numericValue: dates[dates.length - 1].getTime() / 1000, unit: "epoch_s", confidence: 1, sourceText: `Timestamp column “${dataset.headers[timestampIndex]}” parsed across ${dates.length} rows.`, notes: "Deterministic latest timestamp; informational dataset metadata." });
      if (medianGap != null) pushObservation(observations, { field: "dataset_median_sampling_interval_hours", value: medianGap.toFixed(4), numericValue: medianGap, unit: "h", confidence: 1, sourceText: `Median gap calculated from ${gaps.length} adjacent timestamp pairs.`, notes: "Deterministic cadence statistic; irregular timestamps may still exist." });
    }
  }

  dataset.headers.forEach((header, index) => {
    if (observations.length >= MAX_DATASET_OBSERVATIONS) return;
    const rawColumn = dataset.rows.map((row) => row[index] ?? "");
    const numeric = rawColumn.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (numeric.length < 2) return;
    const slug = normalizeField(header);
    if (!slug) return;
    const sorted = numeric.slice().sort((a, b) => a - b);
    const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
    const variance = numeric.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numeric.length;
    const std = Math.sqrt(variance);
    const q95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const missingFraction = 1 - numeric.length / Math.max(dataset.rows.length, 1);
    const unit = /(^|_)(kw|kwh|w|wh|c|percent|rh|hours?|a)$/i.test(slug) ? slug.split("_").filter(Boolean).pop() || null : null;
    const source = `Dataset column “${header}”: n=${numeric.length}, mean=${mean}, min=${min}, max=${max}.`;
    pushObservation(observations, { field: `dataset_${slug}_mean`, value: String(mean), numericValue: mean, unit, confidence: 1, sourceText: source, notes: "Deterministic statistic across numeric rows; not a single-point engineering measurement." });
    pushObservation(observations, { field: `dataset_${slug}_p95`, value: String(q95), numericValue: q95, unit, confidence: 1, sourceText: `95th percentile estimate from sorted numeric rows in “${header}”.`, notes: "Deterministic sample percentile; useful for stress screening, not a design condition." });
    pushObservation(observations, { field: `dataset_${slug}_std`, value: String(std), numericValue: std, unit, confidence: 1, sourceText: `Population standard deviation across ${numeric.length} numeric rows in “${header}”.`, notes: "Deterministic variability statistic." });
    pushObservation(observations, { field: `dataset_${slug}_min`, value: String(min), numericValue: min, unit, confidence: 1, sourceText: source, notes: "Deterministic minimum across parsed numeric rows." });
    pushObservation(observations, { field: `dataset_${slug}_max`, value: String(max), numericValue: max, unit, confidence: 1, sourceText: source, notes: "Deterministic maximum across parsed numeric rows." });
    pushObservation(observations, { field: `dataset_${slug}_missing_fraction`, value: String(missingFraction), numericValue: missingFraction, unit: "fraction", confidence: 1, sourceText: `Numeric parse coverage for “${header}”: ${numeric.length}/${dataset.rows.length}.`, notes: "Deterministic missing/non-numeric fraction in the analyzed sample." });
  });

  return {
    observations,
    warnings: [
      `Dataset statistics were computed deterministically from ${dataset.rows.length} parsed rows.${truncatedByChars || dataset.truncated ? " The upload exceeds the analysis sample limit, so these statistics are explicitly sample-bounded." : ""} They support evidence analysis but do not by themselves establish a design condition, retrofit saving, or annual performance baseline.`,
    ],
  };
}

function buildPrompt(filename: string, mimeType: string, datasetText?: string, datasetWasSampled = false) {
  const evidenceMode = isDatasetType(mimeType, filename) ? "tabular dataset" : mimeType === "application/pdf" ? "document/PDF" : "visual evidence/image";
  const datasetRules = isDatasetType(mimeType, filename) ? `
Dataset-specific rules:
- Analyze the dataset across rows and columns, not just the first record.
- Identify timestamps/date fields, engineering variables, units, missing-value patterns, repeated operating measurements, and meaningful variation.
- Distinguish recorded/measured series from rated/nameplate/reference values.
- Summaries must be derived from the uploaded rows; never invent an annual baseline from a short sample.
- Never turn an average, percentile, or model prediction into a design value without explicit evidence.
${datasetWasSampled ? "- The supplied dataset excerpt is bounded; never imply it represents the full upload." : ""}
` : "";
  const sample = datasetText ? `\n\nDataset excerpt for analysis (bounded for model context safety):\n${datasetText.slice(0, MAX_DATASET_PROMPT_CHARS)}` : "";
  return `You are OVERHAUL's evidence perception engine for building, facility, and industrial equipment retrofit assessments.

Analyze this ${evidenceMode} file: ${filename}

Your job is evidence extraction and evidence interpretation, not engineering guessing.

Rules:
- Read visible/document text as faithfully as possible and return the source text in rawText.
- Extract only facts that are visibly present or explicitly stated in the evidence.
- Never invent, estimate, back-calculate, or assume a value from a model number, appearance, brand, typical specification, or context.
- For numerical engineering fields, preserve the stated value and unit. Do not silently convert units.
- Keep numericValue null when a value is not a clearly established number.
- confidence must reflect extraction certainty from the evidence itself, from 0 to 1.
- sourceText must quote or accurately identify the local text/row context that supports the extracted observation when available.
- Use field names from this preferred vocabulary when applicable: ${ENGINEERING_FIELD_HINTS.join(", ")}.
- If a field is not in the vocabulary, use a concise snake_case field name rather than forcing a match.
- Distinguish a rated/nameplate value from an observed/operating value.
- A photo can identify visible equipment, labels, corrosion, leaks, insulation damage, airflow obstruction, etc., but it cannot establish hidden efficiency, internal wear, vibration, pressure, temperature, or actual power unless that evidence is explicitly shown.
- For energy bills, extract visible billing period, energy, demand, tariff, and cost values without treating them as instantaneous measurements.
- For floor plans or diagrams, describe visible assets and labels; do not infer exact geometry that is not dimensioned.
- In warnings, explicitly state important limitations or ambiguities.
- In nextEvidence, request the smallest useful next piece of evidence that could materially reduce uncertainty.
${datasetRules}
Return JSON matching the required schema exactly.${sample}`;
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
    if (!(file instanceof File)) return NextResponse.json({ error: "Evidence file is required." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Evidence file must be non-empty and 25 MB or smaller." }, { status: 413 });
    if (!isSupportedType(file.type, file.name)) return NextResponse.json({ error: "OVERHAUL currently analyzes images, PDFs, CSV/TSV datasets and JSON datasets." }, { status: 415 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Evidence perception is not configured on this deployment." }, { status: 503 });

    const dataset = isDatasetType(file.type, file.name);
    let datasetText: string | undefined;
    let deterministicStats: ReturnType<typeof deterministicDatasetObservations> | null = null;
    if (dataset) {
      datasetText = await file.text();
      deterministicStats = deterministicDatasetObservations(datasetText, file.name);
    }

    const content = dataset
      ? [{ type: "input_text", text: buildPrompt(file.name, file.type, datasetText, Boolean(datasetText && datasetText.length > MAX_DATASET_PROMPT_CHARS)) }]
      : file.type === "application/pdf"
        ? [{ type: "input_file", filename: file.name, file_data: await toDataUrl(file), detail: "high" }, { type: "input_text", text: buildPrompt(file.name, file.type) }]
        : [{ type: "input_text", text: buildPrompt(file.name, file.type) }, { type: "input_image", image_url: await toDataUrl(file), detail: "high" }];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content }],
        text: { format: {
          type: "json_schema",
          name: "overhaul_evidence_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["evidenceType", "rawText", "observations", "visibleAssets", "warnings", "nextEvidence"],
            properties: {
              evidenceType: { type: "string", enum: ["equipment_nameplate", "equipment", "building_exterior", "building_interior", "mechanical_room", "floorplan", "energy_bill", "technical_document", "other"] },
              rawText: { type: "string" },
              observations: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "value", "numericValue", "unit", "confidence", "sourceText", "notes"], properties: { field: { type: "string" }, value: { type: "string" }, numericValue: { type: ["number", "null"] }, unit: { type: ["string", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, sourceText: { type: "string" }, notes: { type: "string" } } } },
              visibleAssets: { type: "array", items: { type: "string" } },
              warnings: { type: "array", items: { type: "string" } },
              nextEvidence: { type: "array", items: { type: "string" } },
            },
          },
        } },
        max_output_tokens: 7000,
        store: false,
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error("OpenAI evidence extraction failed", openaiResponse.status, errorBody.slice(0, 500));
      return NextResponse.json({ error: "Evidence analysis failed. Please retry this file." }, { status: 502 });
    }

    const payload = await openaiResponse.json() as { output_text?: string };
    if (!payload.output_text) return NextResponse.json({ error: "Evidence analysis returned no structured result." }, { status: 502 });
    const parsed = JSON.parse(payload.output_text);
    const validated = evidenceExtractionSchema.parse(parsed);
    const sanitized = sanitizeEvidenceExtraction(validated);
    if (deterministicStats) {
      sanitized.observations = [...deterministicStats.observations, ...sanitized.observations].slice(0, MAX_DATASET_OBSERVATIONS);
      sanitized.warnings = [...deterministicStats.warnings, ...sanitized.warnings];
    }

    const result: EvidenceExtractionResponse = {
      evidenceId,
      filename: file.name,
      mimeType: file.type || (file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "application/octet-stream"),
      model: MODEL,
      ...sanitized,
    };
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Evidence extraction route error", error);
    return NextResponse.json({ error: "Evidence analysis failed. Please retry this file." }, { status: 500 });
  }
}
