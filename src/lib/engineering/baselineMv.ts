/**
 * Engineering baseline + measurement & verification core.
 *
 * The model is intentionally small and auditable: energy is regressed against
 * independently supplied drivers, then post-retrofit energy is compared with
 * the adjusted baseline. No savings are fabricated when the required data is
 * missing or the fit is too weak.
 */

export type MVPhase = "baseline" | "post";

export interface MVRecord {
  timestamp: string;
  phase: MVPhase;
  energyKWh: number;
  outdoorTempC?: number;
  occupancy?: number;
  productionUnits?: number;
}

export interface BaselinePoint {
  timestamp: string;
  energyKWh: number;
  drivers: number[];
}

export interface CalibratedBaseline {
  schemaVersion: "1.0";
  status: "calibrated" | "insufficient-data" | "poor-fit";
  intercept: number | null;
  coefficients: number[];
  driverNames: string[];
  points: number;
  r2: number | null;
  cvRMSEPercent: number | null;
  nMBEPercent: number | null;
  predictions: Array<{ timestamp: string; actualKWh: number; predictedKWh: number; residualKWh: number }>;
  warnings: string[];
}

export interface MVVerification {
  status: "verified" | "not-verifiable";
  baselineAdjustedKWh: number | null;
  postMeasuredKWh: number | null;
  avoidedKWh: number | null;
  avoidedPercent: number | null;
  modelUncertaintyKWh: number | null;
  savingsRangeKWh: { low: number; high: number } | null;
  warnings: string[];
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const pivotValue = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= pivotValue;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function regularizedLeastSquares(points: BaselinePoint[]): number[] | null {
  if (!points.length) return null;
  const p = points[0].drivers.length;
  const size = p + 1;
  const normal = Array.from({ length: size }, () => Array(size).fill(0));
  const rhs = Array(size).fill(0);

  for (const point of points) {
    const x = [1, ...point.drivers];
    for (let i = 0; i < size; i += 1) {
      rhs[i] += x[i] * point.energyKWh;
      for (let j = 0; j < size; j += 1) normal[i][j] += x[i] * x[j];
    }
  }

  // Tiny ridge term keeps near-singular real-world driver sets solvable while
  // remaining negligible compared with the physical scale of the regression.
  for (let i = 1; i < size; i += 1) normal[i][i] += 1e-8;
  return solveLinearSystem(normal, rhs);
}

function buildPoint(record: MVRecord): BaselinePoint | null {
  if (!finite(record.energyKWh) || record.energyKWh < 0) return null;
  const drivers: number[] = [];
  if (finite(record.outdoorTempC)) drivers.push(record.outdoorTempC);
  if (finite(record.occupancy)) drivers.push(record.occupancy);
  if (finite(record.productionUnits)) drivers.push(record.productionUnits);
  return { timestamp: record.timestamp, energyKWh: record.energyKWh, drivers };
}

function commonDriverSchema(records: MVRecord[]): { names: string[]; points: BaselinePoint[] } {
  const names = ["outdoorTempC", "occupancy", "productionUnits"];
  const usable = records.filter((record) => buildPoint(record));
  if (!usable.length) return { names: [], points: [] };

  const enabled = names.filter((name) => usable.some((record) => finite(record[name as keyof MVRecord] as number | undefined)));
  const points = usable
    .map((record) => {
      const point = buildPoint(record);
      if (!point) return null;
      return {
        timestamp: point.timestamp,
        energyKWh: point.energyKWh,
        drivers: enabled.map((name) => {
          const value = record[name as keyof MVRecord];
          return typeof value === "number" && Number.isFinite(value) ? value : 0;
        }),
      };
    })
    .filter((point): point is BaselinePoint => Boolean(point));
  return { names: enabled, points };
}

export function fitCalibratedBaseline(records: MVRecord[]): CalibratedBaseline {
  const baseline = records.filter((record) => record.phase === "baseline");
  const { names, points } = commonDriverSchema(baseline);
  const warnings: string[] = [];
  const coefficientCount = names.length + 1;

  if (points.length < Math.max(8, coefficientCount * 3)) {
    return {
      schemaVersion: "1.0",
      status: "insufficient-data",
      intercept: null,
      coefficients: [],
      driverNames: names,
      points: points.length,
      r2: null,
      cvRMSEPercent: null,
      nMBEPercent: null,
      predictions: [],
      warnings: ["A calibrated baseline needs more baseline intervals before savings can be verified."],
    };
  }

  const beta = regularizedLeastSquares(points);
  if (!beta) {
    return {
      schemaVersion: "1.0",
      status: "insufficient-data",
      intercept: null,
      coefficients: [],
      driverNames: names,
      points: points.length,
      r2: null,
      cvRMSEPercent: null,
      nMBEPercent: null,
      predictions: [],
      warnings: ["The supplied baseline drivers are numerically singular; collect a more varied baseline window."],
    };
  }

  const predictions = points.map((point) => {
    const predictedKWh = beta[0] + point.drivers.reduce((sum, value, index) => sum + value * beta[index + 1], 0);
    return { timestamp: point.timestamp, actualKWh: point.energyKWh, predictedKWh, residualKWh: point.energyKWh - predictedKWh };
  });
  const actual = points.map((point) => point.energyKWh);
  const actualMean = mean(actual);
  const ssTot = actual.reduce((sum, value) => sum + (value - actualMean) ** 2, 0);
  const residuals = predictions.map((point) => point.residualKWh);
  const ssRes = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const rmse = Math.sqrt(ssRes / Math.max(points.length, 1));
  const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : null;
  const cvRMSEPercent = actualMean > 1e-12 ? (rmse / actualMean) * 100 : null;
  const nMBEPercent = actualMean > 1e-12 ? (mean(residuals) / actualMean) * 100 : null;

  if (r2 == null || r2 < 0.6) warnings.push("Baseline fit is weak; collect a longer or more varied operating window before trusting savings.");
  if (cvRMSEPercent != null && cvRMSEPercent > 15) warnings.push("Model error is relatively high; savings should be shown with a wider uncertainty band.");
  if (Math.abs(nMBEPercent ?? 0) > 5) warnings.push("Baseline bias exceeds 5%; recalibration is recommended.");

  return {
    schemaVersion: "1.0",
    status: warnings.length && (r2 == null || r2 < 0.6) ? "poor-fit" : "calibrated",
    intercept: beta[0],
    coefficients: beta.slice(1),
    driverNames: names,
    points: points.length,
    r2,
    cvRMSEPercent,
    nMBEPercent,
    predictions,
    warnings,
  };
}

export function verifyMeasuredSavings(records: MVRecord[], baseline: CalibratedBaseline): MVVerification {
  if (baseline.status !== "calibrated" || baseline.intercept == null) {
    return {
      status: "not-verifiable",
      baselineAdjustedKWh: null,
      postMeasuredKWh: null,
      avoidedKWh: null,
      avoidedPercent: null,
      modelUncertaintyKWh: null,
      savingsRangeKWh: null,
      warnings: ["A validated baseline is required before post-retrofit savings can be verified."],
    };
  }

  const post = records.filter((record) => record.phase === "post");
  if (!post.length) {
    return {
      status: "not-verifiable",
      baselineAdjustedKWh: null,
      postMeasuredKWh: null,
      avoidedKWh: null,
      avoidedPercent: null,
      modelUncertaintyKWh: null,
      savingsRangeKWh: null,
      warnings: ["No post-retrofit measurement window is loaded."],
    };
  }

  const driverNames = baseline.driverNames;
  const adjustedBaseline = post.reduce((sum, record) => {
    const drivers = driverNames.map((name) => {
      const value = record[name as keyof MVRecord];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    });
    if (drivers.some((value) => value == null)) return sum;
    return sum + baseline.intercept! + drivers.reduce((partial, value, index) => partial + value! * baseline.coefficients[index], 0);
  }, 0);
  const usablePost = post.filter((record) => driverNames.every((name) => finite(record[name as keyof MVRecord] as number | undefined)));
  if (!usablePost.length || usablePost.length !== post.length) {
    return {
      status: "not-verifiable",
      baselineAdjustedKWh: null,
      postMeasuredKWh: null,
      avoidedKWh: null,
      avoidedPercent: null,
      modelUncertaintyKWh: null,
      savingsRangeKWh: null,
      warnings: ["Post-retrofit records are missing one or more baseline drivers required for adjustment."],
    };
  }

  const postMeasuredKWh = post.reduce((sum, record) => sum + record.energyKWh, 0);
  const avoidedKWh = adjustedBaseline - postMeasuredKWh;
  const avoidedPercent = adjustedBaseline > 1e-12 ? (avoidedKWh / adjustedBaseline) * 100 : null;
  const uncertaintyFraction = Math.max((baseline.cvRMSEPercent ?? 0) / 100, 0.05);
  const modelUncertaintyKWh = adjustedBaseline * uncertaintyFraction;

  return {
    status: "verified",
    baselineAdjustedKWh: adjustedBaseline,
    postMeasuredKWh,
    avoidedKWh,
    avoidedPercent,
    modelUncertaintyKWh,
    savingsRangeKWh: {
      low: avoidedKWh - modelUncertaintyKWh,
      high: avoidedKWh + modelUncertaintyKWh,
    },
    warnings: avoidedKWh < 0 ? ["Post-retrofit consumption is above the adjusted baseline; investigate before declaring a positive retrofit result."] : [],
  };
}
