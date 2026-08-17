/**
 * Building model foundation — data-driven, no fabricated engineering values.
 */

export type BuildingElementKind = "roof" | "walls" | "windows" | "hvac";

export type KnowledgeState = "known" | "unknown" | "unset";

export interface BuildingElementField {
  key: string;
  label: string;
  state: KnowledgeState;
  /** Only set when user-provided — never invented */
  value?: string;
}

export interface BuildingElement {
  id: BuildingElementKind;
  label: string;
  selected: boolean;
  fields: BuildingElementField[];
  linkedEvidenceIds: string[];
}

export interface BuildingModel {
  id: string;
  label: string;
  elements: BuildingElement[];
  /** Manual progressive disclosure progress — no inferred engineering values */
  manual: {
    locationLabel?: string;
    latitude?: number;
    longitude?: number;
    floorAreaM2?: number;
    storeys?: number;
    wallMaterial?: string;
    roofMaterial?: string;
    windowType?: string;
    hvacType?: string;
    occupancy?: string;
  };
}

export function createEmptyBuildingModel(): BuildingModel {
  return {
    id: "building_1",
    label: "Building model",
    elements: [
      {
        id: "roof",
        label: "Roof",
        selected: false,
        linkedEvidenceIds: [],
        fields: [
          { key: "assembly", label: "Assembly", state: "unknown" },
          { key: "area", label: "Area", state: "unknown" },
          { key: "insulation", label: "Insulation", state: "unknown" },
        ],
      },
      {
        id: "walls",
        label: "Walls",
        selected: false,
        linkedEvidenceIds: [],
        fields: [
          { key: "construction", label: "Construction", state: "unknown" },
          { key: "area", label: "Area", state: "unknown" },
          { key: "orientation", label: "Orientation", state: "unknown" },
        ],
      },
      {
        id: "windows",
        label: "Windows",
        selected: false,
        linkedEvidenceIds: [],
        fields: [
          { key: "glazing", label: "Glazing", state: "unknown" },
          { key: "area", label: "Area", state: "unknown" },
          { key: "orientation", label: "Orientation", state: "unknown" },
        ],
      },
      {
        id: "hvac",
        label: "HVAC",
        selected: false,
        linkedEvidenceIds: [],
        fields: [
          { key: "equipment", label: "Equipment", state: "unknown" },
          { key: "capacity", label: "Capacity", state: "unknown" },
          { key: "age", label: "Age", state: "unknown" },
        ],
      },
    ],
    manual: {},
  };
}
