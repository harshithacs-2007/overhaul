import { describe, expect, it } from "vitest";
import { simulatePhysicsScenario } from "./physicsSimulation";

describe("simulatePhysicsScenario", () => {
  it("computes equipment baseline and efficiency retrofit deterministically", () => {
    const result = simulatePhysicsScenario({
      subject: "equipment",
      baseline: { loadKW: 40, ratedCapacityKW: 50, efficiency: 0.8, annualHours: 3000, electricityRateINRPerKWh: 10 },
      retrofit: { efficiency: 1.0 },
    });

    expect(result.baseline.electricalPowerKW).toBeCloseTo(50, 8);
    expect(result.proposed.electricalPowerKW).toBeCloseTo(40, 8);
    expect(result.baseline.annualEnergyKWh).toBeCloseTo(150000, 8);
    expect(result.proposed.annualEnergyKWh).toBeCloseTo(120000, 8);
    expect(result.delta.annualEnergyKWh).toBeCloseTo(-30000, 8);
    expect(result.delta.annualSavingINR).toBeCloseTo(300000, 8);
  });

  it("computes building envelope counterfactual without fabricating capacity savings", () => {
    const baseline = {
      floorAreaM2: 100,
      envelopeUA_W_per_K: 150,
      ventilationM3s: 0,
      outdoorTempC: 35,
      indoorTempC: 25,
      solarGainKW: 4,
      internalGainKW: 2,
      hvacCapacityKW: 12,
      hvacCOP: 3,
      annualCoolingHours: 2000,
      electricityRateINRPerKWh: 9,
    } as const;

    const result = simulatePhysicsScenario({
      subject: "building",
      baseline,
      retrofit: { envelopeUA_W_per_K: 80 },
    });

    expect(result.baseline.thermalLoadKW).toBeCloseTo(7.5, 8);
    expect(result.proposed.thermalLoadKW).toBeCloseTo(6.8, 8);
    expect(result.delta.annualEnergyKWh).toBeCloseTo(-466.6666666667, 8);
    expect(result.delta.annualSavingINR).toBeCloseTo(4200, 8);
  });

  it("rejects impossible annual runtime instead of silently calculating", () => {
    expect(() => simulatePhysicsScenario({
      subject: "equipment",
      baseline: { loadKW: 10, ratedCapacityKW: 15, efficiency: 0.8, annualHours: 9000, electricityRateINRPerKWh: 10 },
    })).toThrow(/8760/);
  });
});
