/**
 * Provider/repository contracts — provider-independent knowledge layer.
 * Implementations may swap without rewriting core engineering model.
 */

import type { NormalizedDatum } from "./sources";

export interface ClimateQuery {
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface EnvelopeAssemblyRecord {
  id: string;
  label: string;
  category: "wall" | "roof" | "floor" | "window" | "door";
  /** Optional catalog U — only when sourced; never invented at call site */
  uValueWm2K?: NormalizedDatum<number>;
}

export interface MaterialRecord {
  id: string;
  label: string;
  lambdaWmK?: NormalizedDatum<number>;
  densityKgM3?: NormalizedDatum<number>;
}

export interface HvacCatalogRecord {
  id: string;
  label: string;
  systemFamily: string;
  typicalEfficiencyMetric?: string;
}

export interface TariffRecord {
  id: string;
  label: string;
  geographicScope: string;
  ratePerKWh?: NormalizedDatum<number>;
  currency: string;
}

export interface RetrofitCostRecord {
  id: string;
  actionFamily: string;
  geographicScope: string;
  unitCost?: NormalizedDatum<number>;
  currency: string;
  unit: string;
}

export interface EmbodiedCarbonRecord {
  id: string;
  materialId: string;
  coefficient?: NormalizedDatum<number>;
  unit: string;
}

export interface EngineeringReferenceRecord {
  id: string;
  title: string;
  citation: string;
  topic: string;
}

export interface ClimateProvider {
  readonly name: string;
  getClimateContext(query: ClimateQuery): Promise<import("./climate").ClimateContext>;
}

export interface EnvelopeAssemblyRepository {
  list(category?: EnvelopeAssemblyRecord["category"]): Promise<EnvelopeAssemblyRecord[]>;
  get(id: string): Promise<EnvelopeAssemblyRecord | null>;
}

export interface MaterialRepository {
  list(): Promise<MaterialRecord[]>;
  get(id: string): Promise<MaterialRecord | null>;
}

export interface HvacCatalogRepository {
  list(): Promise<HvacCatalogRecord[]>;
  get(id: string): Promise<HvacCatalogRecord | null>;
}

export interface EnergyTariffRepository {
  findByScope(geographicScope: string): Promise<TariffRecord[]>;
}

export interface RetrofitCostRepository {
  findByScope(geographicScope: string): Promise<RetrofitCostRecord[]>;
}

export interface EmbodiedCarbonRepository {
  getByMaterial(materialId: string): Promise<EmbodiedCarbonRecord | null>;
}

export interface EngineeringReferenceRepository {
  listByTopic(topic: string): Promise<EngineeringReferenceRecord[]>;
}

/** Aggregate knowledge layer registry */
export interface EngineeringKnowledgeLayer {
  climate: ClimateProvider;
  assemblies: EnvelopeAssemblyRepository;
  materials: MaterialRepository;
  hvacCatalog: HvacCatalogRepository;
  tariffs: EnergyTariffRepository;
  retrofitCosts: RetrofitCostRepository;
  embodiedCarbon: EmbodiedCarbonRepository;
  references: EngineeringReferenceRepository;
}
