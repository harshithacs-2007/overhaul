import { describe, expect, it } from "vitest";
import { createEmptyEngineeringModel } from "@/lib/engineering/model";
import { userProvided } from "@/lib/engineering/provenance";
import type { ClimateContext } from "@/lib/engineering/climate";
import { assessSimulationReadiness } from "../readiness";
import {
  createBaselineScenario,
  createScenarioFrom,
  simulateScenario,
  compareScenarios,
  type ScenarioModification,
} from "../scenarios";
import { optimizeRetrofits } from "../optimize";

function unavailable() {
  return { availability: "unavailable" as const, data: null };
}

function fixtureModel() {
  const m = createEmptyEngineeringModel("test");
  m.location = {
    query: "Test City",
    displayName: "Test City",
    coordinates: { latitude: 12.97, longitude: 77.59 },
    precision: "city",
    warnings: [],
  };
  const cooling = {
    availability: "available" as const,
    data: userProvided(36),
    meta: { dataset: "test-fixture" },
  };
  const ctx: ClimateContext = {
    location: {
      coordinates: m.location.coordinates,
      displayName: m.location.displayName,
    },
    historical: {
      meanTempC: {
        availability: "available",
        data: userProvided(28),
      },
      seasonalTempC: unavailable() as ClimateContext["historical"]["seasonalTempC"],
    },
    humidity: unavailable(),
    solarRadiation: unavailable(),
    wind: unavailable(),
    designConditions: {
      heatingDesignTempC: {
        availability: "available",
        data: userProvided(15),
      },
      coolingDesignTempC: cooling,
    },
    extremes: { maxTempC: unavailable(), minTempC: unavailable() },
    futureProjections: null,
    currentObservation: null,
    retrievedAt: new Date().toISOString(),
    provider: "test",
    warnings: [],
    completeness: { engineeringUsable: true, missing: [] },
  };
  m.climate = ctx;
  m.operating.comfortTempC = userProvided(24);
  m.envelope.surfaces = m.envelope.surfaces.map((s) => {
    if (s.kind === "wall") {
      return {
        ...s,
        areaM2: userProvided(80),
        uValueWm2K: userProvided(1.2),
      };
    }
    if (s.kind === "roof") {
      return {
        ...s,
        areaM2: userProvided(40),
        uValueWm2K: userProvided(0.8),
      };
    }
    if (s.kind === "window") {
      return {
        ...s,
        areaM2: userProvided(12),
        uValueWm2K: userProvided(3.5),
      };
    }
    return s;
  });
  m.hvac.systems = m.hvac.systems.map((sys, i) =>
    i === 0
      ? { ...sys, ratedCapacityKW: userProvided(15) }
      : sys
  );
  return m;
}

describe("readiness", () => {
  it("reports missing inputs on empty model", () => {
    const r = assessSimulationReadiness(createEmptyEngineeringModel());
    expect(r.ready).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("ready when location, climate, setpoint, envelope present", () => {
    const r = assessSimulationReadiness(fixtureModel());
    expect(r.ready).toBe(true);
  });
});

describe("scenario simulation", () => {
  it("baseline load > improved-U scenario load", () => {
    const model = fixtureModel();
    let baseline = createBaselineScenario(model);
    baseline = simulateScenario(baseline);
    expect(baseline.result?.load.totalKW).not.toBeNull();

    let sc = createScenarioFrom(baseline, {
      name: "Better wall",
      kind: "envelope",
    });
    const mod: ScenarioModification = {
      id: "m1",
      target: "wall",
      surfaceId: model.envelope.surfaces.find((s) => s.kind === "wall")!.id,
      proposedUWm2K: 0.35,
      label: "wall U → 0.35",
    };
    sc.modifications = [mod];
    sc = simulateScenario(sc);

    expect(sc.result?.load.totalKW).not.toBeNull();
    expect(sc.result!.load.totalKW!).toBeLessThan(baseline.result!.load.totalKW!);

    const d = compareScenarios(baseline, sc);
    expect(d.loadKW.delta).not.toBeNull();
    expect(d.loadKW.delta!).toBeLessThan(0);

    // HVAC required follows post-retrofit load
    expect(sc.result!.hvac.requiredCapacityKW).toBe(sc.result!.load.totalKW);
  });
});

describe("optimizer", () => {
  it("ranks envelope improvements by real load reduction", () => {
    const result = optimizeRetrofits(fixtureModel(), "energy");
    expect(result.actions.length).toBeGreaterThan(0);
    const top = result.actions[0];
    expect(top.cost).toBeNull();
    expect(top.carbon).toBeNull();
    if (top.category === "envelope" || top.category === "combined") {
      expect(top.impactLoadKW).not.toBeNull();
      expect(top.impactLoadKW!).toBeGreaterThan(0);
    }
    expect(result.sequence.length).toBeGreaterThan(0);
  });
});
