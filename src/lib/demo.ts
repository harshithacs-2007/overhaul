import type { WizardInput } from "./calculations/pipeline";

/** One-click demo for live demos — matches Stage 0 spec */
export const DEMO_INPUT: WizardInput = {
  locationLabel: "Bengaluru, India",
  latitude: 12.9716,
  longitude: 77.5946,
  floorAreaM2: 150,
  buildingType: "office",
  wallMaterialId: "brick_common",
  roofMaterialId: "concrete_roof",
  windowMaterialId: "single_pane_glass",
  hvacSystemType: "split_ac",
  capacityTons: 5,
  capacityUnit: "tons",
  capacityValue: 5,
  ageRange: "5-10", // 10-year-old → mid of 5-10; flagged in review as ~10yr
  zoning: "single",
  ventilation: "mechanical",
  reportedIssues: ["high_bills"],
  energyRateINR: 8,
  hvacUnknown: false,
};

export const DEMO_NOTES =
  "Demo: 150 m² office, brick walls, single-pane windows, ~10-year-old 5-ton split AC, single zone, mechanical ventilation, high energy bills.";
