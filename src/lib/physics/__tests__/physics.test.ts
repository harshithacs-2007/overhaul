import { describe, expect, it } from "vitest";
import {
  assemblyUValueWm2K,
  layerResistanceM2KW,
} from "../thermalResistance";
import {
  conductionHeatTransferW,
  computeSurfaceHeatTransfer,
} from "../envelopeLoad";
import { compareHvacCapacity, OVERSIZED_RATIO } from "../hvacCapacity";
import { runPhysics } from "../run";
import type { PhysicsRunInput } from "../types";

describe("thermal resistance", () => {
  it("R = t/λ for a single layer", () => {
    expect(layerResistanceM2KW(0.1, 0.04)).toBeCloseTo(2.5, 10);
  });

  it("more insulation lowers U", () => {
    const thin = assemblyUValueWm2K([
      { id: "a", thicknessM: 0.05, conductivityWmK: 0.04 },
    ]);
    const thick = assemblyUValueWm2K([
      { id: "a", thicknessM: 0.1, conductivityWmK: 0.04 },
    ]);
    expect(thick.uValueWm2K).toBeLessThan(thin.uValueWm2K);
  });

  it("rejects zero thickness", () => {
    expect(() => layerResistanceM2KW(0, 0.04)).toThrow();
  });
});

describe("conduction", () => {
  it("Q = U A ΔT", () => {
    expect(conductionHeatTransferW(1, 10, 5)).toBe(50);
  });

  it("equal indoor/outdoor → Q = 0", () => {
    const r = computeSurfaceHeatTransfer(
      { id: "w", kind: "wall", areaM2: 20, uValueWm2K: 1 },
      24,
      24
    );
    expect(r.heatTransferW).toBe(0);
    expect(r.status).toBe("calculated");
  });

  it("larger area increases |Q|", () => {
    const a = computeSurfaceHeatTransfer(
      { id: "w", kind: "wall", areaM2: 10, uValueWm2K: 1 },
      34,
      24
    );
    const b = computeSurfaceHeatTransfer(
      { id: "w", kind: "wall", areaM2: 20, uValueWm2K: 1 },
      34,
      24
    );
    expect(Math.abs(b.heatTransferW!)).toBeGreaterThan(Math.abs(a.heatTransferW!));
  });

  it("missing U → unavailable", () => {
    const r = computeSurfaceHeatTransfer(
      { id: "w", kind: "wall", areaM2: 10 },
      34,
      24
    );
    expect(r.status).toBe("unavailable");
    expect(r.trace.missingInputs.length).toBeGreaterThan(0);
  });
});

describe("hvac capacity", () => {
  it("flags insufficient", () => {
    const c = compareHvacCapacity(10, { ratedCapacityKW: 5 });
    expect(c.state).toBe("insufficient");
  });

  it("flags potentially oversized above documented ratio", () => {
    const c = compareHvacCapacity(5, { ratedCapacityKW: 5 * OVERSIZED_RATIO + 0.1 });
    expect(c.state).toBe("potentially_oversized");
  });

  it("unable without capacity", () => {
    const c = compareHvacCapacity(5, {});
    expect(c.state).toBe("unable_to_determine");
  });
});

describe("runPhysics", () => {
  const base: PhysicsRunInput = {
    indoorTempC: 24,
    outdoorTempC: 34,
    outdoorTempSource: "test design",
    surfaces: [
      { id: "wall_1", kind: "wall", areaM2: 100, uValueWm2K: 1 },
      { id: "roof_1", kind: "roof", areaM2: 50, uValueWm2K: 0.5 },
    ],
    ventilation: { mode: "unknown" },
    solar: {},
    hvac: { ratedCapacityKW: 20 },
    mode: "cooling",
  };

  it("produces partial load when vent/solar missing", () => {
    const r = runPhysics(base);
    expect(r.load.status).toBe("partial");
    expect(r.load.conductionW).toBeCloseTo(100 * 1 * 10 + 50 * 0.5 * 10, 5);
    expect(r.hvac.status).toBe("calculated");
  });
});
