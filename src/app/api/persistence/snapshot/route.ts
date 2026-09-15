import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OBSERVATIONS = 500;
const MAX_EVIDENCE = 20;
const MAX_SCAN_SECTORS = 12;
const SCOPES = new Set(["building", "facility", "equipment"]);

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.slice(0, 500) : fallback;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeClimate(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const climate = input as Record<string, unknown>;
  return {
    location: text(climate.location),
    temperature: finiteNumber(climate.temperature),
    humidity: finiteNumber(climate.humidity),
    min: finiteNumber(climate.min),
    max: finiteNumber(climate.max),
    rain: finiteNumber(climate.rain),
    source: text(climate.source, "Open-Meteo current/forecast context"),
    fetchedAt: text(climate.fetchedAt),
  };
}

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
      return {
        label: text(item.label, "Unclassified"),
        confidence: Math.min(1, Math.max(0, finiteNumber(item.confidence) ?? 0)),
        condition: text(item.condition),
        evidence: text(item.evidence),
        box: {
          x: finiteNumber(box.x), y: finiteNumber(box.y),
          width: finiteNumber(box.width), height: finiteNumber(box.height),
        },
      };
    }).filter(Boolean) : [];
    return {
      id: text(row.id),
      sector: finiteNumber(row.sector),
      result: {
        summary: text(result.summary),
        detections,
        engineering_clues: Array.isArray(result.engineering_clues) ? result.engineering_clues.slice(0, 12).map((x) => text(x)).filter(Boolean) : [],
        coverage_notes: Array.isArray(result.coverage_notes) ? result.coverage_notes.slice(0, 12).map((x) => text(x)).filter(Boolean) : [],
      },
    };
  }).filter(Boolean) : [];
  return {
    scope: text(scan.scope, "building"),
    coveragePercent: finiteNumber(scan.coveragePercent) ?? 0,
    completed: Boolean(scan.completed),
    sectors,
    updatedAt: text(scan.updatedAt),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const assessment = body?.assessment;
    const extractions = Array.isArray(body?.extractions) ? body.extractions : [];
    const supplemental = body?.supplemental && typeof body.supplemental === "object" ? body.supplemental : {};
    const roomScan = sanitizeRoomScan(body?.roomScan);
    const climate = sanitizeClimate(body?.climate);

    const scope = text(assessment?.assessmentSubject, "building");
    if (!SCOPES.has(scope)) {
      return NextResponse.json({ error: "Invalid assessment scope." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const projectName = text(assessment?.siteName) || text(assessment?.assetClass) || `${scope} assessment`;
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        name: projectName,
        scope,
        metadata: {
          source: "overhaul-web",
          assessment,
          supplemental,
          roomScan,
          climate,
          persistedAt: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (projectError || !project) throw projectError || new Error("Project creation failed.");

    const dimensions = {
      width: finiteNumber(supplemental.width_m ?? supplemental.width),
      depth: finiteNumber(supplemental.depth_m ?? supplemental.depth),
      height: finiteNumber(supplemental.height_m ?? supplemental.height),
    };

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({
        project_id: project.id,
        asset_type: scope,
        name: projectName,
        model: { scope, industry: assessment?.industry, goal: assessment?.assessmentGoal, supplemental, roomScanCoveragePercent: roomScan?.coveragePercent ?? null, climate },
        geometry: dimensions,
        provenance: { source: "assessment-intake", evidenceCount: Array.isArray(assessment?.evidence) ? assessment.evidence.length : 0, roomScanCompleted: roomScan?.completed ?? false, climateContext: climate ? "regional-weather-context" : "not-resolved" },
      })
      .select("id")
      .single();

    if (assetError || !asset) throw assetError || new Error("Asset creation failed.");

    const evidenceItems = Array.isArray(assessment?.evidence) ? assessment.evidence.slice(0, MAX_EVIDENCE) : [];
    const evidenceRows = evidenceItems.map((item: any) => ({
      project_id: project.id,
      asset_id: asset.id,
      kind: ["scan", "photo", "document"].includes(item?.kind) ? item.kind : "other",
      name: text(item?.name, "Evidence"),
      source_ref: text(item?.id) || null,
      metadata: { mimeType: text(item?.type), size: finiteNumber(item?.size) },
    }));

    let insertedEvidence: any[] = [];
    if (evidenceRows.length) {
      const result = await supabase.from("evidence").insert(evidenceRows).select("id, source_ref");
      if (result.error) throw result.error;
      insertedEvidence = result.data || [];
    }

    const evidenceIdByClientId = new Map(insertedEvidence.map((row) => [row.source_ref, row.id]));
    const observationRows: any[] = [];

    for (const extraction of extractions.slice(0, MAX_EVIDENCE)) {
      const evidenceId = evidenceIdByClientId.get(text(extraction?.evidenceId));
      const observations = Array.isArray(extraction?.observations) ? extraction.observations : [];
      for (const observation of observations) {
        if (observationRows.length >= MAX_OBSERVATIONS) break;
        const numericValue = finiteNumber(observation?.numericValue);
        observationRows.push({
          project_id: project.id,
          asset_id: asset.id,
          evidence_id: evidenceId || null,
          field: text(observation?.field, "unknown").slice(0, 120),
          value_numeric: numericValue,
          value_text: text(observation?.value).slice(0, 500) || null,
          unit: text(observation?.unit).slice(0, 40) || null,
          confidence: Math.min(1, Math.max(0, finiteNumber(observation?.confidence) ?? 0)),
          source_type: text(extraction?.sourceKind, "evidence"),
          provenance: {
            extractionModel: text(extraction?.model),
            sourceName: text(extraction?.sourceName),
            sourceText: text(observation?.sourceText),
            notes: text(observation?.notes),
          },
        });
      }
    }

    if (observationRows.length) {
      const { error: observationError } = await supabase.from("observations").insert(observationRows);
      if (observationError) throw observationError;
    }

    return NextResponse.json({
      projectId: project.id,
      assetId: asset.id,
      counts: { evidence: insertedEvidence.length, observations: observationRows.length, roomScanSectors: roomScan?.sectors?.length ?? 0 },
    });
  } catch (error) {
    console.error("OVERHAUL persistence route error", error);
    return NextResponse.json({ error: "Could not persist this assessment." }, { status: 500 });
  }
}
