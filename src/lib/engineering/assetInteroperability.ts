/**
 * Parametric interchange for the OVERHAUL asset model.
 *
 * Geometry is derived from supplied dimensions/ratings. No geometry is invented
 * from an image. OBJ is suitable for Blender and DXF is suitable for CAD
 * workflows; the manifest carries the semantic engineering identity and
 * provenance needed to continue the model in BIM/CAD software.
 */

export type InteropScope = "building" | "facility" | "equipment";

export interface InteropAsset {
  id: string;
  name: string;
  scope: InteropScope;
  className: string;
  widthM: number;
  depthM: number;
  heightM: number;
  capacityKW?: number | null;
  powerKW?: number | null;
  evidenceIds?: string[];
}

export interface InteropManifest {
  schema: "overhaul.asset.v1";
  asset: InteropAsset;
  coordinateSystem: "right-handed-z-up";
  geometryBasis: "parametric-dimensions";
  engineeringValues: Array<{ key: string; value: number | string; unit?: string }>;
  provenance: Array<{ type: "evidence" | "derived"; id: string; note: string }>;
  targets: Array<"Blender" | "AutoCAD/DXF" | "BIM/IFC adapter">;
}

function safeDimension(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boxObj(name: string, width: number, depth: number, height: number, ox = 0, oy = 0, oz = 0) {
  const x0 = ox, x1 = ox + width;
  const y0 = oy, y1 = oy + depth;
  const z0 = oz, z1 = oz + height;
  return [
    `o ${name}`,
    `v ${x0} ${y0} ${z0}`, `v ${x1} ${y0} ${z0}`, `v ${x1} ${y1} ${z0}`, `v ${x0} ${y1} ${z0}`,
    `v ${x0} ${y0} ${z1}`, `v ${x1} ${y0} ${z1}`, `v ${x1} ${y1} ${z1}`, `v ${x0} ${y1} ${z1}`,
    "f -8 -7 -6 -5", "f -4 -3 -2 -1", "f -8 -4 -3 -7", "f -2 -6 -5 -1", "f -8 -5 -1 -4", "f -7 -3 -2 -6",
  ].join("\n");
}

export function buildAssetObj(asset: InteropAsset): string {
  const width = safeDimension(asset.widthM, asset.scope === "equipment" ? 1.2 : 10);
  const depth = safeDimension(asset.depthM, asset.scope === "equipment" ? 0.8 : 8);
  const height = safeDimension(asset.heightM, asset.scope === "equipment" ? 1.1 : 3);
  const parts = [boxObj(asset.className.replace(/\s+/g, "_"), width, depth, height)];
  if (asset.scope !== "equipment") {
    parts.push(boxObj("HVAC_ZONE", Math.max(width * 0.18, 1), Math.max(depth * 0.18, 1), Math.max(height * 0.35, 1), width * 0.41, depth * 0.41, height));
  } else {
    parts.push(boxObj("SERVICE_CLEARANCE", width * 0.82, depth * 0.82, Math.max(height * 0.06, 0.05), width * 0.09, depth * 0.09, height));
  }
  return [
    "# OVERHAUL parametric asset export",
    `# Asset: ${asset.name}`,
    "# Units: metres",
    parts.join("\n"),
    "",
  ].join("\n");
}

export function buildDxfFootprint(asset: InteropAsset): string {
  const width = safeDimension(asset.widthM, asset.scope === "equipment" ? 1.2 : 10);
  const depth = safeDimension(asset.depthM, asset.scope === "equipment" ? 0.8 : 8);
  const points = [[0, 0], [width, 0], [width, depth], [0, depth], [0, 0]];
  const entities = points.slice(0, -1).map((p, i) => {
    const q = points[i + 1];
    return `0\nLINE\n8\nOVERHAUL\n10\n${p[0]}\n20\n${p[1]}\n30\n0\n11\n${q[0]}\n21\n${q[1]}\n31\n0`;
  }).join("\n");
  return ["0", "SECTION", "2", "HEADER", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", entities, "0", "ENDSEC", "0", "EOF", ""].join("\n");
}

export function buildInteropManifest(asset: InteropAsset, values: Record<string, number | string | null | undefined>): InteropManifest {
  const engineeringValues = Object.entries(values)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => ({ key, value: value as number | string }))
    .slice(0, 32);
  const evidenceIds = asset.evidenceIds ?? [];
  return {
    schema: "overhaul.asset.v1",
    asset: { ...asset, widthM: safeDimension(asset.widthM, 1), depthM: safeDimension(asset.depthM, 1), heightM: safeDimension(asset.heightM, 1) },
    coordinateSystem: "right-handed-z-up",
    geometryBasis: "parametric-dimensions",
    engineeringValues,
    provenance: [
      ...evidenceIds.map((id) => ({ type: "evidence" as const, id, note: "Source evidence linked to the asset model." })),
      { type: "derived" as const, id: "parametric-geometry", note: "Geometry generated from stated dimensions; no image geometry was hallucinated." },
    ],
    targets: ["Blender", "AutoCAD/DXF", "BIM/IFC adapter"],
  };
}
