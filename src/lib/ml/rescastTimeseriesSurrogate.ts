export type RescastTimeseriesArtifact = {
  schemaVersion: "rescast-timeseries-1.0";
  trainingDataset: string;
  sampleRows: number;
  sampling?: { method?: string; fragments?: number; rowGroupsPerFragment?: number; seed?: number };
  featureNames: string[];
  target: string;
  targetUnit: string;
  splitMethod: string;
  randomSeed: number;
  selectedAlpha: number;
  trainRows: number;
  validationRows: number;
  testRows: number;
  testMetrics: { mae: number; rmse: number; r2: number };
  meanBaselineTestMetrics: { mae: number; rmse: number; r2: number };
  screeningUseOnly: true;
  engineeringAuthority: "deterministic_physics_and_measured_site_data";
  featureMean: number[];
  featureScale: number[];
  intercept: number;
  coefficients: number[];
  note: string;
};

type ModelReadyStatus = { available: true; screeningOnly: true; beatsMeanBaseline: boolean; r2: number; mae: number; baselineMae: number; sampleRows: number; trainRows: number; validationRows: number; testRows: number; trainingDataset: string; splitMethod: string };
type ModelMissingStatus = { available: false; screeningOnly: true };
let model: RescastTimeseriesArtifact | null = null;

export function loadRescastTimeseriesModel(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RescastTimeseriesArtifact>;
  if (candidate.schemaVersion !== "rescast-timeseries-1.0" || !Array.isArray(candidate.featureNames) || !Array.isArray(candidate.featureMean) || !Array.isArray(candidate.featureScale) || !Array.isArray(candidate.coefficients)) return false;
  if (candidate.featureMean.length !== candidate.featureNames.length || candidate.featureScale.length !== candidate.featureNames.length || candidate.coefficients.length !== candidate.featureNames.length) return false;
  if (!candidate.testMetrics || !candidate.meanBaselineTestMetrics) return false;
  if (!Number.isFinite(candidate.testMetrics.r2) || !Number.isFinite(candidate.testMetrics.mae) || !Number.isFinite(candidate.meanBaselineTestMetrics.mae)) return false;
  if (![candidate.intercept, candidate.selectedAlpha, candidate.trainRows, candidate.validationRows, candidate.testRows, candidate.sampleRows].every((value) => Number.isFinite(Number(value)))) return false;
  if (!candidate.featureMean.concat(candidate.featureScale, candidate.coefficients).every((value) => Number.isFinite(value))) return false;
  model = candidate as RescastTimeseriesArtifact;
  return true;
}

export function rescastTimeseriesStatus(): ModelReadyStatus | ModelMissingStatus {
  if (!model) return { available: false, screeningOnly: true };
  return { available: true, screeningOnly: true, beatsMeanBaseline: model.testMetrics.mae < model.meanBaselineTestMetrics.mae, r2: model.testMetrics.r2, mae: model.testMetrics.mae, baselineMae: model.meanBaselineTestMetrics.mae, sampleRows: model.sampleRows, trainRows: model.trainRows, validationRows: model.validationRows, testRows: model.testRows, trainingDataset: model.trainingDataset, splitMethod: model.splitMethod };
}

export function predictRescastTimeseries(features: Record<string, number>) {
  if (!model) return null;
  let missingFeatures = 0;
  const vector = model.featureNames.map((name, index) => {
    const raw = Number(features[name]);
    if (!Number.isFinite(raw)) { missingFeatures += 1; return 0; }
    return (raw - model.featureMean[index]) / (model.featureScale[index] || 1);
  });
  const value = model.intercept + model.coefficients.reduce((sum, coefficient, index) => sum + coefficient * vector[index], 0);
  return { value, target: model.target, targetUnit: model.targetUnit, missingFeatures, screeningOnly: true, testR2: model.testMetrics.r2, trainingDataset: model.trainingDataset, authority: model.engineeringAuthority };
}
