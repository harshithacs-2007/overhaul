export type EquipmentSurrogateTarget = "power_kw" | "efficiency";

export type EquipmentSurrogateModel = {
  featureMean: number[];
  featureScale: number[];
  intercept: number;
  coefficients: number[];
  trainR2: number;
  testR2: number | null;
  trainRows: number;
  testRows: number;
  targetMean: number;
  targetStd: number;
};

export type EquipmentSurrogateBundle = {
  schemaVersion: "equipment-surrogate-1.0";
  trainingDataset: string;
  healthyRows: number;
  method: string;
  identitySplit: string;
  features: string[];
  targets: Record<string, { rows: number; features: string[]; targets: Partial<Record<EquipmentSurrogateTarget, EquipmentSurrogateModel>> }>;
};

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function featureVector(features: string[], values: Record<string, number>): number[] | null {
  const raw = features.map((key) => values[key]);
  if (!raw.every(finite)) return null;

  const base = raw;
  const squared = raw.map((v) => v * v);
  const out = [...base, ...squared];

  const has = (name: string) => features.includes(name);
  if (has("capacity_kw") && has("flow_m3h")) {
    out.push(values.capacity_kw * values.flow_m3h);
  }
  if (has("ambient_temp_c") && has("speed_rpm")) {
    out.push(values.ambient_temp_c * values.speed_rpm);
  }
  return out;
}

/**
 * Portable inference for a trained healthy-performance equipment surrogate.
 * Returns null rather than fabricating a prediction when required inputs are absent.
 */
export function predictEquipmentSurrogate(input: {
  bundle: EquipmentSurrogateBundle;
  equipmentClass: string;
  target: EquipmentSurrogateTarget;
  features: Record<string, number>;
}) {
  const modelGroup = input.bundle.targets[input.equipmentClass] ?? input.bundle.targets.other;
  const model = modelGroup?.targets[input.target];
  if (!model) return null;

  const vector = featureVector(modelGroup.features, input.features);
  if (!vector || vector.length !== model.coefficients.length) return null;

  const standardized = vector.map((value, i) =>
    (value - model.featureMean[i]) / Math.max(Math.abs(model.featureScale[i]), 1e-9)
  );
  const value = model.intercept + model.coefficients.reduce((sum, coefficient, i) => sum + coefficient * standardized[i], 0);

  return {
    value,
    unit: input.target === "power_kw" ? "kW" : "ratio",
    target: input.target,
    equipmentClass: input.equipmentClass,
    trainR2: model.trainR2,
    testR2: model.testR2,
    trainRows: model.trainRows,
    testRows: model.testRows,
    trainingDataset: input.bundle.trainingDataset,
  };
}
