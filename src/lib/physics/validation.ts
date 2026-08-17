import { z } from "zod";

const layerSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(120).optional(),
  thicknessM: z.number().gt(0).max(5),
  conductivityWmK: z.number().gt(0).max(500),
});

const surfaceSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["wall", "roof", "window", "door", "floor"]),
  areaM2: z.number().min(0).max(1_000_000),
  uValueWm2K: z.number().gt(0).max(20).optional(),
  layers: z.array(layerSchema).max(20).optional(),
  surfaceResistanceM2KW: z.number().min(0).max(2).optional(),
  orientationDeg: z.number().min(0).lt(360).optional(),
  shgc: z.number().min(0).max(1).optional(),
});

export const physicsRunInputSchema = z.object({
  indoorTempC: z.number().gt(-50).lt(60),
  outdoorTempC: z.number().gt(-80).lt(70),
  outdoorTempSource: z.string().min(1).max(500),
  surfaces: z.array(surfaceSchema).max(50),
  ventilation: z.object({
    mode: z.enum(["ach", "airflow_m3s", "unknown"]),
    ach: z.number().min(0).max(50).optional(),
    airflowM3s: z.number().min(0).max(500).optional(),
    kind: z.enum(["infiltration", "mechanical", "natural", "unknown"]).optional(),
  }),
  solar: z.object({
    incidentRadiationWm2: z.number().min(0).max(1500).optional(),
    windowAreaM2: z.number().min(0).max(100000).optional(),
    shgc: z.number().min(0).max(1).optional(),
  }),
  hvac: z.object({
    ratedCapacityKW: z.number().gt(0).max(50000).optional(),
    efficiencyMetric: z.string().max(40).optional(),
    efficiencyValue: z.number().gt(0).max(50).optional(),
    systemAgeYears: z.number().min(0).max(80).optional(),
    systemType: z.string().max(40).optional(),
  }),
  mode: z.enum(["cooling", "heating"]),
  volumeM3: z.number().gt(0).max(1e7).optional(),
});

export type PhysicsRunInputValidated = z.infer<typeof physicsRunInputSchema>;
