/**
 * Engineering-facing adapter specifications for the datasets available locally.
 * These mappings are intentionally conservative: a field is promoted into the
 * engineering model only when its name/semantics are explicit enough to support
 * the downstream calculation. Raw columns remain auditable through provenance.
 */

export type EngineeringDomain =
  | "climate"
  | "building"
  | "hvac"
  | "retrofit"
  | "materials"
  | "geometry";

export interface AdapterFieldSpec {
  canonical: string;
  aliases: string[];
  unit?: string;
  kind: "measurement" | "identifier" | "category" | "location" | "timestamp";
}

export interface EngineeringAdapterSpec {
  id: string;
  domain: EngineeringDomain;
  subjectType: "building" | "facility" | "equipment";
  pathPatterns: string[];
  fields: AdapterFieldSpec[];
  notes: string[];
}

export const ENGINEERING_ADAPTERS: EngineeringAdapterSpec[] = [
  {
    id: "nasa-power-climate",
    domain: "climate",
    subjectType: "building",
    pathPatterns: ["POWER_Point_Hourly", "POWER_Global_Zones", "climate"],
    fields: [
      { canonical: "timestamp", aliases: ["timestamp", "date", "time", "datetime"], kind: "timestamp" },
      { canonical: "latitude", aliases: ["latitude", "lat"], kind: "location" },
      { canonical: "longitude", aliases: ["longitude", "lon", "lng"], kind: "location" },
      { canonical: "temperatureC", aliases: ["T2M", "temperature", "temperature_c", "temp"], unit: "°C", kind: "measurement" },
      { canonical: "relativeHumidity", aliases: ["RH2M", "relative_humidity", "humidity", "rh"], unit: "%", kind: "measurement" },
      { canonical: "shortwaveRadiation", aliases: ["ALLSKY_SFC_SW_DWN", "shortwave_radiation", "solar_radiation"], unit: "kW/m²", kind: "measurement" },
      { canonical: "windSpeed", aliases: ["WS2M", "wind_speed"], unit: "m/s", kind: "measurement" },
    ],
    notes: [
      "Use climate records as boundary conditions, not as proof of building performance.",
      "Preserve source period and temporal resolution in provenance.",
    ],
  },
  {
    id: "lbnl-fdd-hvac",
    domain: "hvac",
    subjectType: "equipment",
    pathPatterns: ["LBNL", "RTU", "AHU", "DDAHU", "SDAHU", "FCU", "Chiller", "Boiler"],
    fields: [
      { canonical: "timestamp", aliases: ["timestamp", "date", "datetime", "time"], kind: "timestamp" },
      { canonical: "equipmentId", aliases: ["equipment_id", "unit_id", "asset_id", "id"], kind: "identifier" },
      { canonical: "powerKw", aliases: ["power_kw", "power", "electric_power_kw", "kw"], unit: "kW", kind: "measurement" },
      { canonical: "coolingLoadKw", aliases: ["cooling_load_kw", "cooling_load", "load_kw"], unit: "kW", kind: "measurement" },
      { canonical: "supplyTempC", aliases: ["supply_temp_c", "supply_temperature", "sat", "supply_air_temp"], unit: "°C", kind: "measurement" },
      { canonical: "returnTempC", aliases: ["return_temp_c", "return_temperature", "rat", "return_air_temp"], unit: "°C", kind: "measurement" },
      { canonical: "flowRate", aliases: ["flow_rate", "airflow", "water_flow", "flow"], kind: "measurement" },
      { canonical: "faultState", aliases: ["fault", "fault_state", "fault_code", "alarm"], kind: "category" },
    ],
    notes: [
      "Fault labels are diagnostic evidence; they do not by themselves establish root cause severity.",
      "Do not treat a dataset fault label as a live measurement for another facility without provenance.",
    ],
  },
  {
    id: "rescast-building",
    domain: "building",
    subjectType: "building",
    pathPatterns: ["rescast", "house_features"],
    fields: [
      { canonical: "buildingId", aliases: ["building_id", "home_id", "house_id", "id"], kind: "identifier" },
      { canonical: "floorAreaM2", aliases: ["floor_area", "floor_area_m2", "conditioned_floor_area"], unit: "m²", kind: "measurement" },
      { canonical: "occupants", aliases: ["occupants", "occupancy", "number_of_occupants"], kind: "measurement" },
      { canonical: "annualEnergyKwh", aliases: ["annual_energy", "annual_energy_kwh", "site_energy"], unit: "kWh", kind: "measurement" },
      { canonical: "heatingSystem", aliases: ["heating_system", "heating_equipment"], kind: "category" },
      { canonical: "coolingSystem", aliases: ["cooling_system", "cooling_equipment"], kind: "category" },
      { canonical: "wallAreaM2", aliases: ["wall_area", "wall_area_m2"], unit: "m²", kind: "measurement" },
      { canonical: "windowAreaM2", aliases: ["window_area", "window_area_m2", "glazing_area"], unit: "m²", kind: "measurement" },
    ],
    notes: [
      "Use the building dataset for statistical priors and validation; do not silently substitute a stock archetype for user evidence.",
    ],
  },
  {
    id: "remdb-retrofit",
    domain: "retrofit",
    subjectType: "building",
    pathPatterns: ["REMDB", "remdb", "retrofit"],
    fields: [
      { canonical: "measureId", aliases: ["measure_id", "id", "measure"], kind: "identifier" },
      { canonical: "measureName", aliases: ["measure_name", "name", "retrofit"], kind: "category" },
      { canonical: "firstCost", aliases: ["first_cost", "cost", "initial_cost"], kind: "measurement" },
      { canonical: "annualSavings", aliases: ["annual_savings", "energy_savings", "savings"], kind: "measurement" },
      { canonical: "lifeYears", aliases: ["life_years", "lifetime", "useful_life"], unit: "yr", kind: "measurement" },
      { canonical: "embodiedCarbon", aliases: ["embodied_carbon", "ghg", "co2e"], kind: "measurement" },
    ],
    notes: [
      "Cost, savings, lifetime and carbon units must be confirmed from the source metadata before optimization.",
    ],
  },
];

export function findEngineeringAdapter(path: string): EngineeringAdapterSpec | undefined {
  const lower = path.toLowerCase();
  return ENGINEERING_ADAPTERS.find((adapter) =>
    adapter.pathPatterns.some((pattern) => lower.includes(pattern.toLowerCase())),
  );
}
