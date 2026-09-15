import { describe, expect, it } from "vitest";
import { calculateMachineBaseline, calculateMachineRetrofit, extractBillEnergy } from "./machineRetrofitCalculations";

describe("machine retrofit calculations", () => {
  it("calculates annual equipment energy from explicit duty and efficiency", () => {
    const result = calculateMachineBaseline({ loadKW: 5, ratedCapacityKW: 7.5, efficiency: 0.8, runtimeHours: 2000, electricityRateINRPerKWh: 8 });
    expect(result.calculatedPowerKW).toBeCloseTo(6.25, 6);
    expect(result.annualEnergyKWh).toBeCloseTo(12500, 6);
    expect(result.annualCostINR).toBeCloseTo(100000, 6);
  });

  it("prefers observed input power over calculated power for the energy baseline", () => {
    const result = calculateMachineBaseline({ loadKW: 5, efficiency: 0.8, powerKW: 7, runtimeHours: 100 });
    expect(result.currentPowerKW).toBe(7);
    expect(result.annualEnergyKWh).toBe(700);
  });

  it("supports partial bill history without pretending it is a full year", () => {
    const result = calculateMachineBaseline({ billEnergyKWh: 600, billMonths: 6 });
    expect(result.billEnergyKWh).toBe(600);
    expect(result.annualizedBillEnergyKWh).toBe(1200);
  });

  it("does not annualize bill energy when the covered period is unknown", () => {
    const result = calculateMachineBaseline({ billEnergyKWh: 600 });
    expect(result.annualizedBillEnergyKWh).toBeNull();
    expect(result.gaps.some((gap) => gap.includes("month count"))).toBe(true);
  });

  it("blocks a retrofit what-if when no explicit target exists", () => {
    expect(calculateMachineRetrofit({ loadKW: 5, efficiency: 0.8, runtimeHours: 100 })).toBeNull();
  });

  it("calculates an efficiency counterfactual from an explicit target", () => {
    const result = calculateMachineRetrofit({ loadKW: 5, efficiency: 0.8, runtimeHours: 100, targetEfficiency: 0.9 });
    expect(result).not.toBeNull();
    expect(result?.powerKW).toBeCloseTo(5 / 0.9, 6);
    expect(result?.energySavingKWh).toBeCloseTo(62.5, 6);
  });

  it("extracts only energy-like observations from bill evidence", () => {
    const result = extractBillEnergy([
      { field: "energy_consumption", numericValue: 100, unit: "kWh" },
      { field: "demand", numericValue: 12, unit: "kW" },
      { field: "tariff", numericValue: 8, unit: "INR/kWh" },
      { field: "units", numericValue: 50, unit: "units" },
    ]);
    expect(result.totalKWh).toBe(150);
    expect(result.evidenceCount).toBe(2);
  });
});
