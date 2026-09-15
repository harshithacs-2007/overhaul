import { z } from "zod";

export const dataDomainSchema = z.enum([
  "climate",
  "buildings",
  "hvac",
  "equipment",
  "retrofit",
  "materials",
  "3d",
  "unknown",
]);

export const datasetFormatSchema = z.enum([
  "csv",
  "parquet",
  "xlsx",
  "netcdf",
  "json",
  "jsonl",
  "zip",
  "pdf",
  "other",
]);

export const datasetManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: dataDomainSchema,
  format: datasetFormatSchema,
  source: z.string().url().optional(),
  license: z.string().optional(),
  description: z.string().optional(),
  paths: z.array(z.string().min(1)).min(1),
  extracted: z.boolean(),
  variables: z.array(z.string().min(1)).optional(),
  units: z.record(z.string(), z.string()).optional(),
  timeCoverage: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  spatialCoverage: z.string().optional(),
  adapter: z.string().optional(),
  notes: z.array(z.string().min(1)).optional(),
});

export type DatasetManifestInput = z.infer<typeof datasetManifestSchema>;

export function parseDatasetManifest(value: unknown): DatasetManifestInput {
  return datasetManifestSchema.parse(value);
}
