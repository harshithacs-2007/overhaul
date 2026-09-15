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
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
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
      return { headers, rows, truncated: objects.length > MAX_DATASET_ROWS };
    } catch { return { headers: [] as string[], rows: [] as string[][], truncated: false }; }
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
function pearson(x: number[], y: number[]) {
  if (x.length < 3 || x.length !== y.length) return null;
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const ax = x[i] - mx, ay = y[i] - my;
    num += ax * ay; dx += ax * ax; dy += ay * ay;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 1e-12 ? num / denom : null;
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
  dataset.headers.some((header, index) => { if (/(timestamp|datetime|date_time|date|time)/i.test(header)) { timestampIndex = index; return true; } return false; });
  if (timestampIndex >= 0) {
    const dates = dataset.rows.map((row) => new Date(row[timestampIndex])).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a.getTime() - b.getTime());
    if (dates.length >= 2) {
      const gaps = dates.slice(1).map((date, i) => (date.getTime() - dates[i].getTime()) / 3600000).filter((gap) => gap >= 0 && Number.isFinite(gap));
      const medianGap = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
      pushObservation(observations, { field: "dataset_period_start", value: dates[0].toISOString(), numericValue: dates[0].getTime() / 1000, unit: "epoch_s", confidence: 1, sourceText: `Timestamp column “${dataset.headers[timestampIndex]}” parsed across ${dates.length} rows.`, notes: "Deterministic earliest timestamp; informational metadata." });
      pushObservation(observations, { field: "dataset_period_end", value: dates[dates.length - 1].toISOString(), numericValue: dates[dates.length - 1].getTime() / 1000, unit: "epoch_s", confidence: 1, sourceText: `Timestamp column “${dataset.headers[timestampIndex]}” parsed across ${dates.length} rows.`, notes: "Deterministic latest timestamp; informational metadata." });
      if (medianGap != null) pushObservation(observations, { field: "dataset_median_sampling_interval_hours", value: medianGap.toFixed(4), numericValue: medianGap, unit: "h", confidence: 1, sourceText: `Median gap calculated from ${gaps.length} adjacent timestamp pairs.`, notes: "Deterministic cadence statistic." });
    }
  }

  const numericColumns = dataset.headers.map((header, index) => ({ header, index, slug: normalizeField(header), values: dataset.rows.map((row) => Number(row[index] ?? "")) }));
  const parsedColumns = numericColumns.map((column) => ({ ...column, numericRows: column.values.map((value, rowIndex) => ({ value, rowIndex })).filter(({ value }) => Number.isFinite(value)) }));
  const targetCandidates = parsedColumns.filter((column) => /(^|_)(fuel_use_electricity_total|electricity_total|power_kw|electricity|energy_kwh)(_|$)/i.test(column.slug));
  const target = targetCandidates.sort((a, b) => b.numericRows.length - a.numericRows.length)[0];

  parsedColumns.forEach((column) => {
    if (observations.length >= MAX_DATASET_OBSERVATIONS) return;
    if (column.numericRows.length < 2) return;
    const numeric = column.numericRows.map(({ value }) => value);
    const sorted = numeric.slice().sort((a, b) => a - b);
    const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
    const variance = numeric.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numeric.length;
    const std = Math.sqrt(variance);
    const q95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const min = sorted[0], max = sorted[sorted.length - 1];
    const missingFraction = 1 - numeric.length / Math.max(dataset.rows.length, 1);
    const unit = /(^|_)(kw|kwh|w|wh|c|percent|rh|hours?|a)$/i.test(column.slug) ? column.slug.split("_").filter(Boolean).pop() || null : null;
    const source = `Dataset column “${column.header}”: n=${numeric.length}, mean=${mean}, min=${min}, max=${max}.`;
    const notes = "Deterministic statistic across numeric rows; not a single-point engineering measurement.";
    pushObservation(observations, { field: `dataset_${column.slug}_mean`, value: String(mean), numericValue: mean, unit, confidence: 1, sourceText: source, notes });
    pushObservation(observations, { field: `dataset_${column.slug}_p95`, value: String(q95), numericValue: q95, unit, confidence: 1, sourceText: `95th percentile from numeric rows in “${column.header}”.`, notes: "Deterministic sample percentile; not a design condition." });
    pushObservation(observations, { field: `dataset_${column.slug}_std`, value: String(std), numericValue: std, unit, confidence: 1, sourceText: `Standard deviation across ${numeric.length} numeric rows in “${column.header}”.`, notes: "Deterministic variability statistic." });
    pushObservation(observations, { field: `dataset_${column.slug}_min`, value: String(min), numericValue: min, unit, confidence: 1, sourceText: source, notes: "Deterministic minimum across parsed numeric rows." });
    pushObservation(observations, { field: `dataset_${column.slug}_max`, value: String(max), numericValue: max, unit, confidence: 1, sourceText: source, notes: "Deterministic maximum across parsed numeric rows." });
    pushObservation(observations, { field: `dataset_${column.slug}_missing_fraction`, value: String(missingFraction), numericValue: missingFraction, unit: "fraction", confidence: 1, sourceText: `Numeric parse coverage for “${column.header}”: ${numeric.length}/${dataset.rows.length}.`, notes: "Deterministic missing/non-numeric fraction in the analyzed sample." });
    if (target && target.index !== column.index) {
      const pairs = dataset.rows.map((row, rowIndex) => ({ x: Number(row[column.index] ?? ""), y: Number(row[target.index] ?? "") , rowIndex })).filter((pair) => Number.isFinite(pair.x) && Number.isFinite(pair.y));
      if (pairs.length >= 3) {
        const correlation = pearson(pairs.map((pair) => pair.x), pairs.map((pair) => pair.y));
        if (correlation != null) pushObservation(observations, { field: `dataset_${column.slug}_corr_${target.slug}`, value: correlation.toFixed(4), numericValue: correlation, unit: "r", confidence: 1, sourceText: `Pearson correlation across ${pairs.length} paired numeric rows: “${column.header}” vs “${target.header}”.`, notes: "Observed association only; correlation does not establish causation or retrofit effect." });
      }
    }
  });

  return { observations, warnings: [`Dataset statistics were computed deterministically from ${dataset.rows.length} parsed rows.${truncatedByChars || dataset.truncated ? " The upload exceeds the analysis sample limit, so these statistics are explicitly sample-bounded." : ""} They support evidence analysis but do not by themselves establish a design condition, retrofit saving, or annual performance baseline.`, ...(target ? [`The dataset contains a candidate electricity/power target column “${target.header}”; correlations shown in the assessment are descriptive associations only.`] : [])] };
}

