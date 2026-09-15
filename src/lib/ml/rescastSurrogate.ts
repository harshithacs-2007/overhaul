export type SurrogateTarget = "hvac_load_kw" | "electricity_total_kw" | "total_load_kw";

type ModelTarget = {
  sourceColumn: string;
  rowsUsed: number;
  r2: number;
  featureMean: number[];
  featureScale: number[];
  coefficients: number[];
  intercept: number;
  targetMean: number;
  targetStd: number;
};

type RescastModel = {
  schemaVersion: "1.0";
  trainingDataset: string;
  sourceRowsSampled: number;
  sourceFeatures: string[];
  method: string;
  note: string;
  targets: Partial<Record<SurrogateTarget, ModelTarget>>;
};

const runtimeModel: RescastModel | null = null;

export function rescastSurrogateStatus() {
  return {
    available: Boolean(runtimeModel),
    trainingDataset: runtimeModel?.trainingDataset ?? null,
    method: runtimeModel?.method ?? null,
    targets: Object.keys(runtimeModel?.targets ?? {}),
  };
}

export function predictRescastSurrogate(target: SurrogateTarget, features: Record<string, number>) {
  const model = runtimeModel?.targets[target];
  if (!model) return null;
  const vector = runtimeModel?.sourceFeatures.map((key, index) => {
    const raw = Number(features[key]);
    const value = Number.isFinite(raw) ? raw : model.featureMean[index];
    return (value - model.featureMean[index]) / model.featureScale[index];
  }) ?? [];
  const standardizedPrediction = model.intercept + model.coefficients.reduce((sum, coefficient, index) => sum + coefficient * (vector[index] ?? 0), 0);
  return {
    value: standardizedPrediction,
    target,
    modelR2: model.r2,
    rowsUsed: model.rowsUsed,
    trainingDataset: runtimeModel?.trainingDataset ?? null,
  };
}
