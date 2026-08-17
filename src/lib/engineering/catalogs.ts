/** In-memory / empty catalog repositories — extensible without rewriting core */

import type {
  EmbodiedCarbonRepository,
  EnergyTariffRepository,
  EngineeringReferenceRepository,
  EnvelopeAssemblyRepository,
  HvacCatalogRepository,
  MaterialRepository,
  RetrofitCostRepository,
  EnvelopeAssemblyRecord,
  MaterialRecord,
  HvacCatalogRecord,
} from "./providers";

const ASSEMBLIES: EnvelopeAssemblyRecord[] = [
  { id: "wall_brick_common", label: "Brick common (catalog id only)", category: "wall" },
  { id: "wall_concrete_dense", label: "Concrete dense", category: "wall" },
  { id: "roof_concrete", label: "Concrete roof deck", category: "roof" },
  { id: "window_single", label: "Single glazing", category: "window" },
  { id: "window_double", label: "Double glazing", category: "window" },
];

const MATERIALS: MaterialRecord[] = [
  { id: "brick_common", label: "Brick (common)" },
  { id: "rock_wool", label: "Rock wool" },
  { id: "xps", label: "XPS" },
];

const HVAC: HvacCatalogRecord[] = [
  { id: "split_ac", label: "Split AC", systemFamily: "dx_split" },
  { id: "heat_pump", label: "Heat pump", systemFamily: "heat_pump" },
  { id: "vrf", label: "VRF", systemFamily: "vrf" },
  { id: "packaged_rtu", label: "Packaged RTU", systemFamily: "rtu" },
  { id: "central_chiller", label: "Central chiller", systemFamily: "chiller" },
];

export class StaticEnvelopeAssemblyRepository implements EnvelopeAssemblyRepository {
  async list(category?: EnvelopeAssemblyRecord["category"]) {
    return category ? ASSEMBLIES.filter((a) => a.category === category) : ASSEMBLIES;
  }
  async get(id: string) {
    return ASSEMBLIES.find((a) => a.id === id) ?? null;
  }
}

export class StaticMaterialRepository implements MaterialRepository {
  async list() {
    return MATERIALS;
  }
  async get(id: string) {
    return MATERIALS.find((m) => m.id === id) ?? null;
  }
}

export class StaticHvacCatalogRepository implements HvacCatalogRepository {
  async list() {
    return HVAC;
  }
  async get(id: string) {
    return HVAC.find((h) => h.id === id) ?? null;
  }
}

/** Empty tariff/cost/carbon — no fabricated rates */
export class EmptyTariffRepository implements EnergyTariffRepository {
  async findByScope() {
    return [];
  }
}

export class EmptyRetrofitCostRepository implements RetrofitCostRepository {
  async findByScope() {
    return [];
  }
}

export class EmptyEmbodiedCarbonRepository implements EmbodiedCarbonRepository {
  async getByMaterial() {
    return null;
  }
}

export class StaticReferenceRepository implements EngineeringReferenceRepository {
  async listByTopic(topic: string) {
    return [
      {
        id: "ref_iso6946",
        title: "ISO 6946 — Building components thermal resistance",
        citation: "ISO 6946",
        topic: "envelope",
      },
      {
        id: "ref_ashrae_fundamentals",
        title: "ASHRAE Handbook — Fundamentals",
        citation: "ASHRAE Fundamentals",
        topic: "climate",
      },
    ].filter((r) => r.topic === topic || topic === "all");
  }
}
