import { describe, expect, it } from "vitest";
import { buildRetrofitTwin, describeTwinDelta } from "./twinComparison";
import type { TwinModel } from "./twinModel";

const model: TwinModel = {
  schemaVersion: "overhaul.twin.v2",
  scope: "building",
  title: "Test Asset",
  className: "office",
  generatedAt: "2026-01-01T00:00:00Z",
  geometryBasis: "dimensioned-floorplan",
  geometryStatus: "verified-metric",
  units: "m",
  overall: { widthM: 20, depthM: 10, heightM: 3 },
  rooms: [{ id: "r1", name: "Room", x: 0, y: 0, widthM: 20, depthM: 10, heightM: 3, source: "user", confidence: 1 }],
  walls: [],
  openings: [],
  assets: [{ id: "a1", label: "AHU", className: "ahu", x: 5, y: 5, widthM: 1, depthM: 1, heightM: 1, rotationDeg: 0, source: "photo", confidence: 0.9 }],
  sourceEvidenceIds: [],
  confidence: 0.9,
  warnings: [],
  nextEvidence: [],
};

describe("buildRetrofitTwin", () => {
  it("preserves geometry while marking an explicit efficiency intervention", () => {
    const proposed = buildRetrofitTwin(model, { cop: 3, proposed_cop: 4 });
    expect(describeTwinDelta(model, proposed).sourceGeometryUnchanged).toBe(true);
    expect(proposed.assets[0].observedState).toMatch(/RETROFIT TARGET/);
  });

  it("does not mutate the observed model", () => {
    const before = JSON.stringify(model);
    buildRetrofitTwin(model, { annual_hours: 4000, proposed_runtime_hours: 3000 });
    expect(JSON.stringify(model)).toBe(before);
  });

  it("does not fabricate retrofit changes without an explicit target", () => {
    const proposed = buildRetrofitTwin(model, {});
    expect(JSON.stringify(proposed)).toBe(JSON.stringify(model));
  });
});
