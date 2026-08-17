/**
 * Unit conversion utilities — internal SI-ish engineering units.
 * area→m², capacity/power→kW, temperature→°C, energy→kWh. Currency separate.
 */

export type AreaUnit = "m2" | "ft2";
export type CapacityUnit = "kW" | "ton" | "BTU/h";
export type TemperatureUnit = "C" | "F";
export type EnergyUnit = "kWh" | "MWh" | "BTU";
export type PowerUnit = "kW" | "W";

const FT2_PER_M2 = 10.76391041671;
const KW_PER_TON = 3.517;
const KW_PER_BTUH = 0.00029307107;
const KWH_PER_BTU = 0.00029307107;

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitConversionError";
  }
}

function assertFinite(n: number, label: string): void {
  if (!Number.isFinite(n)) {
    throw new UnitConversionError(`Invalid ${label}: not finite`);
  }
}

export function toSquareMeters(value: number, unit: AreaUnit): number {
  assertFinite(value, "area");
  if (value < 0) throw new UnitConversionError("Area cannot be negative");
  if (value === 0) return 0;
  if (unit === "m2") return value;
  return value / FT2_PER_M2;
}

export function fromSquareMeters(m2: number, unit: AreaUnit): number {
  assertFinite(m2, "area");
  if (unit === "m2") return m2;
  return m2 * FT2_PER_M2;
}

export function toKilowatts(value: number, unit: CapacityUnit | PowerUnit): number {
  assertFinite(value, "capacity/power");
  if (value < 0) throw new UnitConversionError("Capacity/power cannot be negative");
  switch (unit) {
    case "kW":
      return value;
    case "W":
      return value / 1000;
    case "ton":
      return value * KW_PER_TON;
    case "BTU/h":
      return value * KW_PER_BTUH;
    default:
      throw new UnitConversionError(`Unsupported capacity unit: ${unit}`);
  }
}

export function fromKilowatts(kW: number, unit: CapacityUnit | PowerUnit): number {
  assertFinite(kW, "capacity/power");
  switch (unit) {
    case "kW":
      return kW;
    case "W":
      return kW * 1000;
    case "ton":
      return kW / KW_PER_TON;
    case "BTU/h":
      return kW / KW_PER_BTUH;
    default:
      throw new UnitConversionError(`Unsupported capacity unit: ${unit}`);
  }
}

export function toCelsius(value: number, unit: TemperatureUnit): number {
  assertFinite(value, "temperature");
  if (unit === "C") {
    if (value < -273.15) {
      throw new UnitConversionError("Temperature below absolute zero");
    }
    return value;
  }
  if (value < -459.67) {
    throw new UnitConversionError("Temperature below absolute zero");
  }
  return ((value - 32) * 5) / 9;
}

export function fromCelsius(c: number, unit: TemperatureUnit): number {
  assertFinite(c, "temperature");
  if (c < -273.15) throw new UnitConversionError("Temperature below absolute zero");
  if (unit === "C") return c;
  return (c * 9) / 5 + 32;
}

export function toKilowattHours(value: number, unit: EnergyUnit): number {
  assertFinite(value, "energy");
  if (value < 0) throw new UnitConversionError("Energy cannot be negative");
  switch (unit) {
    case "kWh":
      return value;
    case "MWh":
      return value * 1000;
    case "BTU":
      return value * KWH_PER_BTU;
    default:
      throw new UnitConversionError(`Unsupported energy unit: ${unit}`);
  }
}

/** Currency is never converted into engineering units */
export type CurrencyCode = string;

export interface MoneyAmount {
  amount: number;
  currency: CurrencyCode;
}
