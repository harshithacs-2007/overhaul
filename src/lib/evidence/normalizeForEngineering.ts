export type EngineeringObservation = {
  field: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  confidence: number;
  sourceText?: string;
  notes?: string;
};

const FIELD_ALIASES: Record<string, string> = {
  rated_capacity_kw: "capacity_kw",
  hvac_capacity_kw: "capacity_kw",
  rated_capacity: "capacity_kw",
  input_power_kw: "power_kw",
  electrical_power_kw: "power_kw",
  operating_power_kw: "power_kw",
  operating_load_kw: "load_kw",
  cooling_load_kw: "load_kw",
  hvac_load_kw: "load_kw",
  runtime_hours: "annual_hours",
  annual_runtime_hours: "annual_hours",
  cooling_hours: "annual_cooling_hours",
  tariff_inr_per_kwh: "electricity_rate_inr_per_kwh",
  electricity_rate: "electricity_rate_inr_per_kwh",
  r_value_m2k_w: "existing_r_value_m2k_w",
};

function canonical(field: string) {
  return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}

function unitKey(unit: string | null) {
  return (unit || "").toLowerCase().replace(/\s+/g, "").replace(/²/g, "2");
}

function convert(value: number, unit: string | null): { value: number; unit: string } | null {
  const u = unitKey(unit);
  if (u === "kw") return { value, unit: "kW" };
  if (u === "w") return { value: value / 1000, unit: "kW" };
  if (u === "mw") return { value: value * 1000, unit: "kW" };
  if (u === "hp" || u === "bhp") return { value: value * 0.745699872, unit: "kW" };
  if (["h", "hr", "hrs", "hour", "hours"].includes(u)) return { value, unit: "h/yr" };
  if (["min", "mins", "minute", "minutes"].includes(u)) return { value: value / 60, unit: "h/yr" };
  return null;
}

export function normalizeObservationForEngineering(observation: EngineeringObservation): EngineeringObservation {
  const originalField = canonical(observation.field);
  const alias = FIELD_ALIASES[originalField];
  let field = alias || originalField;
  let numericValue = observation.numericValue;
  let unit = observation.unit;

  if (numericValue != null && Number.isFinite(numericValue)) {
    const converted = convert(numericValue, unit);
    const needsPowerUnit = ["capacity_kw", "power_kw", "load_kw"].includes(field);
    const needsHourUnit = ["annual_hours", "annual_cooling_hours"].includes(field);

    if (converted && (needsPowerUnit || needsHourUnit)) {
      numericValue = converted.value;
      unit = converted.unit;
    } else if (needsPowerUnit && unitKey(unit) && !["kw", "w", "mw", "hp", "bhp"].includes(unitKey(unit))) {
      field = originalField;
      numericValue = observation.numericValue;
    } else if (needsHourUnit && unitKey(unit) && !["h", "hr", "hrs", "hour", "hours", "min", "mins", "minute", "minutes"].includes(unitKey(unit))) {
      field = originalField;
      numericValue = observation.numericValue;
    }
  }

  return {
    ...observation,
    field,
    numericValue,
    unit,
    notes: [observation.notes, field !== originalField ? `Canonicalized from ${originalField}.` : ""].filter(Boolean).join(" "),
  };
}

export function normalizeExtractionObservations<T extends { observations?: EngineeringObservation[] }>(extraction: T): T {
  return {
    ...extraction,
    observations: (extraction.observations || []).map(normalizeObservationForEngineering),
  };
}
