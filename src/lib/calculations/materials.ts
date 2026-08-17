/**
 * Material thermal conductivity (λ) and embodied-carbon presets.
 * Sources noted inline; unlabeled values are documented assumptions.
 */

export type MaterialId =
  | "brick_common"
  | "brick_engineering"
  | "concrete_dense"
  | "concrete_lightweight"
  | "gypsum_plaster"
  | "glass_wool"
  | "rock_wool"
  | "eps"
  | "xps"
  | "pir"
  | "single_pane_glass"
  | "double_pane_glass"
  | "triple_pane_glass"
  | "metal_roof"
  | "concrete_roof"
  | "tile_roof"
  | "insulated_roof";

export interface MaterialPreset {
  id: MaterialId;
  label: string;
  /** Thermal conductivity λ in W/m·K */
  lambda: number;
  /** Default thickness in metres for wizard presets */
  defaultThicknessM: number;
  category: "wall" | "roof" | "window" | "insulation" | "finish";
  /** Approximate density kg/m³ for mass estimates (documented assumption where noted) */
  densityKgPerM3?: number;
  /** Embodied carbon: kg CO2e per kg OR per m² depending on coefficientType */
  embodiedCarbon?: number;
  coefficientType?: "per_kg" | "per_m2";
  source: string;
}

/**
 * λ values for common construction materials (W/m·K).
 * Brick/concrete/gypsum/insulation values from standard building-science tables
 * (CIBSE Guide A / ASHRAE Fundamentals ranges — mid-range tabulated values).
 */
