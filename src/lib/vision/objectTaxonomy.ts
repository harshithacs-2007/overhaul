/**
 * Broad candidate vocabulary for OVERHAUL's visual inventory pass.
 *
 * The vocabulary intentionally combines common object categories used by
 * public detection datasets with retrofit/HVAC/equipment terminology. The
 * perception model remains open-vocabulary: these are search anchors, not a
 * closed allow-list. A detected object may still be returned when it is not
 * present in this list.
 */

export const COMMON_OBJECT_VOCABULARY = [
  "person", "chair", "couch", "table", "desk", "bed", "dining table", "bench", "cabinet", "shelf", "book", "laptop", "computer monitor", "keyboard", "mouse", "keyboard mouse", "cell phone", "television", "remote", "clock", "picture frame", "mirror", "backpack", "handbag", "suitcase", "bottle", "cup", "bowl", "plate", "fork", "knife", "spoon", "microwave", "oven", "toaster", "sink", "refrigerator", "washing machine", "dryer", "toilet", "bathtub", "shower", "door", "window", "curtain", "blinds", "lamp", "light fixture", "ceiling light", "floor lamp", "fan", "plant", "trash can", "fire extinguisher", "smoke detector", "staircase", "handrail", "elevator", "vehicle", "bicycle", "box", "bag", "tool", "power tool", "ladder", "sign", "whiteboard", "projector", "printer", "camera", "speaker", "router", "server rack", "electrical panel", "meter", "thermostat"
] as const;

export const ENGINEERING_OBJECT_VOCABULARY = [
  "split air conditioner", "wall mounted air conditioner", "cassette air conditioner", "packaged air conditioner", "window air conditioner", "portable air conditioner", "heat pump", "VRF indoor unit", "VRF outdoor unit", "fan coil unit", "AHU", "air handling unit", "rooftop unit", "DX coil", "chilled water coil", "condenser coil", "evaporator coil", "chiller", "air cooled chiller", "water cooled chiller", "cooling tower", "condenser water pump", "chilled water pump", "circulation pump", "boiler", "steam boiler", "hot water boiler", "compressor", "refrigeration compressor", "refrigeration condenser", "refrigeration evaporator", "refrigeration unit", "cold room", "freezer", "display refrigerator", "duct", "supply duct", "return duct", "exhaust duct", "diffuser", "supply diffuser", "return grille", "air grille", "vent", "exhaust fan", "supply fan", "ceiling fan", "industrial fan", "axial fan", "centrifugal fan", "motor", "electric motor", "induction motor", "pump motor", "variable frequency drive", "VFD", "inverter", "drive", "gearbox", "bearing", "valve", "control valve", "isolation valve", "check valve", "damper", "fire damper", "thermostat", "temperature sensor", "humidity sensor", "pressure sensor", "flow sensor", "energy meter", "power meter", "electricity meter", "BMS controller", "PLC", "control panel", "MCC panel", "distribution board", "switchboard", "transformer", "UPS", "battery cabinet", "generator", "solar inverter", "solar panel", "water tank", "expansion tank", "heat exchanger", "plate heat exchanger", "air filter", "bag filter", "HEPA filter", "insulation", "pipe insulation", "duct insulation", "roof insulation", "wall insulation", "radiator", "underfloor heating", "hot water pipe", "chilled water pipe", "steam pipe", "compressed air line", "process pipe", "flue", "chimney", "fume hood", "dust collector", "industrial oven", "industrial furnace", "kiln", "dryer system", "conveyor", "welding machine", "lathe", "CNC machine", "drill press", "hydraulic pump", "hydraulic power unit", "air compressor", "vacuum pump", "machine enclosure", "process equipment", "storage tank", "pressure vessel", "heat recovery unit", "air curtain", "dehumidifier", "humidifier"
] as const;

export const RETROFIT_RELEVANT_VOCABULARY = [
  "cracked wall", "water stain", "leak", "condensation", "mold", "corrosion", "rust", "damaged insulation", "missing insulation", "loose insulation", "blocked diffuser", "blocked vent", "dirty filter", "dirty coil", "finned coil", "dust buildup", "damaged duct", "duct gap", "duct leakage indicator", "open panel", "exposed wiring", "damaged cable", "burn mark", "overheated component", "broken fan", "damaged fan blade", "oil stain", "refrigerant line", "frosted coil", "ice buildup", "thermal bridge indicator", "single glazing", "double glazing", "shading device", "external shade", "solar screen"
] as const;

export const OVERHAUL_VISION_VOCABULARY = [
  ...COMMON_OBJECT_VOCABULARY,
  ...ENGINEERING_OBJECT_VOCABULARY,
  ...RETROFIT_RELEVANT_VOCABULARY,
];

export const DATASET_BASIS =
  "Candidate labels are informed by common public object-detection taxonomies (COCO/LVIS-style coverage) and an OVERHAUL engineering/HVAC extension; the model remains open-vocabulary and may return labels outside the candidate bank.";
