/**
 * Deterministic bridge from visual asset classes to retrofit pathways.
 *
 * Perception may identify an asset. This graph never converts visual identity
 * into savings, efficiency, or failure. It only answers: "What engineering
 * pathway becomes relevant, and what evidence must be collected before the
 * pathway can be calculated?"
 */

export type RetrofitPathway = {
  id: string;
  label: string;
  category: "efficiency" | "controls" | "envelope" | "air-side" | "thermal" | "maintenance" | "electrical";
  rationale: string;
  requiredEvidence: string[];
};

const GRAPH: Record<string, RetrofitPathway[]> = {
  "split air conditioner": [
    { id: "ac-efficiency", label: "AC efficiency / COP upgrade", category: "efficiency", rationale: "Existing AC identity creates an equipment-upgrade pathway.", requiredEvidence: ["Rated capacity", "Observed electrical power or measured efficiency/COP", "Annual runtime", "Equipment age"] },
    { id: "ac-controls", label: "AC controls / runtime optimisation", category: "controls", rationale: "Runtime and control behaviour can be assessed once operating evidence exists.", requiredEvidence: ["Annual runtime or interval runtime data", "Current setpoint/control mode", "Observed load or operating schedule"] },
  ],
  "air handling unit": [
    { id: "ahu-fan", label: "AHU fan / air-side optimisation", category: "air-side", rationale: "AHU detection exposes an air-side power and airflow pathway.", requiredEvidence: ["Fan electrical power", "Airflow", "External static pressure", "Operating hours"] },
    { id: "ahu-filtration", label: "Filter / pressure-drop intervention", category: "maintenance", rationale: "Visible filter condition can trigger a pressure-drop evidence request.", requiredEvidence: ["Filter differential pressure", "Filter type / size", "Operating hours"] },
  ],
  "chiller": [
    { id: "chiller-efficiency", label: "Chiller efficiency / plant optimisation", category: "efficiency", rationale: "Chiller identity supports a plant-efficiency pathway.", requiredEvidence: ["Cooling capacity", "Electrical power", "Entering/leaving water temperatures", "Flow", "Operating hours"] },
    { id: "chiller-sequencing", label: "Chiller sequencing / controls", category: "controls", rationale: "Multiple chillers or variable load operation can justify sequencing analysis.", requiredEvidence: ["Plant operating schedule", "Individual chiller load/power", "Number of active units"] },
  ],
  "compressor": [
    { id: "compressor-efficiency", label: "Compressor efficiency upgrade", category: "efficiency", rationale: "Compressor detection creates an equipment-efficiency pathway.", requiredEvidence: ["Rated capacity", "Observed power", "Observed load", "Operating hours"] },
    { id: "compressor-controls", label: "Compressor controls / unload optimisation", category: "controls", rationale: "Part-load behaviour can be tested with operating data.", requiredEvidence: ["Load profile", "Power profile", "Control/unload state", "Operating hours"] },
  ],
  "pump": [
    { id: "pump-efficiency", label: "Pump efficiency upgrade", category: "efficiency", rationale: "Pump identity supports a hydraulic efficiency pathway.", requiredEvidence: ["Electrical power", "Flow", "Head / differential pressure", "Operating hours"] },
    { id: "pump-controls", label: "Pump speed / control optimisation", category: "controls", rationale: "Variable-speed control can only be modelled with hydraulic and runtime evidence.", requiredEvidence: ["Flow", "Head / differential pressure", "Control mode", "Operating hours"] },
  ],
  "electric motor": [
    { id: "motor-efficiency", label: "Motor efficiency upgrade", category: "efficiency", rationale: "Motor identity supports an efficiency comparison when load and power are measured.", requiredEvidence: ["Rated power", "Observed shaft/load condition", "Observed electrical power", "Operating hours"] },
    { id: "motor-vfd", label: "Variable-speed drive retrofit", category: "controls", rationale: "A VFD pathway requires a variable-load duty and operating envelope.", requiredEvidence: ["Load profile", "Speed/duty requirement", "Operating hours", "Existing starter/control method"] },
  ],
  "ceiling fan": [
    { id: "fan-efficiency", label: "Fan efficiency upgrade", category: "efficiency", rationale: "Fan identity supports an efficiency pathway once power/runtime are known.", requiredEvidence: ["Electrical power", "Operating hours", "Airflow requirement"] },
    { id: "fan-controls", label: "Fan controls / runtime optimisation", category: "controls", rationale: "Runtime can be reduced or modulated only after the actual duty is established.", requiredEvidence: ["Operating hours", "Control mode", "Required airflow / speed"] },
  ],
  "air filter": [
    { id: "filter-maintenance", label: "Filter replacement / pressure-drop intervention", category: "maintenance", rationale: "Filter condition can change air-side resistance and fan energy.", requiredEvidence: ["Differential pressure", "Filter type", "Replacement interval", "Fan power"] },
  ],
  "window": [
    { id: "window-glazing", label: "Glazing / solar-control retrofit", category: "envelope", rationale: "Window identity creates an envelope pathway; actual thermal and solar properties must be evidenced.", requiredEvidence: ["Glazing type", "Window area", "Orientation", "Existing U-value or construction evidence", "Material age"] },
    { id: "window-shading", label: "External shading / solar-control retrofit", category: "envelope", rationale: "Shading can alter solar gain when exposure and geometry are known.", requiredEvidence: ["Window orientation", "Window area", "Existing shading", "Material age"] },
  ],
  "door": [
    { id: "door-sealing", label: "Door sealing / infiltration control", category: "envelope", rationale: "Door openings can affect infiltration when leakage and usage are measured.", requiredEvidence: ["Door dimensions", "Opening frequency", "Infiltration evidence", "Material age"] },
  ],
  "electrical panel": [
    { id: "panel-metering", label: "Submetering / electrical monitoring", category: "electrical", rationale: "Panel identity creates a measurement pathway for retrofit verification.", requiredEvidence: ["Circuit list", "Measured electrical load", "Metering interval"] },
  ],
};

function normalise(label: string) { return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }

export function retrofitPathwaysForLabel(label: string): RetrofitPathway[] {
  const key = normalise(label);
  const exact = GRAPH[key];
  if (exact) return exact;
  if (/air conditioner|\bac\b/.test(key)) return GRAPH["split air conditioner"];
  if (/\bahu\b|air handling/.test(key)) return GRAPH["air handling unit"];
  if (/fan/.test(key)) return GRAPH["ceiling fan"];
  if (/motor/.test(key)) return GRAPH["electric motor"];
  if (/pump/.test(key)) return GRAPH["pump"];
  if (/compressor/.test(key)) return GRAPH["compressor"];
  if (/chiller/.test(key)) return GRAPH["chiller"];
  if (/window/.test(key)) return GRAPH.window;
  if (/door/.test(key)) return GRAPH.door;
  return [];
}

export function buildAssetRetrofitGraph(labels: string[]) {
  const seen = new Set<string>();
  return labels.flatMap((label) => retrofitPathwaysForLabel(label).map((pathway) => ({
    assetLabel: label,
    ...pathway,
  }))).filter((item) => {
    const key = `${normalise(item.assetLabel)}::${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 24);
}