export const MATERIAL_PRESETS: Record<MaterialId, MaterialPreset> = {
  brick_common: {
    id: "brick_common",
    label: "Brick (common)",
    lambda: 0.77,
    defaultThicknessM: 0.1,
    category: "wall",
    densityKgPerM3: 1700,
    embodiedCarbon: 0.23,
    coefficientType: "per_kg",
    source: "Standard building science λ tables (CIBSE/ASHRAE mid-range)",
  },
  brick_engineering: {
    id: "brick_engineering",
    label: "Brick (engineering)",
    lambda: 1.31,
    defaultThicknessM: 0.1,
    category: "wall",
    densityKgPerM3: 2200,
    embodiedCarbon: 0.23,
    coefficientType: "per_kg",
    source: "Standard building science λ tables (CIBSE/ASHRAE mid-range)",
  },
  concrete_dense: {
    id: "concrete_dense",
    label: "Concrete (dense)",
    lambda: 1.75,
    defaultThicknessM: 0.15,
    category: "wall",
    densityKgPerM3: 2400,
    embodiedCarbon: 0.23,
    coefficientType: "per_kg",
    source: "Concrete block/panel 0.23 kg CO2e/kg (ICE database mid-range)",
  },
  concrete_lightweight: {
    id: "concrete_lightweight",
    label: "Concrete (lightweight)",
    lambda: 0.57,
    defaultThicknessM: 0.15,
    category: "wall",
    densityKgPerM3: 1400,
    embodiedCarbon: 0.23,
    coefficientType: "per_kg",
    source: "Standard building science λ tables + ICE mid-range",
  },
  gypsum_plaster: {
    id: "gypsum_plaster",
    label: "Gypsum plaster",
    lambda: 0.16,
    defaultThicknessM: 0.013,
    category: "finish",
    densityKgPerM3: 900,
    source: "Standard building science λ tables (CIBSE/ASHRAE mid-range)",
  },
  glass_wool: {
    id: "glass_wool",
    label: "Glass wool",
    lambda: 0.04,
    defaultThicknessM: 0.1,
    category: "insulation",
    densityKgPerM3: 20,
    embodiedCarbon: 3.21,
    coefficientType: "per_m2",
    source: "λ: building science tables; embodied: 3.21 kg CO2e/m² (published EPDs)",
  },
  rock_wool: {
    id: "rock_wool",
    label: "Rock wool",
    lambda: 0.035,
    defaultThicknessM: 0.1,
    category: "insulation",
    densityKgPerM3: 40,
    embodiedCarbon: 1.3,
    coefficientType: "per_m2",
    source: "λ: building science tables; embodied: 1.3 kg CO2e/m² (published EPDs)",
  },
  eps: {
    id: "eps",
    label: "EPS",
    lambda: 0.038,
    defaultThicknessM: 0.08,
    category: "insulation",
    densityKgPerM3: 20,
    source: "Standard building science λ tables (CIBSE/ASHRAE mid-range)",
  },
  xps: {
    id: "xps",
    label: "XPS",
    lambda: 0.033,
    defaultThicknessM: 0.08,
    category: "insulation",
    densityKgPerM3: 35,
    embodiedCarbon: 9.4,
    coefficientType: "per_m2",
    source: "λ: building science tables; embodied: 9.4 kg CO2e/m² (published EPDs)",
  },
  pir: {
    id: "pir",
    label: "PIR",
    lambda: 0.023,
    defaultThicknessM: 0.08,
    category: "insulation",
    densityKgPerM3: 30,
    source: "Standard building science λ tables (CIBSE/ASHRAE mid-range)",
  },
  single_pane_glass: {
    id: "single_pane_glass",
    label: "Single-pane glass",
    /** Effective λ for ~4mm glass used with default thickness → U≈5.8 after films */
    lambda: 1.0,
    defaultThicknessM: 0.004,
    category: "window",
    densityKgPerM3: 2500,
    source: "Glass λ ~1.0 W/m·K; U dominated by air films (documented assumption)",
  },
  double_pane_glass: {
    id: "double_pane_glass",
    label: "Double-pane glass",
    /** Effective assembly λ proxy for wizard indicator; U computed via fixed R override */
    lambda: 0.12,
    defaultThicknessM: 0.024,
    category: "window",
    densityKgPerM3: 2000,
    source: "Double glazing effective U ~2.8 W/m²K (documented assumption, mid-range)",
  },
  triple_pane_glass: {
    id: "triple_pane_glass",
    label: "Triple-pane glass",
    lambda: 0.07,
    defaultThicknessM: 0.036,
    category: "window",
    densityKgPerM3: 1800,
    source: "Triple glazing effective U ~1.6 W/m²K (documented assumption, mid-range)",
  },
  metal_roof: {
    id: "metal_roof",
    label: "Metal roof",
    lambda: 50,
    defaultThicknessM: 0.001,
    category: "roof",
    densityKgPerM3: 7800,
    source: "Steel λ ~50 W/m·K; U dominated by films/insulation (documented)",
  },
  concrete_roof: {
    id: "concrete_roof",
    label: "Concrete roof deck",
    lambda: 1.75,
    defaultThicknessM: 0.15,
    category: "roof",
    densityKgPerM3: 2400,
    embodiedCarbon: 0.23,
    coefficientType: "per_kg",
    source: "Dense concrete λ 1.75; embodied 0.23 kg CO2e/kg",
  },
  tile_roof: {
    id: "tile_roof",
    label: "Clay tile roof",
    lambda: 0.84,
    defaultThicknessM: 0.02,
    category: "roof",
    densityKgPerM3: 1900,
    source: "Clay tile λ mid-range (documented assumption)",
  },
  insulated_roof: {
    id: "insulated_roof",
    label: "Insulated roof assembly",
    lambda: 0.04,
    defaultThicknessM: 0.15,
    category: "roof",
    densityKgPerM3: 40,
    embodiedCarbon: 1.3,
    coefficientType: "per_m2",
    source: "Composite insulated roof proxy using rock-wool-range λ",
  },
};

/** Cement mid-range embodied carbon (kg CO2e/kg) — ICE database mid-range default */
export const CEMENT_EMBODIED_KG_PER_KG = 0.65;

/**
 * Air film thermal resistances (m²K/W).
 * Internal ~0.13, external ~0.04 (CIBSE Guide A / ISO 6946 conventional values).
 */
export const AIR_FILM_INTERNAL_R = 0.13;
export const AIR_FILM_EXTERNAL_R = 0.04;

/** Window assemblies use fixed effective U when layer math would misrepresent glazing gaps */
export const WINDOW_EFFECTIVE_U: Partial<Record<MaterialId, number>> = {
  single_pane_glass: 5.8,
  double_pane_glass: 2.8,
  triple_pane_glass: 1.6,
};

export const WALL_OPTIONS: MaterialId[] = [
  "brick_common",
  "brick_engineering",
  "concrete_dense",
  "concrete_lightweight",
];

export const ROOF_OPTIONS: MaterialId[] = [
  "metal_roof",
  "concrete_roof",
  "tile_roof",
  "insulated_roof",
];

export const WINDOW_OPTIONS: MaterialId[] = [
  "single_pane_glass",
  "double_pane_glass",
  "triple_pane_glass",
];

export const INSULATION_OPTIONS: MaterialId[] = [
  "glass_wool",
  "rock_wool",
  "eps",
  "xps",
  "pir",
];
