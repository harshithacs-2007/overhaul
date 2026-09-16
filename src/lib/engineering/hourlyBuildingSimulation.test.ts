import { describe, expect, it } from "vitest";
import { simulateBuildingHourly, type ClimateHour } from "./hourlyBuildingSimulation";

const climate: ClimateHour[] = Array.from({ length: 8760 }, (_, index) => ({ timestamp: `2025-hour-${index}`, outdoorTempC: 35 - (index % 12) * 0.35, outdoorRHPercent: 65, surfacePressureKPa: 101.325, solarIrradianceKWhM2: index % 24 >= 7 && index % 24 <= 17 ? 0.2 : 0 }));

const base = { envelopeU_W_m2K: 1, envelopeAreaM2: 100, ventilationM3s: 0.1, infiltrationM3s: 0.05, indoorTempC: 24, indoorRHPercent: 50, hvacCapacityKW: 20, hvacCOP: 4, internalGainKW: 2, solarGainFactorM2: 10, tariffINRPerKWh: 8, climate };

describe("simulateBuildingHourly", () => {
  it("uses the complete hourly boundary", () => {
    const result = simulateBuildingHourly(base);
    expect(result.datasetHours).toBe(8760);
    expect(result.peakThermalLoadKW).toBeGreaterThan(0);
    expect(result.annualCoolingEnergyKWh).toBeGreaterThan(0);
    expect(result.annualCostINR).toBe(result.annualCoolingEnergyKWh * 8);
    expect(result.latentCoolingEnergyKWh).toBeGreaterThan(0);
  });
  it("reports capacity shortfall instead of hiding it", () => { const result = simulateBuildingHourly({ ...base, hvacCapacityKW: 1 }); expect(result.hoursOverCapacity).toBeGreaterThan(0); expect(result.unmetCoolingEnergyKWh).toBeGreaterThan(0); });
  it("rejects incomplete annual climate evidence", () => { expect(() => simulateBuildingHourly({ ...base, climate: climate.slice(0, 100) })).toThrow(/complete annual hourly climate/i); });
  it("rejects invalid COP rather than clamping it", () => { expect(() => simulateBuildingHourly({ ...base, hvacCOP: 0 })).toThrow(/HVAC COP/i); });
  it("rejects invalid indoor humidity", () => { expect(() => simulateBuildingHourly({ ...base, indoorRHPercent: 101 })).toThrow(/relative humidity/i); });
});
