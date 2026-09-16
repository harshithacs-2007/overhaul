import { describe, expect, it } from "vitest";
import { classificationScores, intersectionOverUnion, meanAbsoluteError, meanAbsolutePercentageError } from "./evaluationMetrics";

describe("evaluationMetrics", () => {
  it("computes IoU", () => {
    expect(intersectionOverUnion({ x: 0, y: 0, width: 1, height: 1 }, { x: 0.5, y: 0.5, width: 1, height: 1 })).toBeCloseTo(1 / 7, 8);
  });

  it("computes MAE and MAPE without dividing by zero", () => {
    const pairs = [{ actual: 105, expected: 100 }, { actual: 0, expected: 0 }];
    expect(meanAbsoluteError(pairs)).toBe(2.5);
    expect(meanAbsolutePercentageError(pairs)).toBe(5);
  });

  it("computes class precision, recall and F1", () => {
    const score = classificationScores(["pump", "vfd", "window"], ["pump", "vfd", "table"]);
    expect(score.truePositive).toBe(2);
    expect(score.falsePositive).toBe(1);
    expect(score.falseNegative).toBe(1);
    expect(score.precision).toBeCloseTo(2 / 3, 8);
    expect(score.recall).toBeCloseTo(2 / 3, 8);
    expect(score.f1).toBeCloseTo(2 / 3, 8);
  });
});
