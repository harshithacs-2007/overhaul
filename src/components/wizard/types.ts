"use client";

import { DEMO_INPUT, DEMO_NOTES } from "@/lib/demo";
import type { WizardInput } from "@/lib/calculations/pipeline";
import type { ReportedIssue } from "@/lib/calculations/ranking";
import type { MaterialId } from "@/lib/calculations/materials";
import type { HVACSystemType, Zoning } from "@/lib/calculations/hvac";
import type { OccupancyProfile } from "@/lib/calculations/savings";

export const WIZARD_STEPS = [
  "Location",
  "Envelope",
  "HVAC",
  "Issues",
  "Review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export function emptyWizard(): WizardInput {
  return {
    locationLabel: "",
    latitude: 0,
    longitude: 0,
    floorAreaM2: 120,
    buildingType: "home",
    wallMaterialId: "brick_common",
    roofMaterialId: "concrete_roof",
    windowMaterialId: "single_pane_glass",
    hvacSystemType: "split_ac",
    capacityTons: 3,
    capacityUnit: "tons",
    capacityValue: 3,
    ageRange: "5-10",
    zoning: "single",
    ventilation: "natural",
    reportedIssues: [],
    energyRateINR: 8,
    hvacUnknown: false,
  };
}

export function loadDemo(): WizardInput {
  return { ...DEMO_INPUT };
}

export { DEMO_NOTES };

export type { WizardInput, ReportedIssue, MaterialId, HVACSystemType, Zoning, OccupancyProfile };
