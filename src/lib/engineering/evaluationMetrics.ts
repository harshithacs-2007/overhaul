export type Box = { x: number; y: number; width: number; height: number };

export function intersectionOverUnion(a: Box, b: Box) {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.width, b.x + b.width);
  const iy2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export function absoluteError(actual: number, expected: number) {
  return Math.abs(actual - expected);
}

export function percentageError(actual: number, expected: number) {
  if (expected === 0) return null;
  return Math.abs(actual - expected) / Math.abs(expected) * 100;
}

export function meanAbsoluteError(pairs: Array<{ actual: number; expected: number }>) {
  if (!pairs.length) return null;
  return pairs.reduce((sum, pair) => sum + absoluteError(pair.actual, pair.expected), 0) / pairs.length;
}

export function meanAbsolutePercentageError(pairs: Array<{ actual: number; expected: number }>) {
  const defined = pairs.map((pair) => percentageError(pair.actual, pair.expected)).filter((value): value is number => value != null);
  return defined.length ? defined.reduce((sum, value) => sum + value, 0) / defined.length : null;
}

export function classificationScores(expected: string[], predicted: string[]) {
  const expectedSet = new Set(expected.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const predictedSet = new Set(predicted.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const truePositive = [...predictedSet].filter((value) => expectedSet.has(value)).length;
  const falsePositive = [...predictedSet].filter((value) => !expectedSet.has(value)).length;
  const falseNegative = [...expectedSet].filter((value) => !predictedSet.has(value)).length;
  return {
    truePositive,
    falsePositive,
    falseNegative,
    precision: truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0,
    recall: truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0,
    f1: truePositive ? (2 * truePositive) / (2 * truePositive + falsePositive + falseNegative) : 0,
  };
}
