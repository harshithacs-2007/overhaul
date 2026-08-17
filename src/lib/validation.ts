import { z } from "zod";

export const wizardInputSchema = z.object({
  locationLabel: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  floorAreaM2: z.number().min(20).max(20000),
  buildingType: z.enum(["home", "office", "mixed"]),
  wallMaterialId: z.enum([
    "brick_common",
    "brick_engineering",
    "concrete_dense",
    "concrete_lightweight",
  ]),
  roofMaterialId: z.enum([
    "metal_roof",
    "concrete_roof",
    "tile_roof",
    "insulated_roof",
  ]),
  windowMaterialId: z.enum([
    "single_pane_glass",
    "double_pane_glass",
    "triple_pane_glass",
  ]),
  hvacSystemType: z.enum([
    "split_ac",
    "heat_pump",
    "packaged_rtu",
    "vrf",
    "central_chiller",
    "dont_know",
  ]),
  capacityTons: z.number().min(0.5).max(100).optional().default(3),
  capacityUnit: z.enum(["tons", "kW"]),
  capacityValue: z.number().min(0.5).max(350),
  ageRange: z.enum(["<5", "5-10", "10-15", "15+"]),
  zoning: z.enum(["single", "multi"]),
  ventilation: z.enum(["mechanical", "natural"]),
  reportedIssues: z.array(
    z.enum(["uneven_temp", "high_bills", "frequent_cycling", "poor_airflow"])
  ),
  energyRateINR: z.number().min(1).max(50),
  hvacUnknown: z.boolean(),
});

export type WizardInputValidated = z.infer<typeof wizardInputSchema>;