function buildPrompt(filename: string, mimeType: string, datasetText?: string, datasetWasSampled = false) {
  const evidenceMode = isDatasetType(mimeType, filename) ? "tabular dataset" : mimeType === "application/pdf" ? "document/PDF" : "visual evidence/image";
  const datasetRules = isDatasetType(mimeType, filename) ? `\nDataset-specific rules:\n- Analyze the dataset across rows and columns, not just the first record.\n- Identify timestamps/date fields, engineering variables, units, missing-value patterns, repeated operating measurements, meaningful variation, and descriptive relationships.\n- Distinguish recorded/measured series from rated/nameplate/reference values.\n- Summaries must be derived from the uploaded rows; never invent an annual baseline from a short sample.\n- Never turn an average, percentile, correlation, or model prediction into a design value without explicit evidence.\n- Descriptive correlations are associations only; do not describe them as causal retrofit effects.\n${datasetWasSampled ? "- The supplied dataset excerpt is bounded; never imply it represents the full upload." : ""}\n` : "";
  const sample = datasetText ? `\n\nDataset excerpt for analysis (bounded for model context safety):\n${datasetText.slice(0, MAX_DATASET_PROMPT_CHARS)}` : "";
  return `You are OVERHAUL's evidence perception engine for building, facility, and industrial equipment retrofit assessments.\n\nAnalyze this ${evidenceMode} file: ${filename}\n\nYour job is evidence extraction and evidence interpretation, not engineering guessing.\n\nRules:\n- Read visible/document text as faithfully as possible and return the source text in rawText.\n- Extract only facts that are visibly present or explicitly stated in the evidence.\n- Never invent, estimate, back-calculate, or assume a value from a model number, appearance, brand, typical specification, or context.\n- For numerical engineering fields, preserve the stated value and unit. Do not silently convert units.\n- Keep numericValue null when a value is not a clearly established number.\n- confidence must reflect extraction certainty from the evidence itself, from 0 to 1.\n- sourceText must quote or accurately identify the local text/row context that supports the extracted observation when available.\n- Use field names from this preferred vocabulary when applicable: ${ENGINEERING_FIELD_HINTS.join(", ")}.\n- If a field is not in the vocabulary, use a concise snake_case field name rather than forcing a match.\n- Distinguish a rated/nameplate value from an observed/operating value.\n- A photo can identify visible equipment, labels, corrosion, leaks, insulation damage, airflow obstruction, etc., but it cannot establish hidden efficiency, internal wear, vibration, pressure, temperature, or actual power unless that evidence is explicitly shown.\n- For energy bills, extract visible billing period, energy, demand, tariff, and cost values without treating them as instantaneous measurements.\n- For floor plans or diagrams, describe visible assets and labels; do not infer exact geometry that is not dimensioned.\n- In warnings, explicitly state important limitations or ambiguities.\n- In nextEvidence, request the smallest useful next piece of evidence that could materially reduce uncertainty.\n${datasetRules}\nReturn JSON matching the required schema exactly.${sample}`;
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
    if (dataset) { datasetText = await file.text(); deterministicStats = deterministicDatasetObservations(datasetText, file.name); }

    const content = dataset
      ? [{ type: "input_text", text: buildPrompt(file.name, file.type, datasetText, Boolean(datasetText && datasetText.length > MAX_DATASET_PROMPT_CHARS)) }]
      : file.type === "application/pdf"
        ? [{ type: "input_file", filename: file.name, file_data: await toDataUrl(file), detail: "high" }, { type: "input_text", text: buildPrompt(file.name, file.type) }]
        : [{ type: "input_text", text: buildPrompt(file.name, file.type) }, { type: "input_image", image_url: await toDataUrl(file), detail: "high" }];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "overhaul_evidence_extraction", strict: true, schema: { type: "object", additionalProperties: false, required: ["evidenceType", "rawText", "observations", "visibleAssets", "warnings", "nextEvidence"], properties: { evidenceType: { type: "string", enum: ["equipment_nameplate", "equipment", "building_exterior", "building_interior", "mechanical_room", "floorplan", "energy_bill", "technical_document", "other"] }, rawText: { type: "string" }, observations: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "value", "numericValue", "unit", "confidence", "sourceText", "notes"], properties: { field: { type: "string" }, value: { type: "string" }, numericValue: { type: ["number", "null"] }, unit: { type: ["string", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, sourceText: { type: "string" }, notes: { type: "string" } } } }, visibleAssets: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } }, nextEvidence: { type: "array", items: { type: "string" } } } } } }, max_output_tokens: 7000, store: false }) });

    if (!openaiResponse.ok) { const errorBody = await openaiResponse.text(); console.error("OpenAI evidence extraction failed", openaiResponse.status, errorBody.slice(0, 500)); return NextResponse.json({ error: "Evidence analysis failed. Please retry this file." }, { status: 502 }); }
    const payload = await openaiResponse.json() as { output_text?: string };
    if (!payload.output_text) return NextResponse.json({ error: "Evidence analysis returned no structured result." }, { status: 502 });
    const validated = evidenceExtractionSchema.parse(JSON.parse(payload.output_text));
    const sanitized = sanitizeEvidenceExtraction(validated);
    if (deterministicStats) { sanitized.observations = [...deterministicStats.observations, ...sanitized.observations].slice(0, MAX_DATASET_OBSERVATIONS); sanitized.warnings = [...deterministicStats.warnings, ...sanitized.warnings]; }
    const result: EvidenceExtractionResponse = { evidenceId, filename: file.name, mimeType: file.type || (file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "application/octet-stream"), model: MODEL, ...sanitized };
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Evidence extraction route error", error);
    return NextResponse.json({ error: "Evidence analysis failed. Please retry this file." }, { status: 500 });
  }
}
