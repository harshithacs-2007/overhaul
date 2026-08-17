/**
 * External data source metadata — every external value carries this.
 */

export interface DataSourceMeta {
  source: string;
  provider: string;
  dataset: string;
  version: string;
  retrievedAt: string;
  effectiveAt?: string;
  geographicScope: string;
  originalUnit: string;
  normalizedUnit: string;
  quality?: "high" | "medium" | "low" | "unknown";
  confidence?: number;
  license?: string;
  attribution?: string;
}

export interface NormalizedDatum<T> {
  value: T;
  meta: DataSourceMeta;
}
