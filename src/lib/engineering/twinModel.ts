export type TwinScope = "building" | "facility" | "equipment";

export type TwinPoint = { x: number; y: number };

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
  units: "m";
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
  const width = Number.isFinite(model.overall.widthM) && model.overall.widthM > 0 ? model.overall.widthM : 10;
  const depth = Number.isFinite(model.overall.depthM) && model.overall.depthM > 0 ? model.overall.depthM : 8;
  const height = Number.isFinite(model.overall.heightM) && model.overall.heightM > 0 ? model.overall.heightM : 3;
  return { width, depth, height };
}

export function sanitizeTwinModel(input: unknown): TwinModel | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<TwinModel>;
  if (raw.schemaVersion !== "overhaul.twin.v2") return null;
  if (raw.scope !== "building" && raw.scope !== "facility" && raw.scope !== "equipment") return null;
  const overall = raw.overall && typeof raw.overall === "object" ? raw.overall : null;
  if (!overall || !Number.isFinite(Number(overall.widthM)) || !Number.isFinite(Number(overall.depthM)) || !Number.isFinite(Number(overall.heightM))) return null;
  const finitePositive = (value: unknown, fallback: number) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const point = (value: unknown): TwinPoint | null => {
    if (!value || typeof value !== "object") return null;
    const pointValue = value as { x?: unknown; y?: unknown };
    return Number.isFinite(Number(pointValue.x)) && Number.isFinite(Number(pointValue.y)) ? { x: Number(pointValue.x), y: Number(pointValue.y) } : null;
  };
  const rooms = Array.isArray(raw.rooms) ? raw.rooms.slice(0, 80).map((room, index) => {
    if (!room || typeof room !== "object") return null;
    const value = room as Partial<TwinSpace>;
    return {
      id: String(value.id || `room-${index + 1}`), name: String(value.name || `Space ${index + 1}`).slice(0, 100),
      x: Number(value.x) || 0, y: Number(value.y) || 0,
      widthM: finitePositive(value.widthM, 1), depthM: finitePositive(value.depthM, 1), heightM: finitePositive(value.heightM, finitePositive(overall.heightM, 3)),
      source: value.source === "floorplan" || value.source === "user" ? value.source : "inferred",
      confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)),
    };
  }).filter(Boolean) as TwinSpace[] : [];
  const walls = Array.isArray(raw.walls) ? raw.walls.slice(0, 200).map((wall, index) => {
    if (!wall || typeof wall !== "object") return null;
    const value = wall as Partial<TwinWall>;
    const a = point(value.a), b = point(value.b);
    if (!a || !b) return null;
    return { id: String(value.id || `wall-${index + 1}`), a, b, thicknessM: finitePositive(value.thicknessM, 0.15), heightM: finitePositive(value.heightM, 2.8), source: value.source === "floorplan" || value.source === "user" ? value.source : "inferred", confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)) };
  }).filter(Boolean) as TwinWall[] : [];
  const openings = Array.isArray(raw.openings) ? raw.openings.slice(0, 120).map((opening, index) => {
    if (!opening || typeof opening !== "object") return null;
    const value = opening as Partial<TwinOpening>;
    if (!["door", "window", "opening"].includes(String(value.type))) return null;
    return { id: String(value.id || `opening-${index + 1}`), type: value.type as TwinOpening["type"], x: Number(value.x) || 0, y: Number(value.y) || 0, widthM: finitePositive(value.widthM, 0.9), wallId: value.wallId ? String(value.wallId) : undefined, source: "floorplan" as const, confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)) };
  }).filter(Boolean) as TwinOpening[] : [];
  const assets = Array.isArray(raw.assets) ? raw.assets.slice(0, 120).map((asset, index) => {
    if (!asset || typeof asset !== "object") return null;
    const value = asset as Partial<TwinAsset>;
    return { id: String(value.id || `asset-${index + 1}`), label: String(value.label || "Asset").slice(0, 100), className: String(value.className || "equipment").slice(0, 80), x: Number(value.x) || 0, y: Number(value.y) || 0, widthM: finitePositive(value.widthM, 0.8), depthM: finitePositive(value.depthM, 0.8), heightM: finitePositive(value.heightM, 1), rotationDeg: Number(value.rotationDeg) || 0, source: ["floorplan", "photo", "nameplate", "user"].includes(String(value.source)) ? value.source as TwinAsset["source"] : "inferred", evidenceId: value.evidenceId ? String(value.evidenceId) : undefined, confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)), observedState: value.observedState ? String(value.observedState).slice(0, 160) : undefined };
  }).filter(Boolean) as TwinAsset[] : [];
  return {
    schemaVersion: "overhaul.twin.v2", scope: raw.scope, title: String(raw.title || "OVERHAUL Twin"), className: String(raw.className || raw.scope), generatedAt: String(raw.generatedAt || new Date().toISOString()), geometryBasis: ["dimensioned-floorplan", "scaled-floorplan", "photo-layout", "parametric"].includes(String(raw.geometryBasis)) ? raw.geometryBasis as TwinModel["geometryBasis"] : "parametric", units: "m", overall: { widthM: finitePositive(overall.widthM, 10), depthM: finitePositive(overall.depthM, 8), heightM: finitePositive(overall.heightM, 3) }, rooms, walls, openings, assets, sourceEvidenceIds: Array.isArray(raw.sourceEvidenceIds) ? raw.sourceEvidenceIds.slice(0, 20).map(String) : [], confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)), warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 12).map(String) : [], nextEvidence: Array.isArray(raw.nextEvidence) ? raw.nextEvidence.slice(0, 8).map(String) : [],
  };
}
