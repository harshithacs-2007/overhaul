import { z } from "zod";

export const evidenceExtractionSchema = z.object({
  evidenceType: z.enum([
    "equipment_nameplate",
    "equipment",
    "building_exterior",
    "building_interior",
    "mechanical_room",
    "floorplan",
    "energy_bill",
    "technical_document",
    "other",
  ]),
  rawText: z.string(),
  observations: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      numericValue: z.number().finite().nullable(),
      unit: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      sourceText: z.string(),
      notes: z.string(),
    })
  ),
  visibleAssets: z.array(z.string()),
  warnings: z.array(z.string()),
  nextEvidence: z.array(z.string()),
});

export type EvidenceExtraction = z.infer<typeof evidenceExtractionSchema>;

export type EvidenceExtractionResponse = EvidenceExtraction & {
  evidenceId: string;
  filename: string;
  mimeType: string;
  model: string;
};

export function sanitizeEvidenceExtraction(
  extraction: EvidenceExtraction,
): EvidenceExtraction {
  return {
    ...extraction,
    rawText: extraction.rawText.trim(),
    observations: extraction.observations
      .map((observation) => ({
        ...observation,
        field: observation.field.trim(),
        value: observation.value.trim(),
        sourceText: observation.sourceText.trim(),
        notes: observation.notes.trim(),
        confidence: Math.max(0, Math.min(1, observation.confidence)),
      }))
      .filter((observation) => observation.field && observation.value),
    visibleAssets: extraction.visibleAssets.map((value) => value.trim()).filter(Boolean),
    warnings: extraction.warnings.map((value) => value.trim()).filter(Boolean),
    nextEvidence: extraction.nextEvidence.map((value) => value.trim()).filter(Boolean),
  };
}

export const ENGINEERING_FIELD_HINTS = [
  "manufacturer",
  "model_number",
  "serial_number",
  "rated_capacity",
  "capacity_unit",
  "input_power_kw",
  "efficiency",
  "cop",
  "eer",
  "refrigerant",
  "voltage",
  "current_a",
  "airflow",
  "flow_rate",
  "flow_rate_unit",
  "temperature",
  "temperature_unit",
  "setpoint",
  "energy_kwh",
  "demand_kw",
  "billing_period",
  "location",
  "installation_date",
] as const;
