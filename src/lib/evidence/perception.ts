export type PerceptionEvidenceKind = "scan" | "photo" | "document";
export type PerceptionSubject = "building" | "facility" | "equipment";

export interface PerceptionEvidenceItem {
  id: string;
  kind: PerceptionEvidenceKind;
  name: string;
  type: string;
  size: number;
}

export interface PerceptionFieldRequirement {
  key: string;
  label: string;
  unit?: string;
  evidenceKinds: PerceptionEvidenceKind[];
  reason: string;
}

export interface EvidencePerceptionPlan {
  schemaVersion: "1.0";
  subject: PerceptionSubject;
  items: Array<{
    evidenceId: string;
    evidenceName: string;
    mode: "vision" | "ocr" | "document" | "scan";
    extract: string[];
    priority: "high" | "medium" | "low";
  }>;
  requiredFields: PerceptionFieldRequirement[];
  missingEvidence: string[];
}

const BUILDING_FIELDS: PerceptionFieldRequirement[] = [
  {
    key: "floor_area_m2",
    label: "Conditioned floor area",
    unit: "m²",
    evidenceKinds: ["document", "scan", "photo"],
    reason: "Needed to normalize envelope and load calculations.",
  },
  {
    key: "hvac_model",
    label: "HVAC model / nameplate",
    evidenceKinds: ["photo", "document"],
    reason: "Identifies equipment and enables verified capacity/efficiency lookup.",
  },
  {
    key: "hvac_capacity_kw",
    label: "HVAC rated capacity",
    unit: "kW",
    evidenceKinds: ["photo", "document"],
    reason: "Required before sizing and capacity headroom decisions.",
  },
  {
    key: "hvac_input_power_kw",
    label: "HVAC input power",
    unit: "kW",
    evidenceKinds: ["photo", "document"],
    reason: "Provides a directly comparable operating/equipment efficiency signal when documented.",
  },
];

const FACILITY_FIELDS: PerceptionFieldRequirement[] = [
  {
    key: "major_equipment_models",
    label: "Major equipment models",
    evidenceKinds: ["photo", "document", "scan"],
    reason: "Builds the facility asset graph and links equipment to energy flows.",
  },
  {
    key: "rated_capacity_kw",
    label: "Rated equipment capacity",
    unit: "kW",
    evidenceKinds: ["photo", "document"],
    reason: "Needed for capacity adequacy and utilization checks.",
  },
  {
    key: "operating_power_kw",
    label: "Operating power",
    unit: "kW",
    evidenceKinds: ["document", "scan", "photo"],
    reason: "Needed to compare actual operation against equipment reference behaviour.",
  },
];

const EQUIPMENT_FIELDS: PerceptionFieldRequirement[] = [
  {
    key: "model",
    label: "Equipment model",
    evidenceKinds: ["photo", "document"],
    reason: "Supports exact equipment family/reference matching.",
  },
  {
    key: "rated_capacity_kw",
    label: "Rated capacity",
    unit: "kW",
    evidenceKinds: ["photo", "document"],
    reason: "Defines the equipment capacity boundary for deterministic calculations.",
  },
  {
    key: "input_power_kw",
    label: "Rated/input power",
    unit: "kW",
    evidenceKinds: ["photo", "document"],
    reason: "Enables efficiency calculations when paired with capacity or delivered load.",
  },
  {
    key: "operating_measurement",
    label: "Operating measurement",
    evidenceKinds: ["document", "scan", "photo"],
    reason: "A nameplate alone cannot establish actual runtime performance or degradation.",
  },
];

function modeForKind(kind: PerceptionEvidenceKind, mimeType: string): EvidencePerceptionPlan["items"][number]["mode"] {
  if (kind === "scan") return "scan";
  if (mimeType.startsWith("image/")) return kind === "photo" ? "vision" : "scan";
  if (mimeType === "application/pdf" || mimeType.includes("document") || mimeType.includes("text")) {
    return "ocr";
  }
  return "document";
}

function fieldsForSubject(subject: PerceptionSubject): PerceptionFieldRequirement[] {
  if (subject === "building") return BUILDING_FIELDS;
  if (subject === "facility") return FACILITY_FIELDS;
  return EQUIPMENT_FIELDS;
}

export function buildEvidencePerceptionPlan(
  subject: PerceptionSubject,
  evidence: PerceptionEvidenceItem[],
): EvidencePerceptionPlan {
  const requirements = fieldsForSubject(subject);
  const items = evidence.map((item) => {
    const matchingKinds = requirements.filter((field) => field.evidenceKinds.includes(item.kind));
    const priority: "high" | "medium" | "low" = matchingKinds.some(
      (field) => field.key.includes("model") || field.key.includes("capacity"),
    )
      ? "high"
      : matchingKinds.length
        ? "medium"
        : "low";

    return {
      evidenceId: item.id,
      evidenceName: item.name,
      mode: modeForKind(item.kind, item.type),
      extract: [...new Set(matchingKinds.map((field) => field.key))],
      priority,
    };
  });

  const coveredKinds = new Set(evidence.map((item) => item.kind));
  const missingEvidence = requirements
    .filter((field) => !field.evidenceKinds.some((kind) => coveredKinds.has(kind)))
    .map((field) => `Collect ${field.label.toLowerCase()} evidence: ${field.reason}`);

  return {
    schemaVersion: "1.0",
    subject,
    items,
    requiredFields: requirements,
    missingEvidence: [...new Set(missingEvidence)].slice(0, 5),
  };
}
