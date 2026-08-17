/**
 * EngineeringReadyModel — stable Phase 4 intake contract.
 */

import type { ResolvedLocation, ClimateContext } from "./climate";
import type {
  BuildingIdentity,
  EnvelopeModel,
  GeometryModel,
} from "./building";
import {
  emptyBuildingIdentity,
  emptyEnvelope,
  emptyGeometry,
} from "./building";
import type { HvacModel } from "./hvac";
import { emptyHvacModel } from "./hvac";
import type { OperatingProfile } from "./operating";
import { emptyOperatingProfile } from "./operating";
import type { ProvenanceRecord } from "./provenance";

export interface EvidenceReference {
  evidenceId: string;
  /** Property path supported by this evidence, e.g. hvac.systems[0].systemType */
  supportsProperty?: string;
  targetId?: string;
  verificationState: "unreviewed" | "needs_review" | "confirmed" | "rejected";
  note?: string;
}

export interface AssumptionEntry {
  id: string;
  statement: string;
  provenance: ProvenanceRecord;
}

export interface UnknownEntry {
  path: string;
  label: string;
}

export interface EngineeringReadyModel {
  id: string;
  version: "phase3";
  updatedAt: string;
  location: ResolvedLocation | null;
  climate: ClimateContext | null;
  building: BuildingIdentity;
  geometry: GeometryModel;
  envelope: EnvelopeModel;
  hvac: HvacModel;
  operating: OperatingProfile;
  evidenceReferences: EvidenceReference[];
  dataProvenance: ProvenanceRecord[];
  assumptions: AssumptionEntry[];
  unknowns: UnknownEntry[];
}

export function createEmptyEngineeringModel(id = "eng_1"): EngineeringReadyModel {
  return {
    id,
    version: "phase3",
    updatedAt: new Date().toISOString(),
    location: null,
    climate: null,
    building: emptyBuildingIdentity(),
    geometry: emptyGeometry(),
    envelope: emptyEnvelope(),
    hvac: emptyHvacModel(),
    operating: emptyOperatingProfile(),
    evidenceReferences: [],
    dataProvenance: [],
    assumptions: [],
    unknowns: [],
  };
}

/** Collect UNKNOWN paths for review UI — never fills values */
export function collectUnknowns(model: EngineeringReadyModel): UnknownEntry[] {
  const out: UnknownEntry[] = [];
  const check = (path: string, label: string, kind: string) => {
    if (kind === "UNKNOWN") out.push({ path, label });
  };
  check("building.type", "Building type", model.building.type.provenance.kind);
  check("building.floorAreaM2", "Floor area", model.building.floorAreaM2.provenance.kind);
  check("building.floors", "Floors", model.building.floors.provenance.kind);
  for (const s of model.envelope.surfaces) {
    check(`envelope.${s.id}.materialNotes`, `${s.kind} material`, s.materialNotes.provenance.kind);
  }
  for (const h of model.hvac.systems) {
    check(`hvac.${h.id}.systemType`, "HVAC type", h.systemType.provenance.kind);
  }
  if (!model.location) out.push({ path: "location", label: "Location" });
  if (!model.climate) out.push({ path: "climate", label: "Climate context" });
  return out;
}
