import { describe, expect, it } from "vitest";
import { buildAssetObj, buildDxfFootprint, buildInteropManifest, type InteropAsset } from "./assetInteroperability";

const asset: InteropAsset = {
  id: "asset-1",
  name: "Test Chiller",
  scope: "equipment",
  className: "Chiller",
  widthM: 2.4,
  depthM: 1.2,
  heightM: 1.8,
  capacityKW: 100,
  evidenceIds: ["evidence-1"],
};

describe("asset interoperability", () => {
  it("exports supplied metric geometry to OBJ", () => {
    const obj = buildAssetObj(asset);
    expect(obj).toContain("# Units: metres");
    expect(obj).toContain("v 2.4 0 0");
    expect(obj).toContain("SERVICE_CLEARANCE");
  });

  it("exports a CAD footprint using the stated width and depth", () => {
    const dxf = buildDxfFootprint(asset);
    expect(dxf).toContain("2.4");
    expect(dxf).toContain("1.2");
    expect(dxf).toContain("EOF");
  });

  it("blocks geometry export when dimensions are unresolved", () => {
    expect(() => buildAssetObj({ ...asset, widthM: 0 })).toThrow(/width is unresolved/);
    expect(() => buildDxfFootprint({ ...asset, depthM: Number.NaN })).toThrow(/depth is unresolved/);
  });

  it("marks unresolved geometry in the manifest instead of fabricating dimensions", () => {
    const manifest = buildInteropManifest({ ...asset, widthM: 0, depthM: 0, heightM: 0 }, {});
    expect(manifest.geometryBasis).toBe("unresolved");
    expect(manifest.asset.widthM).toBe(0);
    expect(manifest.provenance.at(-1)?.note).toMatch(/unresolved/);
  });
});
