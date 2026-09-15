import type { DatasetFormat, DataDomain, DatasetManifest } from "./types";

const EXTENSION_MAP: Record<string, DatasetFormat> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".parquet": "parquet",
  ".nc": "netcdf",
  ".json": "json",
  ".jsonl": "jsonl",
  ".zip": "zip",
  ".pdf": "pdf",
};

const DOMAIN_HINTS: Array<{ pattern: RegExp; domain: DataDomain }> = [
  { pattern: /(climate|power|weather|temperature|design.?conditions)/i, domain: "climate" },
  { pattern: /(rtu|ahu|ddahu|sdahu|fcu|chiller|boiler|hvac)/i, domain: "hvac" },
  { pattern: /(rescast|house|building|energy.?use)/i, domain: "buildings" },
  { pattern: /(remdb|retrofit)/i, domain: "retrofit" },
  { pattern: /(material|embodied|carbon)/i, domain: "materials" },
  { pattern: /(structured3d|objaverse|lvis|object.?paths|3d)/i, domain: "3d" },
];

export function inferDatasetFormat(path: string): DatasetFormat {
  const lower = path.toLowerCase();
  for (const [extension, format] of Object.entries(EXTENSION_MAP)) {
    if (lower.endsWith(extension)) return format;
  }
  return "other";
}

export function inferDatasetDomain(path: string): DataDomain {
  return DOMAIN_HINTS.find(({ pattern }) => pattern.test(path))?.domain ?? "unknown";
}

export function buildDatasetManifest(
  path: string,
  overrides: Partial<DatasetManifest> = {},
): DatasetManifest {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const baseId = fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    id: overrides.id ?? baseId,
    name: overrides.name ?? fileName,
    domain: overrides.domain ?? inferDatasetDomain(fileName),
    format: overrides.format ?? inferDatasetFormat(fileName),
    source: overrides.source,
    license: overrides.license,
    description: overrides.description,
    paths: overrides.paths ?? [path],
    extracted: overrides.extracted ?? false,
    variables: overrides.variables,
    units: overrides.units,
    timeCoverage: overrides.timeCoverage,
    spatialCoverage: overrides.spatialCoverage,
    adapter: overrides.adapter,
    notes: overrides.notes,
  };
}

export function classifyDatasetPaths(paths: string[]): DatasetManifest[] {
  return paths.map((path) => buildDatasetManifest(path));
}
