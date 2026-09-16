import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OBSERVATIONS = 500;
const MAX_EVIDENCE = 20;
const MAX_SCAN_SECTORS = 12;
const MAX_FUSION_FINDINGS = 40;
const MAX_FUSION_DETAILS = 20;
const SCOPES = new Set(["building", "facility", "equipment"]);

type AnyRecord = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.slice(0, 500) : fallback;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeClimate(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const value = input as AnyRecord;
  return {
    location: text(value.location),
    temperature: finiteNumber(value.temperature),
    humidity: finiteNumber(value.humidity),
    min: finiteNumber(value.min),
    max: finiteNumber(value.max),
    rain: finiteNumber(value.rain),
    source: text(value.source, "Open-Meteo current/forecast context"),
    fetchedAt: text(value.fetchedAt),
  };
}

function sanitizeRoomScan(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const scan = input as AnyRecord;
  const rawSectors = Array.isArray(scan.sectors) ? scan.sectors : [];
  const sectors = rawSectors.slice(0, MAX_SCAN_SECTORS).map((sector) => {
    if (!sector || typeof sector !== "object") return null;
    const row = sector as AnyRecord;
    const rawResult = row.result;
    const result = rawResult && typeof rawResult === "object" ? rawResult as AnyRecord : {};
    const rawDetections = Array.isArray(result.detections) ? result.detections : [];
    const detections = rawDetections.slice(0, 20).map((detection) => {
      if (!detection || typeof detection !== "object") return null;
      const item = detection as AnyRecord;
      const rawBox = item.box;
      const box = rawBox && typeof rawBox === "object" ? rawBox as AnyRecord : {};
      return {
        label: text(item.label, "Unclassified"),
        confidence: Math.min(1, Math.max(0, finiteNumber(item.confidence) ?? 0)),
        condition: text(item.condition),
        evidence: text(item.evidence),
        box: {
          x: finiteNumber(box.x),
          y: finiteNumber(box.y),
          width: finiteNumber(box.width),
          height: finiteNumber(box.height),
        },
      };
    }).filter(Boolean);
    return {
      id: text(row.id),
      sector: finiteNumber(row.sector),
      result: {
        summary: text(result.summary),
        detections,
        engineering_clues: Array.isArray(result.engineering_clues) ? result.engineering_clues.slice(0, 12).map((value) => text(value)).filter(Boolean) : [],
        coverage_notes: Array.isArray(result.coverage_notes) ? result.coverage_notes.slice(0, 12).map((value) => text(value)).filter(Boolean) : [],
        visible_details: result.visible_details && typeof result.visible_details === "object" ? result.visible_details : null,
      },
    };
  }).filter(Boolean);
  return {
    scope: text(scan.scope, "building"),
    coveragePercent: finiteNumber(scan.coveragePercent) ?? 0,
    completed: Boolean(scan.completed),
    sectors,
    updatedAt: text(scan.updatedAt),
  };
}

function sanitizeScanFusion(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const fusion = input as AnyRecord;
  const rawFindings = Array.isArray(fusion.findings) ? fusion.findings : [];
  const findings = rawFindings.slice(0, MAX_FUSION_FINDINGS).map((finding, index) => {
    if (!finding || typeof finding !== "object") return null;
    const row = finding as AnyRecord;
    return {
      id: text(row.id, `finding-${index + 1}`),
      type: text(row.type, "unknown"),
      label: text(row.label, "Unclassified finding"),
      confidence: Math.min(1, Math.max(0, finiteNumber(row.confidence) ?? 0)),
      views: Array.isArray(row.views) ? row.views.slice(0, 12).map((value) => Math.max(0, Math.floor(finiteNumber(value) ?? 0))) : [],
      evidence: text(row.evidence),
      engineeringStatus: text(row.engineeringStatus, "requires-verification"),
      requiredVerification: Array.isArray(row.requiredVerification) ? row.requiredVerification.slice(0, 8).map((value) => text(value)).filter(Boolean) : [],
      retrofitRelevance: text(row.retrofitRelevance),
    };
  }).filter(Boolean);
  const visibleDetails = Array.isArray(fusion.visibleDetails) ? fusion.visibleDetails.slice(0, MAX_FUSION_DETAILS).map((detail) => {
    if (!detail || typeof detail !== "object") return null;
    const row = detail as AnyRecord;
    return {
      label: text(row.label, "Visible detail"),
      value: text(row.value),
      views: Math.max(1, Math.floor(finiteNumber(row.views) ?? 1)),
      confidence: Math.min(1, Math.max(0, finiteNumber(row.confidence) ?? 0)),
    };
  }).filter(Boolean) : [];
  return {
    summary: text(fusion.summary),
    objects: Array.isArray(fusion.objects) ? fusion.objects.slice(0, 40) : [],
    visibleDetails,
    findings,
    coverage: fusion.coverage && typeof fusion.coverage === "object" ? fusion.coverage : null,
    nextEvidence: Array.isArray(fusion.nextEvidence) ? fusion.nextEvidence.slice(0, 20).map((value) => text(value)).filter(Boolean) : [],
    updatedAt: text(fusion.updatedAt),
  };
}

