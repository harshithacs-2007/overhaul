import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OBSERVATIONS = 500;
const MAX_EVIDENCE = 20;
const MAX_SCAN_SECTORS = 12;
const MAX_FUSION_FINDINGS = 40;
const SCOPES = new Set(["building", "facility", "equipment"]);
function text(value: unknown, fallback = "") { return typeof value === "string" ? value.slice(0, 500) : fallback; }
function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function sanitizeClimate(input: unknown) { if (!input || typeof input !== "object") return null; const c = input as Record<string, unknown>; return { location: text(c.location), temperature: finiteNumber(c.temperature), humidity: finiteNumber(c.humidity), min: finiteNumber(c.min), max: finiteNumber(c.max), rain: finiteNumber(c.rain), source: text(c.source, "Open-Meteo current/forecast context"), fetchedAt: text(c.fetchedAt) }; }
function sanitizeRoomScan(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const scan = input as Record<string, unknown>;
  const sectors = Array.isArray(scan.sectors) ? scan.sectors.slice(0, MAX_SCAN_SECTORS).map((sector) => {
    if (!sector || typeof sector !== "object") return null;
    const row = sector as Record<string, unknown>;
    const result = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : {};
    const detections = Array.isArray(result.detections) ? result.detections.slice(0, 20).map((d) => {
      if (!d || typeof d !== "object") return null;
      const item = d as Record<string, unknown>;
      const box = item.box && typeof item.box === "object" ? item.box as Record<string, unknown> : {};
      return { label: text(item.label, "Unclassified"), confidence: Math.min(1, Math.max(0, finiteNumber(item.confidence) ?? 0)), condition: text(item.condition), evidence: text(item.evidence), box: { x: finiteNumber(box.x), y: finiteNumber(box.y), width: finiteNumber(box.width), height: finiteNumber(box.height) } };
    }).filter(Boolean) : [];
    return { id: text(row.id), sector: finiteNumber(row.sector), result: { summary: text(result.summary), detections, engineering_clues: Array.isArray(result.engineering_clues) ? result.engineering_clues.slice(0, 12).map((x) => text(x)).filter(Boolean) : [], coverage_notes: Array.isArray(result.coverage_notes) ? result.coverage_notes.slice(0, 12).map((x) => text(x)).filter(Boolean) : [], visible_details: result.visible_details && typeof result.visible_details === "object" ? result.visible_details : null };
  }).filter(Boolean) : [];
  return { scope: text(scan.scope, "building"), coveragePercent: finiteNumber(scan.coveragePercent) ?? 0, completed: Boolean(scan.completed), sectors, updatedAt: text(scan.updatedAt) };
}
function sanitizeScanFusion(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const fusion = input as Record<string, unknown>;
  const findings = Array.isArray(fusion.findings) ? fusion.findings.slice(0, MAX_FUSION_FINDINGS).map((finding) => {
    if (!finding || typeof finding !== "object") return null;
    const row = finding as Record<string, unknown>;
    return {
      id: text(row.id, `finding-${Math.random().toString(36).slice(2, 7)}`),
      type: text(row.type, "unknown"),
      label: text(row.label, "Unclassified finding"),
      confidence: Math.min(1, Math.max(0, finiteNumber(row.confidence) ?? 0)),
      views: Array.isArray(row.views) ? row.views.slice(0, 12).map((v) => Math.max(0, Math.floor(finiteNumber(v) ?? 0))) : [],
      evidence: text(row.evidence),
      engineeringStatus: text(row.engineeringStatus, "requires-verification"),
      requiredVerification: Array.isArray(row.requiredVerification) ? row.requiredVerification.slice(0, 8).map((v) => text(v)).filter(Boolean) : [],
      retrofitRelevance: text(row.retrofitRelevance),
    };
  }).filter(Boolean) : [];
  return { summary: text(fusion.summary), merged_objects: Array.isArray(fusion.merged_objects) ? fusion.merged_objects.slice(0, 40) : [], findings, coverage: fusion.coverage && typeof fusion.coverage === "object" ? fusion.coverage : null, nextEvidence: Array.isArray(fusion.nextEvidence) ? fusion.nextEvidence.slice(0, 20).map((v) => text(v)).filter(Boolean) : [], updatedAt: text(fusion.updatedAt) };
}
function buildEvidenceRows(projectId: string, assetId: string, items: Array<Record<string, unknown>>) { return items.map((item) => ({ project_id: projectId, asset_id: assetId, kind: ["scan", "photo", "document"].includes(text(item.kind)) ? text(item.kind) : "other", name: text(item.name, "Evidence"), source_ref: text(item.id) || null, metadata: { mimeType: text(item.type), size: finiteNumber(item.size) } })); }
function buildObservationRows(projectId: string, assetId: string, extractions: unknown[], map: Map<string | null, string>) {
  const rows: Array<Record<string, unknown>> = [];
  for (const extraction of extractions.slice(0, MAX_EVIDENCE)) {
    const e = extraction as Record<string, unknown>;
    const evidenceId = map.get(text(e.evidenceId) || null);
    const observations = Array.isArray(e.observations) ? e.observations : [];
    for (const observation of observations) {
      if (rows.length >= MAX_OBSERVATIONS) break;
      const item = observation as Record<string, unknown>;
      rows.push({ project_id: projectId, asset_id: assetId, evidence_id: evidenceId || null, field: text(item.field, "unknown").slice(0, 120), value_numeric: finiteNumber(item.numericValue), value_text: text(item.value).slice(0, 500) || null, unit: text(item.unit).slice(0, 40) || null, confidence: Math.min(1, Math.max(0, finiteNumber(item.confidence) ?? 0)), source_type: text(e.sourceKind, "evidence"), provenance: { extractionModel: text(e.model), sourceName: text(e.sourceName), sourceText: text(item.sourceText), notes: text(item.notes) } });
    }
  }
  return rows;
}
async function persistEvidenceAndObservations(supabase: ReturnType<typeof getSupabaseAdmin>, projectId: string, assetId: string, assessment: Record<string, unknown>, extractions: unknown[]) {
  const evidenceItems = Array.isArray(assessment.evidence) ? assessment.evidence.slice(0, MAX_EVIDENCE) as Array<Record<string, unknown>> : [];
  const candidateRows = buildEvidenceRows(projectId, assetId, evidenceItems);
  const { data: existingEvidence, error: existingEvidenceError } = await supabase.from("evidence").select("id, source_ref").eq("project_id", projectId).limit(MAX_EVIDENCE * 2);
  if (existingEvidenceError) throw existingEvidenceError;
  const existingRefs = new Set((existingEvidence || []).map((r: { source_ref: string | null }) => r.source_ref).filter(Boolean));
  const newRows = candidateRows.filter((r) => !r.source_ref || !existingRefs.has(r.source_ref));
  if (newRows.length) { const { error } = await supabase.from("evidence").insert(newRows); if (error) throw error; }
  const { data: allEvidence, error: allEvidenceError } = await supabase.from("evidence").select("id, source_ref").eq("project_id", projectId).limit(MAX_EVIDENCE * 3);
  if (allEvidenceError) throw allEvidenceError;
  const map = new Map<string | null, string>((allEvidence || []).map((r: { id: string; source_ref: string | null }) => [r.source_ref, r.id]));
  const refreshIds = [...new Set(evidenceItems.map((item) => map.get(text(item.id) || null)).filter((v): v is string => Boolean(v)))];
  if (refreshIds.length) { const { error } = await supabase.from("observations").delete().in("evidence_id", refreshIds); if (error) throw error; }
  const observationRows = buildObservationRows(projectId, assetId, extractions, map);
  if (observationRows.length) { const { error } = await supabase.from("observations").insert(observationRows); if (error) throw error; }
  return { evidence: candidateRows.length, observations: observationRows.length };
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const assessment = body?.assessment;
    const extractions = Array.isArray(body?.extractions) ? body.extractions : [];
    const supplemental = body?.supplemental && typeof body.supplemental === "object" ? body.supplemental : {};
    const twinModel = body?.twinModel && typeof body.twinModel === "object" ? body.twinModel : null;
    const roomScan = sanitizeRoomScan(body?.roomScan);
    const scanFusion = sanitizeScanFusion(body?.scanFusion);
    const climate = sanitizeClimate(body?.climate);
    const existingProjectId = text(body?.projectId) || null;
    const existingAssetId = text(body?.assetId) || null;
    const scope = text(assessment?.assessmentSubject, "building");
    if (!SCOPES.has(scope)) return NextResponse.json({ error: "Invalid assessment scope." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const projectName = text(assessment?.siteName) || text(assessment?.assetClass) || `${scope} assessment`;
    const metadata = { source: "overhaul-web", assessment, supplemental, roomScan, scanFusion, climate, twinModel, persistedAt: new Date().toISOString() };
    if (existingProjectId) {
      const { data: project, error: projectError } = await supabase.from("projects").update({ name: projectName, scope, metadata }).eq("id", existingProjectId).select("id").maybeSingle();
      if (projectError) throw projectError;
      if (!project) return NextResponse.json({ error: "Project no longer exists. Start a new assessment." }, { status: 409 });
      const assetId = existingAssetId;
      if (assetId) {
        const dimensions = { width: finiteNumber(supplemental.width_m ?? supplemental.width), depth: finiteNumber(supplemental.depth_m ?? supplemental.depth), height: finiteNumber(supplemental.height_m ?? supplemental.height) };
        const { data: asset, error: assetError } = await supabase.from("assets").update({ asset_type: scope, name: projectName, model: { scope, industry: assessment?.industry, goal: assessment?.assessmentGoal, supplemental, roomScanCoveragePercent: roomScan?.coveragePercent ?? null, scanFusionFindingCount: scanFusion?.findings?.length ?? 0, climate, twinModel }, geometry: dimensions, provenance: { source: "assessment-intake", evidenceCount: Array.isArray(assessment?.evidence) ? assessment.evidence.length : 0, roomScanCompleted: roomScan?.completed ?? false, scanFusionUpdated: Boolean(scanFusion), climateContext: climate ? "regional-weather-context" : "not-resolved" } }).eq("id", assetId).eq("project_id", existingProjectId).select("id").maybeSingle();
        if (assetError) throw assetError;
        if (!asset) return NextResponse.json({ error: "Assessment asset no longer exists. Start a new assessment." }, { status: 409 });
      }
      const counts = assetId ? await persistEvidenceAndObservations(supabase, existingProjectId, assetId, assessment as Record<string, unknown>, extractions) : { evidence: 0, observations: 0 };
      return NextResponse.json({ projectId: existingProjectId, assetId, updated: true, counts: { ...counts, roomScanSectors: roomScan?.sectors?.length ?? 0, scanFusionFindings: scanFusion?.findings?.length ?? 0 } });
    }
    const { data: project, error: projectError } = await supabase.from("projects").insert({ name: projectName, scope, metadata }).select("id").single();
    if (projectError || !project) throw projectError || new Error("Project creation failed.");
    const dimensions = { width: finiteNumber(supplemental.width_m ?? supplemental.width), depth: finiteNumber(supplemental.depth_m ?? supplemental.depth), height: finiteNumber(supplemental.height_m ?? supplemental.height) };
    const { data: asset, error: assetError } = await supabase.from("assets").insert({ project_id: project.id, asset_type: scope, name: projectName, model: { scope, industry: assessment?.industry, goal: assessment?.assessmentGoal, supplemental, roomScanCoveragePercent: roomScan?.coveragePercent ?? null, scanFusionFindingCount: scanFusion?.findings?.length ?? 0, climate, twinModel }, geometry: dimensions, provenance: { source: "assessment-intake", evidenceCount: Array.isArray(assessment?.evidence) ? assessment.evidence.length : 0, roomScanCompleted: roomScan?.completed ?? false, scanFusionUpdated: Boolean(scanFusion), climateContext: climate ? "regional-weather-context" : "not-resolved" } }).select("id").single();
    if (assetError || !asset) throw assetError || new Error("Asset creation failed.");
    const counts = await persistEvidenceAndObservations(supabase, project.id, asset.id, assessment as Record<string, unknown>, extractions);
    return NextResponse.json({ projectId: project.id, assetId: asset.id, updated: false, counts: { ...counts, roomScanSectors: roomScan?.sectors?.length ?? 0, scanFusionFindings: scanFusion?.findings?.length ?? 0 } });
  } catch (error) {
    console.error("OVERHAUL persistence route error", error);
    return NextResponse.json({ error: "Could not persist this assessment." }, { status: 500 });
  }
}
