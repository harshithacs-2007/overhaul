import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests", "fixtures", name), "utf8");

describe("controlled validation fixture integrity", () => {
  it.each([
    ["room-hvac.svg", ["AHU", "FAN", "PANEL", "DUCT"], ["1.20 m x 0.80 m x 1.60 m", "0.75 kW", "415 V", "600 mm"]],
    ["pump-skid.svg", ["CENTRIFUGAL PUMP", "MOTOR"], ["1.10 m L", "18.0 kW load", "25.0 kW rated", "η = 0.72"]],
    ["chiller-plant.svg", ["CHILLER", "PUMP", "COOLING TOWER"], ["350 kW capacity", "COP 4.2", "2.40 m"]],
  ])("keeps %s ground-truth labels and values intact", (filename, labels, values) => {
    const text = fixture(filename);
    for (const label of labels) expect(text).toContain(label);
    for (const value of values) expect(text).toContain(value);
    expect(text).toContain("GROUND TRUTH FIXTURE");
  });

  it("keeps the numeric engineering ground truth fixture parseable", () => {
    const cases = JSON.parse(fixture("engineering-cases.json")) as { version: string; cases: Array<{ id: string; groundTruth?: Record<string, number> }> };
    expect(cases.version).toBe("1.0");
    expect(cases.cases.length).toBeGreaterThanOrEqual(4);
    expect(cases.cases.find((item) => item.id === "pump-baseline")?.groundTruth?.annualEnergyKWh).toBe(105000);
    expect(cases.cases.find((item) => item.id === "pump-efficiency-retrofit")?.groundTruth?.annualEnergySavingKWh).toBe(15000);
    expect(cases.cases.find((item) => item.id === "building-envelope")?.groundTruth?.annualEnergySavingKWh).toBe(3150);
  });

  it("keeps the pump time-series fixture at the declared 10-row sample size", () => {
    const rows = fixture("pump-timeseries.csv").trim().split(/\r?\n/);
    expect(rows[0]).toBe("timestamp,power_kw,flow_m3s,suction_kpa,discharge_kpa");
    expect(rows).toHaveLength(11);
    expect(rows[1]).toContain("14.8");
    expect(rows.some((row) => row.includes(",18.0,"))).toBe(true);
    expect(rows.at(-1)).toContain("15.7");
  });
});
