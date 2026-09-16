export type TwinScope = "building" | "facility" | "equipment";
export type TwinPoint = { x: number; y: number };
export type TwinGeometryStatus = "verified-metric" | "scaled-plan" | "relative-only";
export type TwinUnits = "m" | "scene";

export type TwinWall = {
  id: string;
  a: TwinPoint;
  b: TwinPoint;
  thicknessM: number;
  heightM: number;
  source: "floorplan" | "user" | "inferred";
  confidence: number;
};

export type TwinSpace = {
  id: string;
  name: string;
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  heightM: number;
  source: "floorplan" | "user" | "inferred";
  confidence: number;
};

export type TwinOpening = {
  id: string;
  type: "door" | "window" | "opening";
  x: number;
  y: number;
  widthM: number;
  wallId?: string;
  source: "floorplan";
  confidence: number;
};

export type TwinAsset = {
  id: string;
  label: string;
  className: string;
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  heightM: number;
  rotationDeg: number;
  source: "floorplan" | "photo" | "nameplate" | "user" | "inferred";
  evidenceId?: string;
  confidence: number;
  observedState?: string;
};

export type TwinModel = {
  schemaVersion: "overhaul.twin.v2";
  scope: TwinScope;
  title: string;
  className: string;
  generatedAt: string;
  geometryBasis: "dimensioned-floorplan" | "scaled-floorplan" | "photo-layout" | "parametric";
  geometryStatus: TwinGeometryStatus;
  units: TwinUnits;
  overall: { widthM: number; depthM: number; heightM: number };
  rooms: TwinSpace[];
  walls: TwinWall[];
  openings: TwinOpening[];
  assets: TwinAsset[];
  sourceEvidenceIds: string[];
  confidence: number;
  warnings: string[];
  nextEvidence: string[];
};

export function bounds(model: TwinModel) {
  return { width: model.overall.widthM, depth: model.overall.depthM, height: model.overall.heightM };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}
function point(value: unknown): TwinPoint | null {
  if (!value || typeof value !== "object") return null;
  const p = value as { x?: unknown; y?: unknown };
  return finite(p.x) && finite(p.y) ? { x: Number(p.x), y: Number(p.y) } : null;
}
function confidence(value: unknown) {
  return finite(value) ? Math.max(0, Math.min(1, Number(value))) : 0;
}

