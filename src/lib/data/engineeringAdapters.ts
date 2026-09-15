/**
 * Engineering-facing adapter specifications for datasets available to OVERHAUL.
 *
 * These mappings are intentionally conservative. A source field is promoted into
 * a physical engineering quantity only when the source semantics are explicit.
 * Encoded ResStock/RESCAST option values remain categorical evidence until a
 * verified option/code lookup has been applied.
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
      "Fault labels are diagnostic evidence; they do not by themselves establish root-cause severity.",
      "Do not treat a dataset fault label as a live measurement for another facility without provenance.",
    ],
  },
  {
    id: "rescast-building",
    domain: "building",
    subjectType: "building",
    pathPatterns: ["rescast", "house_features"],
    fields: [
      { canonical: "buildingId", aliases: ["bldg_id", "building_id", "home_id", "house_id", "id"], kind: "identifier" },
      { canonical: "latitude", aliases: ["build_existing_model.weather_file_latitude", "weather_file_latitude"], kind: "location" },
      { canonical: "longitude", aliases: ["build_existing_model.weather_file_longitude", "weather_file_longitude"], kind: "location" },
      { canonical: "bedrooms", aliases: ["build_existing_model.bedrooms", "bedrooms"], kind: "measurement" },
      { canonical: "stories", aliases: ["build_existing_model.geometry_stories", "geometry_stories"], kind: "measurement" },
      { canonical: "climateZone", aliases: ["build_existing_model.ashrae_iecc_climate_zone_2004", "ashrae_iecc_climate_zone_2004"], kind: "category" },
      { canonical: "climateZoneSubcategory", aliases: ["build_existing_model.ashrae_iecc_climate_zone_2004_2_a_split", "ashrae_iecc_climate_zone_2004_2_a_split"], kind: "category" },
      { canonical: "buildingAmericaClimateZone", aliases: ["build_existing_model.building_america_climate_zone", "building_america_climate_zone"], kind: "category" },
      { canonical: "buildingType", aliases: ["build_existing_model.geometry_building_type_acs", "geometry_building_type_acs"], kind: "category" },
      { canonical: "floorAreaOption", aliases: ["build_existing_model.geometry_floor_area", "geometry_floor_area"], kind: "category" },
      { canonical: "floorAreaBin", aliases: ["build_existing_model.geometry_floor_area_bin", "geometry_floor_area_bin"], kind: "category" },
      { canonical: "foundationType", aliases: ["build_existing_model.geometry_foundation_type", "geometry_foundation_type"], kind: "category" },
      { canonical: "wallType", aliases: ["build_existing_model.geometry_wall_type", "geometry_wall_type"], kind: "category" },
      { canonical: "wallExteriorFinish", aliases: ["build_existing_model.geometry_wall_exterior_finish", "geometry_wall_exterior_finish"], kind: "category" },
      { canonical: "coolingSystem", aliases: ["build_existing_model.hvac_cooling_type", "hvac_cooling_type"], kind: "category" },
      { canonical: "heatingSystem", aliases: ["build_existing_model.hvac_heating_type", "hvac_heating_type"], kind: "category" },
      { canonical: "heatingSystemAndFuel", aliases: ["build_existing_model.hvac_heating_type_and_fuel", "hvac_heating_type_and_fuel"], kind: "category" },
      { canonical: "heatingFuel", aliases: ["build_existing_model.heating_fuel", "heating_fuel"], kind: "category" },
      { canonical: "sharedHVACSystem", aliases: ["build_existing_model.hvac_has_shared_system", "hvac_has_shared_system"], kind: "category" },
      { canonical: "ceilingInsulation", aliases: ["build_existing_model.insulation_ceiling", "insulation_ceiling"], kind: "category" },
      { canonical: "floorInsulation", aliases: ["build_existing_model.insulation_floor", "insulation_floor"], kind: "category" },
      { canonical: "foundationWallInsulation", aliases: ["build_existing_model.insulation_foundation_wall", "insulation_foundation_wall"], kind: "category" },
      { canonical: "rimJoistInsulation", aliases: ["build_existing_model.insulation_rim_joist", "insulation_rim_joist"], kind: "category" },
      { canonical: "roofInsulation", aliases: ["build_existing_model.insulation_roof", "insulation_roof"], kind: "category" },
      { canonical: "slabInsulation", aliases: ["build_existing_model.insulation_slab", "insulation_slab"], kind: "category" },
      { canonical: "wallInsulation", aliases: ["build_existing_model.insulation_wall", "insulation_wall"], kind: "category" },
      { canonical: "windowOption", aliases: ["build_existing_model.windows", "windows"], kind: "category" },
      { canonical: "windowAreaOption", aliases: ["build_existing_model.window_areas", "window_areas"], kind: "category" },
      { canonical: "occupantsOption", aliases: ["build_existing_model.occupants", "occupants"], kind: "category" },
      { canonical: "orientation", aliases: ["build_existing_model.orientation", "orientation"], kind: "category" },
      { canonical: "vintage", aliases: ["build_existing_model.vintage", "vintage"], kind: "category" },
    ],
    notes: [
      "RESCAST static fields are primarily encoded housing-characteristic options; numeric codes must not be interpreted as SI engineering quantities without the verified option lookup.",
      "Use verified decoded options as priors/context for engineering reconstruction, not as substitutes for direct user evidence.",
      "The dataset also has separate 15-minute time-series variables for electricity, indoor/outdoor temperature, setpoints, humidity, solar radiation and wind; those are stronger candidates for behavioral calibration when linked to a building record.",
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
      "Cost, savings, lifetime and carbon units must be confirmed from source metadata before optimization.",
    ],
  },
];

export function findEngineeringAdapter(path: string): EngineeringAdapterSpec | undefined {
  const lower = path.toLowerCase();
  return ENGINEERING_ADAPTERS.find((adapter) =>
    adapter.pathPatterns.some((pattern) => lower.includes(pattern.toLowerCase())),
  );
}
