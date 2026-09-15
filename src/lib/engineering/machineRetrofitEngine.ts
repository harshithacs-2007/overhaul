export type MachineClass =
  | "air_conditioner"
  | "chiller"
  | "compressor"
  | "pump"
  | "fan"
  | "motor"
  | "boiler"
  | "cooling_tower"
  | "refrigeration"
  | "process_equipment";

export type MachineMetric = "efficiency" | "flow" | "pressure" | "temperature" | "runtime" | "capacity";

export type MachineEvidence = {
  machineClass: MachineClass;
  confidence: "identified" | "provided" | "measured";
  basis: string;
};

export type MachinePathway = {
  id: string;
  title: string;
  mechanism: string;
  required: MachineMetric[];
  optional: MachineMetric[];
  expectedTargets: string[];
};

const PATHWAYS: Record<MachineClass, MachinePathway[]> = {
  air_conditioner: [
    { id: "ac-efficiency", title: "AC efficiency / COP upgrade", mechanism: "Reduce electrical input for the same established cooling duty using an explicit COP/EER or efficiency target.", required: ["efficiency", "capacity"], optional: ["runtime", "temperature"], expectedTargets: ["COP/EER", "input power"] },
    { id: "ac-runtime", title: "AC controls / runtime optimisation", mechanism: "Reduce unnecessary runtime only when operating hours and the controlled schedule are evidenced.", required: ["capacity", "runtime"], optional: ["efficiency", "temperature"], expectedTargets: ["runtime hours", "setpoint", "load fraction"] },
  ],
  chiller: [
    { id: "chiller-efficiency", title: "Chiller efficiency upgrade", mechanism: "Reduce electrical input for the same cooling duty using an explicit COP/EER target.", required: ["efficiency", "capacity"], optional: ["runtime", "temperature"], expectedTargets: ["COP/EER", "kW/RT if explicitly supplied"] },
    { id: "chiller-sequencing", title: "Chiller staging & sequencing", mechanism: "Shift duty across units using measured load, runtime and part-load evidence rather than assumed savings.", required: ["capacity", "runtime"], optional: ["efficiency", "temperature"], expectedTargets: ["runtime hours", "load fraction", "plant sequence"] },
  ],
  compressor: [
    { id: "compressor-efficiency", title: "Compressor efficiency retrofit", mechanism: "Compare input power to an explicit reference efficiency at the observed duty.", required: ["efficiency", "capacity"], optional: ["flow", "pressure", "runtime"], expectedTargets: ["specific power", "kW", "efficiency"] },
    { id: "compressor-controls", title: "Compressor controls / setpoint optimisation", mechanism: "Evaluate pressure/setpoint and runtime changes using measured operating evidence.", required: ["pressure", "runtime"], optional: ["flow", "efficiency"], expectedTargets: ["discharge pressure", "runtime", "load fraction"] },
  ],
  pump: [
    { id: "pump-rightsizing", title: "Pump right-sizing / impeller study", mechanism: "Use duty flow and pressure with an explicit pump curve to test operating-point movement.", required: ["flow", "pressure", "capacity"], optional: ["efficiency", "runtime"], expectedTargets: ["flow", "head/pressure", "efficiency"] },
    { id: "pump-vfd", title: "Pump speed / VFD pathway", mechanism: "Test a changed operating point only when flow, pressure and pump reference behavior are available.", required: ["flow", "pressure"], optional: ["efficiency", "runtime"], expectedTargets: ["speed", "flow", "pressure"] },
  ],
  fan: [
    { id: "fan-vfd", title: "Fan speed / VFD optimisation", mechanism: "Evaluate reduced speed against measured flow/pressure and an explicit performance relationship.", required: ["flow", "pressure"], optional: ["efficiency", "runtime"], expectedTargets: ["airflow", "static pressure", "speed"] },
    { id: "fan-efficiency", title: "Fan efficiency upgrade", mechanism: "Reduce shaft/input power at the evidence-defined airflow duty.", required: ["flow", "efficiency"], optional: ["pressure", "runtime"], expectedTargets: ["efficiency", "input power"] },
  ],
  motor: [
    { id: "motor-efficiency", title: "High-efficiency motor replacement", mechanism: "Hold the supplied mechanical duty while changing only the explicit motor efficiency.", required: ["efficiency", "capacity"], optional: ["runtime"], expectedTargets: ["efficiency", "input power"] },
    { id: "motor-controls", title: "Motor load / controls optimisation", mechanism: "Separate motor sizing and operating schedule from replacement decisions.", required: ["capacity", "runtime"], optional: ["efficiency"], expectedTargets: ["load fraction", "runtime"] },
  ],
  boiler: [
    { id: "boiler-efficiency", title: "Boiler efficiency improvement", mechanism: "Compare useful thermal output with explicit fuel/input efficiency evidence.", required: ["efficiency", "capacity"], optional: ["runtime", "temperature"], expectedTargets: ["thermal efficiency", "fuel input"] },
    { id: "boiler-controls", title: "Boiler controls / sequencing", mechanism: "Evaluate cycling and operating-hour changes from measured runtime and setpoint evidence.", required: ["runtime", "capacity"], optional: ["efficiency", "temperature"], expectedTargets: ["runtime", "setpoint", "cycling"] },
  ],
  cooling_tower: [
    { id: "tower-fan", title: "Cooling-tower fan optimisation", mechanism: "Test airflow/fan-power changes from explicit operating measurements or curves.", required: ["flow", "runtime"], optional: ["efficiency", "temperature"], expectedTargets: ["airflow", "fan input power", "runtime"] },
    { id: "tower-approach", title: "Cooling-tower approach / controls study", mechanism: "Use measured temperature approach and fan operation to evaluate control changes.", required: ["temperature", "runtime"], optional: ["flow", "efficiency"], expectedTargets: ["approach temperature", "runtime"] },
  ],
  refrigeration: [
    { id: "refrigeration-efficiency", title: "Refrigeration efficiency upgrade", mechanism: "Change only the explicit efficiency/COP relationship while preserving the established cooling duty.", required: ["efficiency", "capacity"], optional: ["temperature", "runtime"], expectedTargets: ["COP", "input power"] },
    { id: "refrigeration-controls", title: "Suction/condensing controls study", mechanism: "Evaluate temperature/setpoint changes when measured conditions are available.", required: ["temperature", "runtime"], optional: ["efficiency", "capacity"], expectedTargets: ["suction temperature", "condensing temperature", "runtime"] },
  ],
  process_equipment: [
    { id: "process-efficiency", title: "Process equipment efficiency retrofit", mechanism: "Reduce input power or fuel per unit of established output using measured or manufacturer reference evidence.", required: ["efficiency", "capacity"], optional: ["flow", "pressure", "runtime", "temperature"], expectedTargets: ["specific energy", "input power", "output"] },
    { id: "process-controls", title: "Process controls / operating-point optimisation", mechanism: "Move the operating point only from measured duty and process constraints.", required: ["capacity", "runtime"], optional: ["flow", "pressure", "temperature", "efficiency"], expectedTargets: ["duty", "runtime", "setpoint"] },
  ],
};

