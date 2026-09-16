import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 160_000;
const MODEL = process.env.NEBIUS_VISION_MODEL || "nvidia/nemotron-3-nano-omni";
const BASE_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "");

const schema = {
  type: "object", additionalProperties: false,
  required: ["summary", "objects", "visibleDetails", "findings", "coverage", "nextEvidence"],
  properties: {
    summary: { type: "string" },
    objects: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "views", "confidence", "evidence"], properties: { label: { type: "string" }, views: { type: "integer", minimum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence: { type: "string" } } } },
    visibleDetails: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value", "views", "confidence"], properties: { label: { type: "string" }, value: { type: "string" }, views: { type: "integer", minimum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "label", "confidence", "views", "evidence", "engineeringStatus", "requiredVerification", "retrofitRelevance"], properties: { id: { type: "string" }, type: { type: "string", enum: ["visible-condition", "obstruction", "degradation", "leak-indicator", "insulation-condition", "installation-condition", "access-condition", "unknown"] }, label: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, views: { type: "integer", minimum: 1 }, evidence: { type: "string" }, engineeringStatus: { type: "string", enum: ["observed", "requires-verification"] }, requiredVerification: { type: "array", items: { type: "string" } }, retrofitRelevance: { type: "string" } } } },
    coverage: { type: "object", additionalProperties: false, required: ["viewsAnalysed", "repeatConfirmed", "blindSpots"], properties: { viewsAnalysed: { type: "integer", minimum: 0 }, repeatConfirmed: { type: "integer", minimum: 0 }, blindSpots: { type: "array", items: { type: "string" } } } },
    nextEvidence: { type: "array", items: { type: "string" } },
  },
};

function cleanText(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function norm(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(the|unit|asset|machine|equipment)\b/g, " ").replace(/\s+/g, " ").trim(); }

