import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { simulatePhysicsScenario } from "./physicsSimulation";

type GoldenCase = {
  id: string;
  metrics: Record<string, number>;
  expectedPhysics: Record<string, number>;
  groundTruthBoxes?: Record<string, { x: number; y: number; width: number; height: number }>;
};

type GoldenManifest = { cases: GoldenCase[] };

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/evaluation/golden-cases.json"), "utf8"),
) as GoldenManifest;

function close(actual: number, expected: number, tolerance = 1e-6) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

for (const fixture of manifest.cases) {
  describe(`golden fixture ${fixture.id}`, () => {
    it("keeps all ground-truth boxes normalized", () => {
      for (const box of Object.values(fixture.groundTruthBoxes || {})) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1);
        expect(box.y + box.height).toBeLessThanOrEqual(1);
      }
    });

    it("matches the deterministic engine expected outputs", () => {
      if (fixture.id === "pump-vfd-01") {
        const result = simulatePhysicsScenario({
          subject: "equipment",
          baseline: {
            loadKW: fixture.metrics.load_kw,
            ratedCapacityKW: fixture.metrics.capacity_kw,
            efficiency: fixture.metrics.efficiency,
            annualHours: fixture.metrics.annual_hours,
            electricityRateINRPerKWh: fixture.metrics.electricity_rate_inr_per_kwh,
          },
          retrofit: { efficiency: fixture.metrics.proposed_efficiency },
        });
        close(result.baseline.electricalPowerKW, fixture.expectedPhysics.baselinePowerKW);
        close(result.proposed.electricalPowerKW, fixture.expectedPhysics.retrofitPowerKW);
        close(result.baseline.annualEnergyKWh, fixture.expectedPhysics.baselineAnnualEnergyKWh);
        close(result.proposed.annualEnergyKWh, fixture.expectedPhysics.retrofitAnnualEnergyKWh);
        close(-result.delta.annualEnergyKWh, fixture.expectedPhysics.annualEnergySavingKWh);
        close(result.delta.annualSavingINR, fixture.expectedPhysics.annualCostSavingINR);
      } else {
        const result = simulatePhysicsScenario({
          subject: fixture.id === "chiller-plant-01" ? "facility" : "building",
          baseline: {
            floorAreaM2: fixture.metrics.floor_area_m2,
            envelopeUA_W_per_K: fixture.metrics.envelope_ua_w_per_k,
            ventilationM3s: 0,
            outdoorTempC: fixture.metrics.outdoor_temp_c,
            indoorTempC: fixture.metrics.indoor_temp_c,
            solarGainKW: fixture.id === "building-envelope-01" ? 4 : 0,
            internalGainKW: fixture.id === "building-envelope-01" ? 2 : 0,
            hvacCapacityKW: fixture.metrics.capacity_kw,
            hvacCOP: fixture.metrics.cop,
            annualCoolingHours: fixture.metrics.annual_cooling_hours,
            electricityRateINRPerKWh: fixture.metrics.electricity_rate_inr_per_kwh,
          },
          retrofit: fixture.id === "building-envelope-01" ? { envelopeUA_W_per_K: 80 } : undefined,
        });
        close(result.baseline.thermalLoadKW, fixture.expectedPhysics.baselineThermalLoadKW);
        if (fixture.expectedPhysics.retrofitThermalLoadKW != null) close(result.proposed.thermalLoadKW, fixture.expectedPhysics.retrofitThermalLoadKW);
        if (fixture.expectedPhysics.annualEnergySavingKWh != null) close(-result.delta.annualEnergyKWh, fixture.expectedPhysics.annualEnergySavingKWh);
        if (fixture.expectedPhysics.annualCostSavingINR != null) close(result.delta.annualSavingINR, fixture.expectedPhysics.annualCostSavingINR);
        if (fixture.expectedPhysics.baselineElectricalPowerKW != null) close(result.baseline.electricalPowerKW, fixture.expectedPhysics.baselineElectricalPowerKW);
        if (fixture.expectedPhysics.baselineAnnualEnergyKWh != null) close(result.baseline.annualEnergyKWh, fixture.expectedPhysics.baselineAnnualEnergyKWh);
      }
    });
  });
}