const ALIASES: Record<string, MachineClass> = {
  ac: "air_conditioner",
  air_conditioner: "air_conditioner",
  airconditioning: "air_conditioner",
  air_conditioning: "air_conditioner",
  hvac: "air_conditioner",
  chiller: "chiller",
  centrifugal_chiller: "chiller",
  screw_chiller: "chiller",
  compressor: "compressor",
  air_compressor: "compressor",
  pump: "pump",
  centrifugal_pump: "pump",
  fan: "fan",
  blower: "fan",
  motor: "motor",
  induction_motor: "motor",
  boiler: "boiler",
  steam_boiler: "boiler",
  cooling_tower: "cooling_tower",
  refrigeration: "refrigeration",
  refrigerator: "refrigeration",
  freezer: "refrigeration",
  process_equipment: "process_equipment",
  process_machine: "process_equipment",
};

export function normalizeMachineClass(value: string | null | undefined): MachineClass {
  const key = String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (ALIASES[key]) return ALIASES[key];
  if (key.includes("air_condition") || key === "ac") return "air_conditioner";
  if (key.includes("chiller")) return "chiller";
  if (key.includes("compressor")) return "compressor";
  if (key.includes("pump")) return "pump";
  if (key.includes("fan") || key.includes("blower")) return "fan";
  if (key.includes("motor")) return "motor";
  if (key.includes("boiler")) return "boiler";
  if (key.includes("tower")) return "cooling_tower";
  if (key.includes("refriger")) return "refrigeration";
  return "process_equipment";
}

export function machinePathways(machineClass: MachineClass): MachinePathway[] {
  return PATHWAYS[machineClass];
}

export function requiredMachineInputs(pathway: MachinePathway, available: Partial<Record<MachineMetric, boolean>>) {
  return pathway.required.filter((metric) => !available[metric]);
}

export function inferMachineEvidence(classValue: string | null | undefined, hasNameplate: boolean, hasObservedSeries: boolean): MachineEvidence {
  if (hasObservedSeries) return { machineClass: normalizeMachineClass(classValue), confidence: "measured", basis: "operating dataset/measurement evidence is present" };
  if (hasNameplate) return { machineClass: normalizeMachineClass(classValue), confidence: "provided", basis: "equipment identity is established from nameplate/document evidence" };
  return { machineClass: normalizeMachineClass(classValue), confidence: "identified", basis: "machine class is inferred only from the supplied asset label; operating parameters remain unresolved" };
}