export async function POST(request: Request) {
  const rl = rateLimit(`scan-fusion:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Scan fusion rate limit exceeded." }, { status: 429 });
  try {
    const body = await request.json() as { scope?: unknown; analyses?: unknown };
    const scope = cleanText(body.scope, 40) || "building";
    const analyses = Array.isArray(body.analyses) ? body.analyses.slice(0, 12) : [];
    if (!analyses.length) return NextResponse.json({ error: "At least one analysed scan view is required." }, { status: 400 });
    const compact = analyses.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        sector: Number(row.sector) || 0,
        summary: cleanText(row.summary, 700),
        detections: Array.isArray(row.detections) ? row.detections.slice(0, 12).map((d) => {
          const x = d && typeof d === "object" ? d as Record<string, unknown> : {};
          return { label: cleanText(x.label, 100), confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), condition: cleanText(x.condition, 240), evidence: cleanText(x.evidence, 400), box: x.box && typeof x.box === "object" ? x.box : null };
        }) : [],
        engineering_clues: Array.isArray(row.engineering_clues) ? row.engineering_clues.slice(0, 8).map((x) => cleanText(x, 300)).filter(Boolean) : [],
        coverage_notes: Array.isArray(row.coverage_notes) ? row.coverage_notes.slice(0, 8).map((x) => cleanText(x, 300)).filter(Boolean) : [],
        visible_details: row.visible_details && typeof row.visible_details === "object" ? Object.fromEntries(Object.entries(row.visible_details as Record<string, unknown>).slice(0, 12).map(([key, value]) => [cleanText(key, 80), cleanText(value, 180)])) : null,
      };
    });
    const prompt = `You are the cross-view reasoning layer in OVERHAUL's engineering retrofit system. Target scope: ${scope}. Consolidate independent visual analyses conservatively. Merge repeated visible objects, preserve only readable identity/specification text, and identify visible conditions without inventing engineering quantities. A repeat view increases visual confidence only when the same label/condition is supported by multiple sectors. Never call a visual condition a confirmed failure. Every finding must state required engineering verification. Return visibleDetails only for repeat-supported readable identity/specification facts. Never invent dimensions, severity, energy loss, temperatures, pressures, efficiency, structural integrity, or hidden components.\n\nAnalyses:\n${JSON.stringify(compact).slice(0, MAX_BYTES)}`;
    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Nebius vision is not configured on this deployment." }, { status: 503 });
    const response = await fetch(`${BASE_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }], response_format: { type: "json_schema", json_schema: { name: "overhaul_scan_fusion", strict: true, schema } }, temperature: 0, max_tokens: 5000 }) });
    if (!response.ok) return NextResponse.json({ error: "Cross-view scan analysis failed." }, { status: 502 });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Cross-view analysis returned no structured result." }, { status: 502 });
    const result = JSON.parse(content) as Record<string, unknown>;

    const evidenceByLabel = new Map<string, Set<number>>();
    const conditionByLabel = new Map<string, Set<number>>();
    for (const item of compact) for (const detection of item.detections) {
      const key = norm(detection.label);
      if (!key) continue;
      if (!evidenceByLabel.has(key)) evidenceByLabel.set(key, new Set<number>());
      if (detection.confidence >= 0.55) evidenceByLabel.get(key)?.add(item.sector);
      const conditionKey = norm(`${detection.label} ${detection.condition}`);
      if (detection.condition && detection.confidence >= 0.55) {
        if (!conditionByLabel.has(conditionKey)) conditionByLabel.set(conditionKey, new Set<number>());
        conditionByLabel.get(conditionKey)?.add(item.sector);
      }
    }

    const findings = Array.isArray(result.findings) ? result.findings.map((finding) => {
      const row = finding && typeof finding === "object" ? { ...(finding as Record<string, unknown>) } : {};
      const label = cleanText(row.label, 160);
      const exact = conditionByLabel.get(norm(label));
      const labelViews = evidenceByLabel.get(norm(label));
      const supportingViews = exact?.size || labelViews?.size || 1;
      const originalConfidence = Math.max(0, Math.min(1, Number(row.confidence) || 0));
      row.views = supportingViews;
      row.confidence = supportingViews >= 2 ? Math.min(originalConfidence, 0.92) : Math.min(originalConfidence, 0.68);
      row.engineeringStatus = supportingViews >= 2 && row.engineeringStatus === "observed" ? "observed" : "requires-verification";
      if (supportingViews < 2) row.requiredVerification = Array.from(new Set([...(Array.isArray(row.requiredVerification) ? row.requiredVerification.map(String) : []), "Independent inspection or measurement required; single-view visual evidence is insufficient."]));
      return row;
    }) : [];

    const objects = Array.isArray(result.objects) ? result.objects.map((object) => {
      const row = object && typeof object === "object" ? { ...(object as Record<string, unknown>) } : {};
      const supportingViews = evidenceByLabel.get(norm(cleanText(row.label, 160)))?.size || 1;
      row.views = supportingViews;
      row.confidence = Math.min(Math.max(0, Math.min(1, Number(row.confidence) || 0)), supportingViews >= 2 ? 0.92 : 0.68);
      return row;
    }) : [];

    const visibleDetails = Array.isArray(result.visibleDetails) ? result.visibleDetails.filter((detail) => {
      const row = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
      return (Number(row.views) || 0) >= 2;
    }).map((detail) => {
      const row = { ...(detail as Record<string, unknown>) };
      const supportingViews = evidenceByLabel.get(norm(cleanText(row.label, 120)))?.size || 1;
      row.views = supportingViews;
      row.confidence = Math.min(Math.max(0, Math.min(1, Number(row.confidence) || 0)), supportingViews >= 2 ? 0.92 : 0.68);
      return row;
    }) : [];

    result.findings = findings;
    result.objects = objects;
    result.visibleDetails = visibleDetails;
    const repeatConfirmed = findings.filter((finding) => Number((finding as Record<string, unknown>).views) >= 2).length;
    const coverage = result.coverage && typeof result.coverage === "object" ? { ...(result.coverage as Record<string, unknown>) } : {};
    coverage.viewsAnalysed = compact.length;
    coverage.repeatConfirmed = repeatConfirmed;
    result.coverage = coverage;

    return NextResponse.json({ result, model: MODEL, provider: "Nebius Token Factory / NVIDIA Nemotron", confidencePolicy: "server-enforced corroboration by camera sector" });
  } catch (error) {
    console.error("Scan fusion route error", error);
    return NextResponse.json({ error: "Cross-view scan analysis failed." }, { status: 500 });
  }
}
