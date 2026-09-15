import { describe, expect, it } from "vitest";
import { normalizeObservationForEngineering } from "./normalizeForEngineering";

describe("engineering observation normalization", () => {
  it("infers kW only from an explicit kW field name", () => {
    const result = normalizeObservationForEngineering({ field: "rated_capacity_kw", value: "100", numericValue: 100, unit: null, confidence: 1 });
    expect(result.field).toBe("capacity_kw");
    expect(result.numericValue).toBe(100);
    expect(result.unit).toBe("kW");
  });

  it("converts explicitly stated watts to kW", () => {
    const result = normalizeObservationForEngineering({ field: "input_power_kw", value: "2500 W", numericValue: 2500, unit: "W", confidence: 1 });
    expect(result.field).toBe("power_kw");
    expect(result.numericValue).toBeCloseTo(2.5, 8);
    expect(result.unit).toBe("kW");
  });

  it("does not reinterpret an incompatible unit", () => {
    const result = normalizeObservationForEngineering({ field: "load_kw", value: "230 V", numericValue: 230, unit: "V", confidence: 1 });
    expect(result.field).toBe("load_kw_unresolved");
    expect(result.numericValue).toBe(230);
    expect(result.unit).toBe("V");
  });

  it("converts runtime minutes to annual hours when the field explicitly represents hours", () => {
    const result = normalizeObservationForEngineering({ field: "annual_runtime_hours", value: "120 min", numericValue: 120, unit: "min", confidence: 1 });
    expect(result.field).toBe("annual_hours");
    expect(result.numericValue).toBeCloseTo(2, 8);
    expect(result.unit).toBe("h/yr");
  });
});
