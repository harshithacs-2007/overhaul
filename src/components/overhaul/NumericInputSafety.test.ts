import { describe, expect, it } from "vitest";
import { parseEngineeringNumber } from "./NumericInputSafety";

describe("parseEngineeringNumber", () => {
  it("parses ordinary decimals", () => {
    expect(parseEngineeringNumber("12.5")).toBe(12.5);
    expect(parseEngineeringNumber("0.75")).toBe(0.75);
    expect(parseEngineeringNumber("-3.2")).toBe(-3.2);
  });

  it("normalizes common human-entered separators", () => {
    expect(parseEngineeringNumber("1,000")).toBe(1000);
    expect(parseEngineeringNumber(" 2 400.5 ")).toBe(2400.5);
    expect(parseEngineeringNumber("1_250")).toBe(1250);
  });

  it("returns null for blank or unsafe values", () => {
    expect(parseEngineeringNumber("")).toBeNull();
    expect(parseEngineeringNumber("   ")).toBeNull();
    expect(parseEngineeringNumber("NaN")).toBeNull();
    expect(parseEngineeringNumber("Infinity")).toBeNull();
    expect(parseEngineeringNumber("12kW")).toBeNull();
    expect(parseEngineeringNumber("1e3")).toBeNull();
  });
});
