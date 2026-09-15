export type SurrogateTarget = "hvac_load_kw" | "electricity_total_kw" | "total_load_kw";

type ModelTarget = {
  sourceColumn: string;
  rowsUsed: number;
  splitRows?: { train: number; validation: number; test: number };
  r2: number;
  validationMetrics?: { mae: number; rmse: number; r2: number };
  testMetrics?: { mae: number; rmse: number; r2: number };
  meanBaselineTestMetrics?: { mae: number; rmse: number; r2: number };
  selectedLambda?: number;
  testAbsoluteResidualP50?: number;
  testAbsoluteResidualP90?: number;
  testFeatureDistanceP90?: number;
  medianInputMissingFractionTrain?: number;
  featureMean: number[];
  featureScale: number[];
  coefficients: number[];
  intercept: number;
  targetMean: number;
  targetStd: number;
  screeningUseOnly?: boolean;
  unitStatus?: string;
};

type RescastModel = {
  schemaVersion: "1.0" | "1.1";
  trainingDataset: string;
  sourceRowsSampled: number;
  sourceFeatures: string[];
  method: string;
  note?: string;
  screeningDisclaimer?: string;
  targets: Partial<Record<SurrogateTarget, ModelTarget>>;
};

let runtimeModel: RescastModel | null = null;

export function registerRescastModel(model: RescastModel | null) {
  runtimeModel = model;
}

export function rescastSurrogateStatus() {
  return {
    available: Boolean(runtimeModel),
    trainingDataset: runtimeModel?.trainingDataset ?? null,
    sourceRowsSampled: runtimeModel?.sourceRowsSampled ?? null,
    method: runtimeModel?.method ?? null,
    targets: Object.keys(runtimeModel?.targets ?? {}),
    screeningOnly: true,
  };
}

export function predictRescastSurrogate(target: SurrogateTarget, features: Record<string, number>) {
  const model = runtimeModel?.targets[target];
  if (!model || !runtimeModel) return null;

  let missingFeatures = 0;
  const vector = runtimeModel.sourceFeatures.map((key, index) => {
    const raw = Number(features[key]);
    if (!Number.isFinite(raw)) {
      missingFeatures += 1;
      return 0;
    }
    return (raw - model.featureMean[index]) / (model.featureScale[index] || 1);
  });

  const prediction = model.intercept + model.coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient * (vector[index] ?? 0),
    0,
  );
  const missingRatio = missingFeatures / Math.max(runtimeModel.sourceFeatures.length, 1);
  const residualP90 = model.testAbsoluteResidualP90 ?? model.targetStd;
  const uncertaintyRadius = residualP90 * Math.min(1, Math.max(0.1, missingRatio));

  return {
    value: prediction,
    target,
    modelR2: model.testMetrics?.r2 ?? model.r2,
    rowsUsed: model.rowsUsed,
    trainingDataset: runtimeModel.trainingDataset,
    missingFeatures,
    applicability: missingFeatures === 0 ? "complete_features" : "partial_features",
    uncertainty: {
      lower: prediction - uncertaintyRadius,
      upper: prediction + uncertaintyRadius,
      radius: uncertaintyRadius,
      basis: "test residual P90 scaled for missing runtime features; screening only",
    },
    engineeringAuthority: "deterministic_physics",
  };
}

/**
 * Load a JSON-safe trained artifact. Invalid shapes or incompatible vector lengths
 * are rejected rather than becoming silent engineering inputs.
 */
export function loadRescastModel(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RescastModel>;
  if ((candidate.schemaVersion !== "1.0" && candidate.schemaVersion !== "1.1") || !Array.isArray(candidate.sourceFeatures) || !candidate.targets) return false;

  const targets: Partial<Record<SurrogateTarget, ModelTarget>> = {};
  for (const key of ["hvac_load_kw", "electricity_total_kw", "total_load_kw"] as const) {
    const target = candidate.targets[key];
    if (!target || typeof target !== "object") continue;
    if (!Array.isArray(target.featureMean) || !Array.isArray(target.featureScale) || !Array.isArray(target.coefficients)) continue;
    if (target.featureMean.length !== candidate.sourceFeatures.length || target.featureScale.length !== candidate.sourceFeatures.length || target.coefficients.length !== candidate.sourceFeatures.length) continue;
    if (![target.r2, target.rowsUsed, target.intercept, target.targetMean, target.targetStd].every((n) => Number.isFinite(n))) continue;
    if (![...target.featureMean, ...target.featureScale, ...target.coefficients].every((n) => Number.isFinite(n))) continue;
    targets[key] = target as ModelTarget;
  }

  if (!Object.keys(targets).length || typeof candidate.trainingDataset !== "string") return false;
  runtimeModel = {
    schemaVersion: candidate.schemaVersion,
    trainingDataset: candidate.trainingDataset,
    sourceRowsSampled: Number(candidate.sourceRowsSampled) || 0,
    sourceFeatures: candidate.sourceFeatures,
    method: typeof candidate.method === "string" ? candidate.method : "unknown",
    note: typeof candidate.note === "string" ? candidate.note : "",
    screeningDisclaimer: typeof candidate.screeningDisclaimer === "string" ? candidate.screeningDisclaimer : "screening only",
    targets,
  };
  return true;
}