function buildEvidenceRows(projectId: string, assetId: string, items: AnyRecord[]) {
  return items.map((item) => ({
    project_id: projectId,
    asset_id: assetId,
    kind: ["scan", "photo", "document"].includes(text(item.kind)) ? text(item.kind) : "other",
    name: text(item.name, "Evidence"),
    source_ref: text(item.id) || null,
    metadata: { mimeType: text(item.type), size: finiteNumber(item.size) },
  }));
}

function buildObservationRows(projectId: string, assetId: string, extractions: unknown[], evidenceMap: Map<string | null, string>) {
  const rows: AnyRecord[] = [];
  for (const extraction of extractions.slice(0, MAX_EVIDENCE)) {
    if (!extraction || typeof extraction !== "object") continue;
    const source = extraction as AnyRecord;
    const evidenceId = evidenceMap.get(text(source.evidenceId) || null) || null;
    const observations = Array.isArray(source.observations) ? source.observations : [];
    for (const observation of observations) {
      if (rows.length >= MAX_OBSERVATIONS) break;
      if (!observation || typeof observation !== "object") continue;
      const item = observation as AnyRecord;
      rows.push({
        project_id: projectId,
        asset_id: assetId,
        evidence_id: evidenceId,
        field: text(item.field, "unknown").slice(0, 120),
        value_numeric: finiteNumber(item.numericValue),
        value_text: text(item.value).slice(0, 500) || null,
        unit: text(item.unit).slice(0, 40) || null,
        confidence: Math.min(1, Math.max(0, finiteNumber(item.confidence) ?? 0)),
        source_type: text(source.sourceKind, "evidence"),
        provenance: {
          extractionModel: text(source.model),
          sourceName: text(source.sourceName),
          sourceText: text(item.sourceText),
          notes: text(item.notes),
        },
      });
    }
  }
  return rows;
}