export function sanitizeTwinModel(input: unknown): TwinModel | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<TwinModel>;
  if (raw.schemaVersion !== "overhaul.twin.v2") return null;
  if (!["building", "facility", "equipment"].includes(String(raw.scope))) return null;
  if (!["dimensioned-floorplan", "scaled-floorplan", "photo-layout", "parametric"].includes(String(raw.geometryBasis))) return null;
  if (!["verified-metric", "scaled-plan", "relative-only"].includes(String(raw.geometryStatus))) return null;
  if (!["m", "scene"].includes(String(raw.units))) return null;
  const overall = raw.overall;
  if (!overall || !positive(overall.widthM) || !positive(overall.depthM) || !positive(overall.heightM)) return null;
  if (raw.units === "m" && raw.geometryStatus !== "verified-metric") return null;
  if (raw.geometryStatus === "verified-metric" && raw.units !== "m") return null;

  const rooms: TwinSpace[] = [];
  for (const [index, room] of (Array.isArray(raw.rooms) ? raw.rooms.slice(0, 80) : []).entries()) {
    if (!room || typeof room !== "object") continue;
    const value = room as Partial<TwinSpace>;
    if (!positive(value.widthM) || !positive(value.depthM) || !positive(value.heightM) || !finite(value.x) || !finite(value.y)) continue;
    rooms.push({ id: String(value.id || `room-${index + 1}`), name: String(value.name || `Space ${index + 1}`).slice(0, 100), x: Number(value.x), y: Number(value.y), widthM: Number(value.widthM), depthM: Number(value.depthM), heightM: Number(value.heightM), source: value.source === "floorplan" || value.source === "user" || value.source === "inferred" ? value.source : "inferred", confidence: confidence(value.confidence) });
  }

  const walls: TwinWall[] = [];
  for (const [index, wall] of (Array.isArray(raw.walls) ? raw.walls.slice(0, 200) : []).entries()) {
    if (!wall || typeof wall !== "object") continue;
    const value = wall as Partial<TwinWall>;
    const a = point(value.a), b = point(value.b);
    if (!a || !b || !positive(value.thicknessM) || !positive(value.heightM)) continue;
    walls.push({ id: String(value.id || `wall-${index + 1}`), a, b, thicknessM: Number(value.thicknessM), heightM: Number(value.heightM), source: value.source === "floorplan" || value.source === "user" || value.source === "inferred" ? value.source : "inferred", confidence: confidence(value.confidence) });
  }

  const openings: TwinOpening[] = [];
  for (const [index, opening] of (Array.isArray(raw.openings) ? raw.openings.slice(0, 120) : []).entries()) {
    if (!opening || typeof opening !== "object") continue;
    const value = opening as Partial<TwinOpening>;
    if (!["door", "window", "opening"].includes(String(value.type)) || !positive(value.widthM) || !finite(value.x) || !finite(value.y)) continue;
    openings.push({ id: String(value.id || `opening-${index + 1}`), type: value.type as TwinOpening["type"], x: Number(value.x), y: Number(value.y), widthM: Number(value.widthM), wallId: value.wallId ? String(value.wallId) : undefined, source: "floorplan", confidence: confidence(value.confidence) });
  }

  const assets: TwinAsset[] = [];
  for (const [index, asset] of (Array.isArray(raw.assets) ? raw.assets.slice(0, 120) : []).entries()) {
    if (!asset || typeof asset !== "object") continue;
    const value = asset as Partial<TwinAsset>;
    if (!positive(value.widthM) || !positive(value.depthM) || !positive(value.heightM) || !finite(value.x) || !finite(value.y)) continue;
    assets.push({ id: String(value.id || `asset-${index + 1}`), label: String(value.label || "Asset").slice(0, 100), className: String(value.className || "equipment").slice(0, 80), x: Number(value.x), y: Number(value.y), widthM: Number(value.widthM), depthM: Number(value.depthM), heightM: Number(value.heightM), rotationDeg: finite(value.rotationDeg) ? Number(value.rotationDeg) : 0, source: ["floorplan", "photo", "nameplate", "user", "inferred"].includes(String(value.source)) ? value.source as TwinAsset["source"] : "inferred", evidenceId: value.evidenceId ? String(value.evidenceId) : undefined, confidence: confidence(value.confidence), observedState: value.observedState ? String(value.observedState).slice(0, 160) : undefined });
  }

  const twin: TwinModel = { schemaVersion: "overhaul.twin.v2", scope: raw.scope as TwinScope, title: String(raw.title || "OVERHAUL Twin"), className: String(raw.className || raw.scope), generatedAt: String(raw.generatedAt || new Date().toISOString()), geometryBasis: raw.geometryBasis as TwinModel["geometryBasis"], geometryStatus: raw.geometryStatus as TwinGeometryStatus, units: raw.units as TwinUnits, overall: { widthM: Number(overall.widthM), depthM: Number(overall.depthM), heightM: Number(overall.heightM) }, rooms, walls, openings, assets, sourceEvidenceIds: Array.isArray(raw.sourceEvidenceIds) ? raw.sourceEvidenceIds.slice(0, 40).map(String) : [], confidence: confidence(raw.confidence), warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 20).map(String) : [], nextEvidence: Array.isArray(raw.nextEvidence) ? raw.nextEvidence.slice(0, 12).map(String) : [] };
  if (!twin.rooms.length && !twin.walls.length && !twin.assets.length) return null;
  return twin;
}
