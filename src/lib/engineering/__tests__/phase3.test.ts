import { describe, expect, it } from "vitest";
import {
  toSquareMeters,
  toKilowatts,
  toCelsius,
  fromCelsius,
  UnitConversionError,
} from "../units";
import {
  userProvided,
  unknownValue,
  assertNotSilentAssumption,
} from "../provenance";
import { validateBuilding, validateHvacSystem, validateLocation } from "../validation";
import { emptyBuildingIdentity } from "../building";
import { emptyHvacSystem } from "../hvac";
import { collectUnknowns, createEmptyEngineeringModel } from "../model";
import { assessClimateCompleteness, type ClimateContext } from "../climate";

describe("units", () => {
  it("converts area to m²", () => {
    expect(toSquareMeters(10.76391041671, "ft2")).toBeCloseTo(1, 5);
    expect(toSquareMeters(100, "m2")).toBe(100);
  });

  it("converts capacity to kW", () => {
    expect(toKilowatts(1, "ton")).toBeCloseTo(3.517, 3);
    expect(toKilowatts(1000, "W")).toBe(1);
  });

  it("converts temperature", () => {
    expect(toCelsius(32, "F")).toBeCloseTo(0, 5);
    expect(fromCelsius(100, "F")).toBeCloseTo(212, 5);
  });

  it("rejects impossible values", () => {
    expect(() => toSquareMeters(-1, "m2")).toThrow(UnitConversionError);
    expect(() => toCelsius(-500, "F")).toThrow(UnitConversionError);
  });
});

describe("provenance", () => {
  it("marks unknowns explicitly", () => {
    const u = unknownValue();
    expect(u.value).toBeNull();
    expect(u.provenance.kind).toBe("UNKNOWN");
  });

  it("requires note on ASSUMED", () => {
    expect(() =>
      assertNotSilentAssumption({
        value: 1,
        provenance: {
          kind: "ASSUMED",
          recordedAt: new Date().toISOString(),
        },
      })
    ).toThrow(/ASSUMED/);
  });
});

describe("building/hvac validation", () => {
  it("accepts unknown building fields", () => {
    expect(validateBuilding(emptyBuildingIdentity())).toEqual([]);
  });

  it("rejects impossible floor area", () => {
    const b = emptyBuildingIdentity();
    b.floorAreaM2 = userProvided(-5);
    expect(validateBuilding(b).some((i) => i.severity === "error")).toBe(true);
  });

  it("validates hvac capacity range", () => {
    const s = emptyHvacSystem();
    s.ratedCapacityKW = userProvided(1e9);
    expect(validateHvacSystem(s).length).toBeGreaterThan(0);
  });
});

describe("location normalization", () => {
  it("warns that city precision is not a parcel", () => {
    const issues = validateLocation({
      query: "Bengaluru",
      displayName: "Bengaluru, India",
      coordinates: { latitude: 12.97, longitude: 77.59 },
      precision: "city",
      warnings: [],
    });
    expect(issues.some((i) => i.path === "location.precision")).toBe(true);
  });

  it("errors on out-of-range coordinates", () => {
    const issues = validateLocation({
      query: "x",
      displayName: "x",
      coordinates: { latitude: 200, longitude: 0 },
      precision: "unknown",
      warnings: [],
    });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});

describe("climate completeness", () => {
  it("does not treat current-only as engineering usable", () => {
    const unavailable = {
      availability: "unavailable" as const,
      data: null,
    };
    const ctx: ClimateContext = {
      location: {
        coordinates: { latitude: 0, longitude: 0 },
        displayName: "0,0",
      },
      historical: {
        meanTempC: unavailable,
        seasonalTempC: unavailable,
      },
      humidity: unavailable,
      solarRadiation: unavailable,
      wind: unavailable,
      designConditions: {
        heatingDesignTempC: unavailable,
        coolingDesignTempC: unavailable,
      },
      extremes: { maxTempC: unavailable, minTempC: unavailable },
      futureProjections: null,
      currentObservation: {
        availability: "available",
        data: userProvided(30),
      },
      retrievedAt: new Date().toISOString(),
      provider: "test",
      warnings: [],
      completeness: { engineeringUsable: false, missing: [] },
    };
    const c = assessClimateCompleteness(ctx);
    expect(c.engineeringUsable).toBe(false);
    expect(c.missing.length).toBeGreaterThan(0);
  });
});

describe("EngineeringReadyModel", () => {
  it("starts with unknowns collected", () => {
    const m = createEmptyEngineeringModel();
    const u = collectUnknowns(m);
    expect(u.some((x) => x.path === "location")).toBe(true);
  });
});
