export type ClimateHour = { timestamp: string; outdoorTempC: number; solarIrradianceKWhM2: number };

export type HourlyBuildingInput = {
  envelopeU_W_m2K: number;
  envelopeAreaM2: number;
  ventilationM3s: number;
  infiltrationM3s: number;
  indoorTempC: number;
  hvacCapacityKW: number;
  hvacCOP: number;
  internalGainKW: number;
  solarGainFactorM2: number;
  tariffINRPerKWh: number;
  climate: ClimateHour[];
};

export type HourlyBuildingResult = {
  peakThermalLoadKW: number;
  peakElectricalPowerKW: number;
  annualCoolingEnergyKWh: number;
  annualCostINR: number;
  hoursOverCapacity: number;
  hoursWithCooling: number;
  averageCoolingLoadKW: number;
  unmetCoolingEnergyKWh: number;
  datasetHours: number;
};

function positive(name: string, value: number, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`${name} must be ${allowZero ? "non-negative" : "positive"}.`);
  return value;
}

export function simulateBuildingHourly(input: HourlyBuildingInput): HourlyBuildingResult {
  const envelopeUA = positive("Envelope UA", input.envelopeU_W_m2K) * positive("Envelope area", input.envelopeAreaM2);
  positive("Ventilation flow", input.ventilationM3s, true);
  positive("Infiltration flow", input.infiltrationM3s, true);
  positive("HVAC capacity", input.hvacCapacityKW);
  positive("HVAC COP", input.hvacCOP);
  positive("Tariff", input.tariffINRPerKWh, true);
  positive("Internal gain", input.internalGainKW, true);
  positive("Solar gain factor", input.solarGainFactorM2, true);
  if (!input.climate.length) throw new Error("A real hourly climate series is required for annual building energy calculation.");

  const AIR_DENSITY = 1.2;
  const AIR_CP = 1005;
  let peakLoad = 0;
  let peakPower = 0;
  let annualEnergy = 0;
  let hoursOverCapacity = 0;
  let hoursWithCooling = 0;
  let loadSum = 0;
  let unmet = 0;

  for (const hour of input.climate) {
    if (!Number.isFinite(hour.outdoorTempC)) continue;
    const deltaT = Math.max(hour.outdoorTempC - input.indoorTempC, 0);
    const envelopeKW = envelopeUA * deltaT / 1000;
    const airExchangeKW = (input.ventilationM3s + input.infiltrationM3s) * AIR_DENSITY * AIR_CP * deltaT / 1000;
    // NASA POWER's hourly ALLSKY_SFC_SW_DWN is energy density per hour (kWh/m²).
    // Multiplying by the user-supplied effective solar gain area keeps this term evidence anchored.
    const solarKW = hour.solarIrradianceKWhM2 * input.solarGainFactorM2;
    const totalKW = Math.max(0, envelopeKW + airExchangeKW + solarKW + input.internalGainKW);
    peakLoad = Math.max(peakLoad, totalKW);
    loadSum += totalKW;
    if (totalKW <= 0) continue;
    hoursWithCooling += 1;
    const requiredPowerKW = totalKW / input.hvacCOP;
    const deliveredLoadKW = Math.min(totalKW, input.hvacCapacityKW);
    const deliveredPowerKW = deliveredLoadKW / input.hvacCOP;
    annualEnergy += deliveredPowerKW;
    peakPower = Math.max(peakPower, deliveredPowerKW);
    if (totalKW > input.hvacCapacityKW) {
      hoursOverCapacity += 1;
      unmet += totalKW - input.hvacCapacityKW;
      // Preserve the distinction between requested cooling and what the installed capacity can provide.
      void requiredPowerKW;
    }
  }

  const annualCostINR = annualEnergy * input.tariffINRPerKWh;
  return {
    peakThermalLoadKW: peakLoad,
    peakElectricalPowerKW: peakPower,
    annualCoolingEnergyKWh: annualEnergy,
    annualCostINR,
    hoursOverCapacity,
    hoursWithCooling,
    averageCoolingLoadKW: input.climate.length ? loadSum / input.climate.length : 0,
    unmetCoolingEnergyKWh: unmet,
    datasetHours: input.climate.length,
  };
}
