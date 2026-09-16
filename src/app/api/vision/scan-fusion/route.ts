import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 160_000;
const MODEL = process.env.NEBIUS_VISION_MODEL || "nvidia/nemotron-3-nano-omni";
const BASE_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "");

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "objects", "visibleDetails", "findings", "coverage", "nextEvidence"],
  properties: {
    summary: { type: "string" },
    objects: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "views", "confidence", "evidence"], properties: {
        label: { type: "string" }, views: { type: "integer", minimum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence: { type: "string" },
      } },
    },
    visibleDetails: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "value", "views", "confidence"], properties: {
        label: { type: "string" }, value: { type: "string" }, views: { type: "integer", minimum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 },
      } },
    },
    findings: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "type", "label", "confidence", "views", "evidence", "engineeringStatus", "requiredVerification", "retrofitRelevance"], properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["visible-condition", "obstruction", "degradation", "leak-indicator", "insulation-condition", "installation-condition", "access-condition", "unknown"] },
        label: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        views: { type: "integer", minimum: 1 },
        evidence: { type: "string" },
        engineeringStatus: { type: "string", enum: ["observed", "requires-verification"] },
        requiredVerification: { type: "array", items: { type: "string" } },
        retrofitRelevance: { type: "string" },
      } },
    },
    coverage: { type: "object", additionalProperties: false, required: ["viewsAnalysed", "repeatConfirmed", "blindSpots"], properties: {
      viewsAnalysed: { type: "integer", minimum: 0 }, repeatConfirmed: { type: "integer", minimum: 0 }, blindSpots: { type: "array", items: { type: "string" } },
    } },
    nextEvidence: { type: "array", items: { type: "string" } },
  },
};

function cleanText(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

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
          return {
            label: cleanText(x.label, 100),
            confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)),
            condition: cleanText(x.condition, 240),
            evidence: cleanText(x.evidence, 400),
            box: x.box && typeof x.box === "object" ? x.box : null,
          };
        }) : [],
        engineering_clues: Array.isArray(row.engineering_clues) ? row.engineering_clues.slice(0, 8).map((x) => cleanText(x, 300)).filter(Boolean) : [],
        coverage_notes: Array.isArray(row.coverage_notes) ? row.coverage_notes.slice(0, 8).map((x) => cleanText(x, 300)).filter(Boolean) : [],
        visible_details: row.visible_details && typeof row.visible_details === "object" ? Object.fromEntries(Object.entries(row.visible_details as Record<string, unknown>).slice(0, 12).map(([key, value]) => [cleanText(key, 80), cleanText(value, 180)])) : null,
      };
    });
    const prompt = `You are the cross-view reasoning layer in OVERHAUL's engineering retrofit system.\n\nTarget scope: ${scope}.\nYou are receiving independent visual analyses from multiple camera sectors. Consolidate them without inventing facts.\n\nYour job:\n1. Merge repeated detections of the same visible object across sectors.\n2. Identify repeat-confirmed visible conditions. A condition seen in multiple independent views can have higher visual confidence, but it is still not a measured engineering fault.\n3. Preserve readable visible identity/specification details (model, manufacturer, serial, capacity, voltage, current, flow, etc.) only when explicitly present in the input. Do not complete or correct unreadable text.\n4. Convert only evidence-grounded visible conditions into findings.\n5. For every finding, state one or more engineering measurements/inspections required before treating it as a fault.\n6. Explain how the finding could affect retrofit scope, sequencing, access, maintenance, insulation, airflow, or replacement decisions WITHOUT claiming quantified savings or causality.\n7. Identify blind spots when sectors do not cover an area or when evidence conflicts.\n\nHard rules:\n- NEVER invent dimensions, severity, energy loss, temperatures, pressures, efficiency, structural integrity, or hidden components.\n- Never call a visual condition a confirmed failure.\n- Keep confidence visual only.\n- Prefer 'requires verification' when evidence is insufficient.\n- Repeated views strengthen observation confidence only when labels/conditions are consistent.\n- Visible identity/specification details are evidence, not engineering validation.\n\nReturn visibleDetails as repeat-confirmed identity/specification facts only.\n\nAnalyses:\n${JSON.stringify(compact).slice(0, MAX_BYTES)}`;
    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Nebius vision is not configured on this deployment." }, { status: 503 });
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        response_format: { type: "json_schema", json_schema: { name: "overhaul_scan_fusion", strict: true, schema } },
        temperature: 0.05,
        max_tokens: 5000,
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "Cross-view scan analysis failed." }, { status: 502 });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Cross-view analysis returned no structured result." }, { status: 502 });
    let result: unknown;
    try { result = JSON.parse(content); } catch { return NextResponse.json({ error: "Cross-view analysis returned invalid JSON." }, { status: 502 }); }
    return NextResponse.json({ result, model: MODEL, provider: "Nebius Token Factory / NVIDIA Nemotron" });
  } catch (error) {
    console.error("Scan fusion route error", error);
    return NextResponse.json({ error: "Cross-view scan analysis failed." }, { status: 500 });
  }
}
