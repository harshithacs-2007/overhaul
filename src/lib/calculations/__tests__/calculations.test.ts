import { describe, expect, it } from "vitest";
import { calculateAssemblyU, calculateHeatFlux } from "../thermal";
import { calculateEfficiencyLoss, getHVACRecommendation } from "../hvac";
import { estimateSavings, getCarbonPayback } from "../savings";
import { rankActions } from "../ranking";
import { runPipeline } from "../pipeline";
import { DEMO_INPUT } from "../../demo";

describe("thermal", () => {
  it("computes U from layers + air films", () => {
    const result = calculateAssemblyU([
      { materialId: "brick_common", thicknessM: 0.1 },
      { materialId: "rock_wool", thicknessM: 0.1 },
    ]);
    expect(result.uValue).toBeGreaterThan(0.12);
    expect(result.uValue).toBeLessThan(2.09);
    expect(result.outlierFlag).toBeNull();
    const expectedR = 0.1 / 0.77 + 0.1 / 0.035 + 0.13 + 0.04;
    expect(result.totalR).toBeCloseTo(expectedR, 5);
  });

  it("flags uninsulated brick as U outlier", () => {
    const bare = calculateAssemblyU([
      { materialId: "brick_common", thicknessM: 0.1 },
    ]);
    expect(bare.uValue).toBeGreaterThan(2.09);
    expect(bare.outlierFlag).toContain("outside typical");
  });

  it("computes heat flux", () => {
    const flux = calculateHeatFlux(1.0, 100, 34, 24);
    expect(flux.heatFluxKW).toBeCloseTo(1.0, 5);
  });
});

describe("hvac", () => {
  it("returns 0 loss when loadFactor >= 0.85", () => {
    expect(calculateEfficiencyLoss(0.9).efficiencyLossPct).toBe(0);
  });

  it("flags oversized systems", () => {
    const v = getHVACRecommendation(10, 20, 5, "single");
    expect(v.verdict).toBe("oversized");
    expect(v.efficiencyLossPct).toBeGreaterThanOrEqual(15);
  });
});

describe("savings", () => {
  it("estimates payback", () => {
    const s = estimateSavings(1, 8, 29200, "office");
    expect(s.annualKWhSaved).toBe(1 * 10 * 365);
    expect(s.paybackYears).toBeCloseTo(1, 5);
  });

  it("flags non net-positive carbon", () => {
    const c = getCarbonPayback(1000, 10, 30);
    expect(c.isNetPositive).toBe(false);
    expect(c.flag).toContain("not net-positive");
  });
});

describe("ranking", () => {
  it("sorts by score descending and attaches why", () => {
    const verdict = getHVACRecommendation(10, 12, 5, "single");
    const plan = rankActions(
      [
        {
          id: "a",
          category: "envelope_wall",
          title: "A",
          description: "",
          costINR: 100000,
          carbonSavedKgCO2e: 500,
          loadReductionKW: 1,
          annualKWhSaved: 1000,
          annualCostSavedINR: 8000,
          paybackYears: 12,
          carbonPaybackYears: 2,
          isNetPositive: true,
          carbonFlag: null,
          comfortImpact: "",
          maintenanceImpact: "",
          formulas: [],
        },
        {
          id: "b",
          category: "envelope_roof",
          title: "B",
          description: "",
          costINR: 10000,
          carbonSavedKgCO2e: 500,
          loadReductionKW: 1,
          annualKWhSaved: 1000,
          annualCostSavedINR: 8000,
          paybackYears: 1,
          carbonPaybackYears: 2,
          isNetPositive: true,
          carbonFlag: null,
          comfortImpact: "",
          maintenanceImpact: "",
          formulas: [],
        },
      ],
      verdict,
      ["high_bills"]
    );
    expect(plan.actions[0].id).toBe("b");
    expect(plan.actions[0].whyRankedHere).toContain("Rank #1");
  });
});

describe("pipeline", () => {
  it("runs demo input without throwing", () => {
    const result = runPipeline(DEMO_INPUT, {
      outdoorTempC: 33,
      source: "test",
      fetchedAt: new Date().toISOString(),
      isFuture: false,
      yearLabel: "Today",
    });
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(result.thermal.totalLoadKW).toBeGreaterThan(0);
  });
});
