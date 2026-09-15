/**
 * Evidence-backed equipment performance curves.
 *
 * Curves are only evaluated from explicitly supplied reference points. The
 * engine never manufactures a healthy curve from observed operating data.
 */

export type PerformanceCurveSource = "manufacturer" | "physics" | "trained-surrogate" | "calibrated";

export type PerformancePoint = {
  loadFraction: number;
  output?: number;
  inputPowerKw?: number;
  flowM3h?: number;
  pressureBar?: number;
};

export type PerformanceCurve = {
  source: PerformanceCurveSource;
  basis: string;
  points: PerformancePoint[];
  xLabel: "load_fraction";
  yLabel: string;
  toleranceRelative: number;
};

export type CurveEvaluation = {
  loadFraction: number;
  expectedPowerKw: number | null;
  expectedOutput: number | null;
  expectedFlowM3h: number | null;
  expectedPressureBar: number | null;
  interpolated: boolean;
  bracket: [PerformancePoint, PerformancePoint] | null;
};

const finite = (value: number | undefined | null): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

function interpolate(a: number | undefined, b: number | undefined, t: number): number | null {
  if (!finite(a) || !finite(b)) return null;
  return a + (b - a) * t;
}

function normalizePoints(points: PerformancePoint[]): PerformancePoint[] {
  return [...points]
    .filter((point) => finite(point.loadFraction) && point.loadFraction >= 0 && point.loadFraction <= 1)
    .sort((a, b) => a.loadFraction - b.loadFraction)
    .filter((point, index, all) => index === 0 || point.loadFraction !== all[index - 1].loadFraction);
}

export function evaluatePerformanceCurve(curve: PerformanceCurve, requestedLoadFraction: number): CurveEvaluation {
  const points = normalizePoints(curve.points);
  const loadFraction = clamp(requestedLoadFraction, 0, 1);
  if (!points.length) {
    return {
      loadFraction,
      expectedPowerKw: null,
      expectedOutput: null,
      expectedFlowM3h: null,
      expectedPressureBar: null,
      interpolated: false,
      bracket: null,
    };
  }

  if (points.length === 1) {
    const point = points[0];
    return {
      loadFraction,
      expectedPowerKw: finite(point.inputPowerKw) ? point.inputPowerKw : null,
      expectedOutput: finite(point.output) ? point.output : null,
      expectedFlowM3h: finite(point.flowM3h) ? point.flowM3h : null,
      expectedPressureBar: finite(point.pressureBar) ? point.pressureBar : null,
      interpolated: loadFraction !== point.loadFraction,
      bracket: [point, point],
    };
  }

  if (loadFraction <= points[0].loadFraction) {
    const point = points[0];
    return {
      loadFraction,
      expectedPowerKw: finite(point.inputPowerKw) ? point.inputPowerKw : null,
      expectedOutput: finite(point.output) ? point.output : null,
      expectedFlowM3h: finite(point.flowM3h) ? point.flowM3h : null,
      expectedPressureBar: finite(point.pressureBar) ? point.pressureBar : null,
      interpolated: false,
      bracket: [point, point],
    };
  }

  const last = points[points.length - 1];
  if (loadFraction >= last.loadFraction) {
    return {
      loadFraction,
      expectedPowerKw: finite(last.inputPowerKw) ? last.inputPowerKw : null,
      expectedOutput: finite(last.output) ? last.output : null,
      expectedFlowM3h: finite(last.flowM3h) ? last.flowM3h : null,
      expectedPressureBar: finite(last.pressureBar) ? last.pressureBar : null,
      interpolated: false,
      bracket: [last, last],
    };
  }

  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (loadFraction > b.loadFraction) continue;
    const span = b.loadFraction - a.loadFraction;
    const t = span > 0 ? (loadFraction - a.loadFraction) / span : 0;
    return {
      loadFraction,
      expectedPowerKw: interpolate(a.inputPowerKw, b.inputPowerKw, t),
      expectedOutput: interpolate(a.output, b.output, t),
      expectedFlowM3h: interpolate(a.flowM3h, b.flowM3h, t),
      expectedPressureBar: interpolate(a.pressureBar, b.pressureBar, t),
      interpolated: true,
      bracket: [a, b],
    };
  }

  return {
    loadFraction,
    expectedPowerKw: null,
    expectedOutput: null,
    expectedFlowM3h: null,
    expectedPressureBar: null,
    interpolated: false,
    bracket: null,
  };
}

export function residualToCurve(observed: number, expected: number | null): number | null {
  if (!finite(observed) || !finite(expected) || Math.abs(expected) < 1e-9) return null;
  return (observed - expected) / Math.abs(expected);
}

export function parseReferencePowerCurve(fields: Array<{ field: string; numericValue: number | null }>): PerformanceCurve | null {
  const points = new Map<number, PerformancePoint>();

  for (const item of fields) {
    if (!finite(item.numericValue)) continue;
    const field = item.field.toLowerCase().replace(/[%]/g, "");
    if (!(field.includes("reference") || field.includes("rated") || field.includes("manufacturer") || field.includes("performance"))) continue;
    if (!(field.includes("curve") || field.includes("part load") || field.includes("part_load") || field.includes("load"))) continue;
    if (!(field.includes("power") || field.includes("input"))) continue;

    const match = field.match(/(?:^|[^0-9])(0|[1-9][0-9]?|100)(?:[^0-9]|$)/);
    const percent = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(percent)) continue;
    const loadFraction = percent / 100;
    points.set(loadFraction, {
      loadFraction,
      inputPowerKw: item.numericValue,
    });
  }

  if (points.size < 2) return null;

  return {
    source: "manufacturer",
    basis: "explicit multi-point reference power curve values supplied in assessment evidence",
    points: [...points.values()],
    xLabel: "load_fraction",
    yLabel: "input_power_kw",
    toleranceRelative: 0.1,
  };
}
