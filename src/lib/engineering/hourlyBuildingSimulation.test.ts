import { describe, expect, it } from "vitest";
import { simulateBuildingHourly, type ClimateHour } from "./hourlyBuildingSimulation";

const climate: ClimateHour[] = [
  { timestamp: "2025-01-01T12:00", outdoorTempC: 35, solarIrradianceKWhM2: 0.5 },
  { timestamp: "2025-01-01T13:00", outdoorTempC: 30, solarIrradianceKWhM2: 0.2 },
];

const base = {
  envelopeU_W_m2K: 1,
  envelopeAreaM2: 100,
  ventilationM3s: 0.1,
  infiltrationM3s: 0.05,
  indoorTempC: 24,
  hvacCapacityKW: 20,
  hvacCOP: 4,
  internalGainKW: 2,
  solarGainFactorM2: 10,
  tariffINRPerKWh: 8,
  climate,
};

describe("simulateBuildingHourly", () => {
  it("uses every supplied hourly boundary condition", () => {
    const result = simulateBuildingHourly(base);
    expect(result.datasetHours).toBe(2);
    expect(result.peakThermalLoadKW).toBeGreaterThan(0);
    expect(result.annualCoolingEnergyKWh).toBeGreaterThan(0);
    expect(result.annualCostINR).toBe(result.annualCoolingEnergyKWh * 8);
  });

  it("reports capacity shortfall instead of hiding it", () => {
    const result = simulateBuildingHourly({ ...base, hvacCapacityKW: 1 });
    expect(result.hoursOverCapacity).toBe(2);
    expect(result.unmetCoolingEnergyKWh).toBeGreaterThan(0);
  });

  it("rejects missing annual climate evidence", () => {
    expect(() => simulateBuildingHourly({ ...base, climate: [] })).toThrow(/hourly climate series/i);
  });

  it("rejects invalid COP rather than clamping it", () => {
    expect(() => simulateBuildingHourly({ ...base, hvacCOP: 0 })).toThrow(/HVAC COP/i);
  });
});
