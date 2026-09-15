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

// Optional learned model payload. The application must remain fully functional when
// no trained artifact has been checked into the repository yet.
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
  };
}

export function predictRescastSurrogate(
  target: SurrogateTarget,
  features: Record<string, number>,
) {
  const model = runtimeModel?.targets[target];
  if (!model || !runtimeModel) return null;

  let missingFeatures = 0;
  const vector = runtimeModel.sourceFeatures.map((key, index) => {
    const raw = Number(features[key]);
    if (!Number.isFinite(raw)) {
      missingFeatures += 1;
      return 0;
    }
    return (raw - model.featureMean[index]) / model.featureScale[index];
  });

  const prediction = model.intercept + model.coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient * (vector[index] ?? 0),
    0,
  );
  const uncertaintyRatio = Math.min(1, missingFeatures / Math.max(runtimeModel.sourceFeatures.length, 1));
  const lower = prediction - model.targetStd * uncertaintyRatio;
  const upper = prediction + model.targetStd * uncertaintyRatio;

  return {
    value: prediction,
    target,
    modelR2: model.r2,
    rowsUsed: model.rowsUsed,
    trainingDataset: runtimeModel.trainingDataset,
    missingFeatures,
    uncertainty: missingFeatures ? { lower, upper, ratio: uncertaintyRatio } : null,
  };
}

/**
 * Convert a JSON-safe trained artifact into the runtime model without letting
 * malformed model payloads silently become engineering inputs.
 */
export function loadRescastModel(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RescastModel>;
  if (candidate.schemaVersion !== "1.0" || !Array.isArray(candidate.sourceFeatures) || !candidate.targets) return false;

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
    schemaVersion: "1.0",
    trainingDataset: candidate.trainingDataset,
    sourceRowsSampled: Number(candidate.sourceRowsSampled) || 0,
    sourceFeatures: candidate.sourceFeatures,
    method: typeof candidate.method === "string" ? candidate.method : "unknown",
    note: typeof candidate.note === "string" ? candidate.note : "",
    targets,
  };
  return true;
}
