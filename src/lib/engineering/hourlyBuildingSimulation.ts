export type ClimateHour = { timestamp: string; outdoorTempC: number; outdoorRHPercent: number; surfacePressureKPa: number; solarIrradianceKWhM2: number };

export type HourlyBuildingInput = {
  envelopeU_W_m2K: number;
  envelopeAreaM2: number;
  ventilationM3s: number;
  infiltrationM3s: number;
  indoorTempC: number;
  indoorRHPercent: number;
  hvacCapacityKW: number;
  hvacCOP: number;
  internalGainKW: number;
  solarGainFactorM2: number;
  tariffINRPerKWh: number;
  climate: ClimateHour[];
  /** Explicit measured/modelled HVAC fan/pump/auxiliary electrical draw while cooling. */
  hvacAuxiliaryPowerKW?: number;
};

export type HourlyBuildingResult = {
  peakThermalLoadKW: number;
  peakElectricalPowerKW: number;
  annualCoolingEnergyKWh: number;
  annualAuxiliaryEnergyKWh: number;
  annualCostINR: number;
  hoursOverCapacity: number;
  hoursWithCooling: number;
  averageCoolingLoadKW: number;
  unmetCoolingEnergyKWh: number;
  datasetHours: number;
  sensibleCoolingEnergyKWh: number;
  latentCoolingEnergyKWh: number;
};

function positive(name: string, value: number, allowZero = false) { if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`${name} must be ${allowZero ? "non-negative" : "positive"}.`); return value; }
function saturationPressureKPa(tempC: number) { return 0.61078 * Math.exp((17.2694 * tempC) / (tempC + 237.29)); }
function humidityRatio(tempC: number, rhPercent: number, pressureKPa: number) {
  if (!Number.isFinite(rhPercent) || rhPercent < 0 || rhPercent > 100) throw new Error("Relative humidity must be between 0 and 100%.");
  positive("Surface pressure", pressureKPa);
  const vaporPressure = Math.min(saturationPressureKPa(tempC) * (rhPercent / 100), pressureKPa * 0.999);
  return 0.621945 * vaporPressure / Math.max(pressureKPa - vaporPressure, 1e-6);
}

export function simulateBuildingHourly(input: HourlyBuildingInput): HourlyBuildingResult {
  const envelopeUA = positive("Envelope U-value", input.envelopeU_W_m2K) * positive("Envelope area", input.envelopeAreaM2);
  positive("Ventilation flow", input.ventilationM3s, true);
  positive("Infiltration flow", input.infiltrationM3s, true);
  positive("Indoor temperature", input.indoorTempC);
  if (!Number.isFinite(input.indoorRHPercent) || input.indoorRHPercent < 0 || input.indoorRHPercent > 100) throw new Error("Indoor relative humidity must be between 0 and 100%.");
  positive("HVAC capacity", input.hvacCapacityKW);
  positive("HVAC COP", input.hvacCOP);
  positive("Tariff", input.tariffINRPerKWh, true);
  positive("Internal gain", input.internalGainKW, true);
  positive("Solar gain factor", input.solarGainFactorM2, true);
  const auxiliaryPowerKW = positive("HVAC auxiliary power", input.hvacAuxiliaryPowerKW ?? 0, true);
  if (input.climate.length < 8000) throw new Error("A complete annual hourly climate series is required for annual building energy calculation.");

  const AIR_DENSITY = 1.2;
  const AIR_CP_KJ_PER_KG_K = 1.005;
  let peakLoad = 0;
  let peakPower = 0;
  let annualEnergy = 0;
  let annualAuxiliaryEnergy = 0;
  let sensibleEnergy = 0;
  let latentEnergy = 0;
  let hoursOverCapacity = 0;
  let hoursWithCooling = 0;
  let loadSum = 0;
  let unmet = 0;

  for (const hour of input.climate) {
    if (!Number.isFinite(hour.outdoorTempC) || !Number.isFinite(hour.outdoorRHPercent) || !Number.isFinite(hour.surfacePressureKPa) || !Number.isFinite(hour.solarIrradianceKWhM2) || hour.solarIrradianceKWhM2 < 0) throw new Error("Climate series contains invalid boundary-condition data.");
    const deltaT = Math.max(hour.outdoorTempC - input.indoorTempC, 0);
    const envelopeKW = envelopeUA * deltaT / 1000;
    const flowM3s = input.ventilationM3s + input.infiltrationM3s;
    const airExchangeSensibleKW = flowM3s * AIR_DENSITY * AIR_CP_KJ_PER_KG_K * deltaT;
    const outdoorW = humidityRatio(hour.outdoorTempC, hour.outdoorRHPercent, hour.surfacePressureKPa);
    const indoorW = humidityRatio(input.indoorTempC, input.indoorRHPercent, hour.surfacePressureKPa);
    const moistureDelta = Math.max(outdoorW - indoorW, 0);
    const latentHeatKJPerKg = 2501 - 2.381 * Math.max(-20, Math.min(50, input.indoorTempC));
    const airExchangeLatentKW = flowM3s * AIR_DENSITY * moistureDelta * latentHeatKJPerKg;
    const solarKW = hour.solarIrradianceKWhM2 * input.solarGainFactorM2;
    const sensibleLoadKW = envelopeKW + airExchangeSensibleKW + solarKW + input.internalGainKW;
    const totalKW = Math.max(0, sensibleLoadKW + airExchangeLatentKW);
    peakLoad = Math.max(peakLoad, totalKW);
    loadSum += totalKW;
    if (totalKW <= 0) continue;
    hoursWithCooling += 1;
    sensibleEnergy += sensibleLoadKW;
    latentEnergy += airExchangeLatentKW;
    const deliveredLoadKW = Math.min(totalKW, input.hvacCapacityKW);
    const compressorPowerKW = deliveredLoadKW / input.hvacCOP;
    annualEnergy += compressorPowerKW;
    annualAuxiliaryEnergy += auxiliaryPowerKW;
    peakPower = Math.max(peakPower, compressorPowerKW + auxiliaryPowerKW);
    if (totalKW > input.hvacCapacityKW) { hoursOverCapacity += 1; unmet += totalKW - input.hvacCapacityKW; }
  }

  const annualElectricalEnergyKWh = annualEnergy + annualAuxiliaryEnergy;
  return {
    peakThermalLoadKW: peakLoad,
    peakElectricalPowerKW: peakPower,
    annualCoolingEnergyKWh: annualElectricalEnergyKWh,
    annualAuxiliaryEnergyKWh: annualAuxiliaryEnergy,
    annualCostINR: annualElectricalEnergyKWh * input.tariffINRPerKWh,
    hoursOverCapacity,
    hoursWithCooling,
    averageCoolingLoadKW: loadSum / input.climate.length,
    unmetCoolingEnergyKWh: unmet,
    datasetHours: input.climate.length,
    sensibleCoolingEnergyKWh: sensibleEnergy,
    latentCoolingEnergyKWh: latentEnergy,
  };
}
