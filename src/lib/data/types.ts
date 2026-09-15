export const DATA_DOMAINS = [
  "climate",
  "buildings",
  "hvac",
  "equipment",
  "retrofit",
  "materials",
  "3d",
  "unknown",
] as const;

export type DataDomain = (typeof DATA_DOMAINS)[number];

export type DatasetFormat = "csv" | "parquet" | "xlsx" | "netcdf" | "json" | "jsonl" | "zip" | "pdf" | "other";

export interface DatasetManifest {
  id: string;
  name: string;
  domain: DataDomain;
  format: DatasetFormat;
  source?: string;
  license?: string;
  description?: string;
  paths: string[];
  extracted: boolean;
  variables?: string[];
  units?: Record<string, string>;
  timeCoverage?: {
    start?: string;
    end?: string;
  };
  spatialCoverage?: string;
  adapter?: string;
  notes?: string[];
}

export interface NormalizedRecord {
  datasetId: string;
  sourceRow?: number;
  timestamp?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    region?: string;
  };
  subjectType?: "building" | "facility" | "equipment" | "material" | "climate";
  variables: Record<string, number | string | boolean | null>;
  provenance: {
    sourcePath: string;
    sourceField?: string;
    confidence: "measured" | "provided" | "inferred" | "derived";
  }[];
}