async function persistEvidenceAndObservations(supabase: ReturnType<typeof getSupabaseAdmin>, projectId: string, assetId: string, assessment: AnyRecord, extractions: unknown[]) {
  const evidenceItems = Array.isArray(assessment.evidence) ? assessment.evidence.slice(0, MAX_EVIDENCE) as AnyRecord[] : [];
  const candidateRows = buildEvidenceRows(projectId, assetId, evidenceItems);
  const existing = await supabase.from("evidence").select("id, source_ref").eq("project_id", projectId).limit(MAX_EVIDENCE * 2);
  if (existing.error) throw existing.error;
  const existingRefs = new Set((existing.data || []).map((row: { source_ref: string | null }) => row.source_ref).filter(Boolean));
  const newRows = candidateRows.filter((row) => !row.source_ref || !existingRefs.has(row.source_ref));
  if (newRows.length) {
    const inserted = await supabase.from("evidence").insert(newRows);
    if (inserted.error) throw inserted.error;
  }
  const allEvidence = await supabase.from("evidence").select("id, source_ref").eq("project_id", projectId).limit(MAX_EVIDENCE * 3);
  if (allEvidence.error) throw allEvidence.error;
  const evidenceMap = new Map<string | null, string>();
  for (const row of allEvidence.data || []) evidenceMap.set(row.source_ref, row.id);
  const refreshIds = [...new Set(evidenceItems.map((item) => evidenceMap.get(text(item.id) || null)).filter((value): value is string => Boolean(value)))];
  if (refreshIds.length) {
    const deleted = await supabase.from("observations").delete().in("evidence_id", refreshIds);
    if (deleted.error) throw deleted.error;
  }
  const observationRows = buildObservationRows(projectId, assetId, extractions, evidenceMap);
  if (observationRows.length) {
    const inserted = await supabase.from("observations").insert(observationRows);
    if (inserted.error) throw inserted.error;
  }
  return { evidence: candidateRows.length, observations: observationRows.length };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawAssessment = body?.assessment;
    if (!rawAssessment || typeof rawAssessment !== "object") return NextResponse.json({ error: "Assessment payload is required." }, { status: 400 });
    const assessment = rawAssessment as AnyRecord;
    const extractions = Array.isArray(body?.extractions) ? body.extractions : [];
    const supplemental = body?.supplemental && typeof body.supplemental === "object" ? body.supplemental as AnyRecord : {};
    const twinModel = body?.twinModel && typeof body.twinModel === "object" ? body.twinModel : null;
    const roomScan = sanitizeRoomScan(body?.roomScan);
    const scanFusion = sanitizeScanFusion(body?.scanFusion);
    const climate = sanitizeClimate(body?.climate);
    const scope = text(assessment.assessmentSubject, "building");
    if (!SCOPES.has(scope)) return NextResponse.json({ error: "Invalid assessment scope." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const projectName = text(assessment.siteName) || text(assessment.assetClass) || `${scope} assessment`;
    const fusionFindingsCount = scanFusion && Array.isArray(scanFusion.findings) ? scanFusion.findings.length : 0;
    const metadata = { source: "overhaul-web", assessment, supplemental, roomScan, scanFusion, climate, twinModel, persistedAt: new Date().toISOString() };
    const existingProjectId = text(body?.projectId) || null;
    const existingAssetId = text(body?.assetId) || null;

    let projectId = existingProjectId;
    let assetId = existingAssetId;
    if (projectId) {
      const updatedProject = await supabase.from("projects").update({ name: projectName, scope, metadata }).eq("id", projectId).select("id").maybeSingle();
      if (updatedProject.error) throw updatedProject.error;
      if (!updatedProject.data) return NextResponse.json({ error: "Project no longer exists. Start a new assessment." }, { status: 409 });
    } else {
      const createdProject = await supabase.from("projects").insert({ name: projectName, scope, metadata }).select("id").single();
      if (createdProject.error || !createdProject.data) throw createdProject.error || new Error("Project creation failed.");
      projectId = createdProject.data.id;
    }

    const dimensions = {
      width: finiteNumber(supplemental.width_m ?? supplemental.width),
      depth: finiteNumber(supplemental.depth_m ?? supplemental.depth),
      height: finiteNumber(supplemental.height_m ?? supplemental.height),
    };
    const assetModel = {
      scope,
      industry: assessment.industry,
      goal: assessment.assessmentGoal,
      supplemental,
      roomScanCoveragePercent: roomScan ? roomScan.coveragePercent : null,
      scanFusionFindingCount: fusionFindingsCount,
      climate,
      twinModel,
    };
    const provenance = {
      source: "assessment-intake",
      evidenceCount: Array.isArray(assessment.evidence) ? assessment.evidence.length : 0,
      roomScanCompleted: roomScan ? roomScan.completed : false,
      scanFusionUpdated: Boolean(scanFusion),
      climateContext: climate ? "regional-weather-context" : "not-resolved",
    };

    if (assetId && projectId) {
      const updatedAsset = await supabase.from("assets").update({ asset_type: scope, name: projectName, model: assetModel, geometry: dimensions, provenance }).eq("id", assetId).eq("project_id", projectId).select("id").maybeSingle();
      if (updatedAsset.error) throw updatedAsset.error;
      if (!updatedAsset.data) return NextResponse.json({ error: "Assessment asset no longer exists. Start a new assessment." }, { status: 409 });
    } else if (projectId) {
      const createdAsset = await supabase.from("assets").insert({ project_id: projectId, asset_type: scope, name: projectName, model: assetModel, geometry: dimensions, provenance }).select("id").single();
      if (createdAsset.error || !createdAsset.data) throw createdAsset.error || new Error("Asset creation failed.");
      assetId = createdAsset.data.id;
    }

    if (!projectId || !assetId) throw new Error("Persistence identifiers were not established.");
    const counts = await persistEvidenceAndObservations(supabase, projectId, assetId, assessment, extractions);
    return NextResponse.json({ projectId, assetId, updated: Boolean(existingProjectId), counts: { ...counts, roomScanSectors: roomScan ? roomScan.sectors.length : 0, scanFusionFindings: fusionFindingsCount, scanFusionVisibleDetails: scanFusion && Array.isArray(scanFusion.visibleDetails) ? scanFusion.visibleDetails.length : 0 } });
  } catch (error) {
    console.error("OVERHAUL persistence route error", error);
    return NextResponse.json({ error: "Could not persist this assessment." }, { status: 500 });
  }
}
