/**
 * Operating conditions — schedules extensible; no single hardcoded multiplier.
 */

import type { ProvenancedValue } from "./provenance";
import { unknownValue } from "./provenance";
import type { MoneyAmount } from "./units";

export interface DayScheduleBlock {
  /** 0–23 */
  startHour: number;
  endHour: number;
  occupiedFraction: number;
}

export interface WeeklyOccupancySchedule {
  /** monday…sunday */
  days: Record<
    "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
    DayScheduleBlock[]
  >;
}

export interface OperatingProfile {
  occupancyProfile: ProvenancedValue<string>;
  occupancySchedule: ProvenancedValue<WeeklyOccupancySchedule>;
  operatingHoursNotes: ProvenancedValue<string>;
  comfortTempC: ProvenancedValue<number>;
  comfortTempBandC: ProvenancedValue<number>;
  annualEnergyKWh: ProvenancedValue<number>;
  utilityTariffNotes: ProvenancedValue<string>;
  utilityRate: ProvenancedValue<MoneyAmount>;
  operationalBehaviorNotes: ProvenancedValue<string>;
  /** ACH if known — never invented */
  ach: ProvenancedValue<number>;
  /** Window SHGC 0–1 if known */
  shgc: ProvenancedValue<number>;
}

export function emptyWeeklySchedule(): WeeklyOccupancySchedule {
  const emptyDay: DayScheduleBlock[] = [];
  return {
    days: {
      mon: emptyDay,
      tue: emptyDay,
      wed: emptyDay,
      thu: emptyDay,
      fri: emptyDay,
      sat: emptyDay,
      sun: emptyDay,
    },
  };
}

export function emptyOperatingProfile(): OperatingProfile {
  return {
    occupancyProfile: unknownValue(),
    occupancySchedule: unknownValue(),
    operatingHoursNotes: unknownValue(),
    comfortTempC: unknownValue(),
    comfortTempBandC: unknownValue(),
    annualEnergyKWh: unknownValue(),
    utilityTariffNotes: unknownValue(),
    utilityRate: unknownValue(),
    operationalBehaviorNotes: unknownValue(),
    ach: unknownValue(),
    shgc: unknownValue(),
  };
}
