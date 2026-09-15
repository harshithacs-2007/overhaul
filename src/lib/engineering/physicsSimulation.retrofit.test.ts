import { describe, expect, it } from "vitest";
import { simulatePhysicsScenario } from "./physicsSimulation";

describe("retrofit physics invariants", () => {
  it("shows lower equipment power when the same load gets a higher efficiency", () => {
    const result = simulatePhysicsScenario({
      subject: "equipment",
      baseline: {
        loadKW: 50,
        ratedCapacityKW: 75,
        efficiency: 0.8,
        annualHours: 4000,
        electricityRateINRPerKWh: 8,
      },
      retrofit: { efficiency: 1 },
    });

    expect(result.proposed.electricalPowerKW).toBeCloseTo(50, 8);
    expect(result.baseline.electricalPowerKW).toBeCloseTo(62.5, 8);
    expect(result.delta.electricalPowerKW).toBeCloseTo(-12.5, 8);
    expect(result.delta.annualEnergyKWh).toBeCloseTo(-50000, 8);
    expect(result.delta.annualSavingINR).toBeCloseTo(400000, 8);
  });

  it("propagates an envelope retrofit through thermal load and HVAC power", () => {
    const result = simulatePhysicsScenario({
      subject: "building",
      baseline: {
        floorAreaM2: 100,
        envelopeUA_W_per_K: 500,
        ventilationM3s: 0,
        outdoorTempC: 40,
        indoorTempC: 24,
        solarGainKW: 0,
        internalGainKW: 0,
        hvacCapacityKW: 20,
        hvacCOP: 4,
        annualCoolingHours: 2000,
        electricityRateINRPerKWh: 8,
      },
      retrofit: { envelopeUA_W_per_K: 250 },
    });

    expect(result.baseline.thermalLoadKW).toBeCloseTo(8, 8);
    expect(result.proposed.thermalLoadKW).toBeCloseTo(4, 8);
    expect(result.baseline.electricalPowerKW).toBeCloseTo(2, 8);
    expect(result.proposed.electricalPowerKW).toBeCloseTo(1, 8);
    expect(result.delta.annualEnergyKWh).toBeCloseTo(-2000, 8);
    expect(result.delta.annualSavingINR).toBeCloseTo(16000, 8);
  });

  it("does not report a positive saving when the retrofit makes energy use worse", () => {
    const result = simulatePhysicsScenario({
      subject: "equipment",
      baseline: {
        loadKW: 40,
        ratedCapacityKW: 50,
        efficiency: 0.8,
        annualHours: 3000,
        electricityRateINRPerKWh: 10,
      },
      retrofit: { efficiency: 0.6 },
    });

    expect(result.delta.annualEnergyKWh).toBeGreaterThan(0);
    expect(result.delta.annualSavingINR).toBeLessThan(0);
    expect(result.delta.savingPercent).toBeLessThan(0);
  });
});
