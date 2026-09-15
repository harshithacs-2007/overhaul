/**
 * Deterministic diagnostic tree for engineering residuals.
 *
 * AI can orchestrate which observations/references are relevant, but the
 * diagnosis layer only emits causes supported by the residual pattern and
 * explicitly records the evidence needed to distinguish competing causes.
 */

export type DiagnosticSeverity = "normal" | "warning" | "critical";
export type DiagnosticDomain = "equipment" | "hvac" | "envelope" | "controls";

export interface DiagnosticInput {
  domain: DiagnosticDomain;
  signals: Array<{
    key: string;
    observed: number;
    expected: number;
    unit?: string;
    toleranceRelative: number;
    confidence?: number;
  }>;
}

export interface DiagnosticCandidate {
  causeId: string;
  cause: string;
  consequence: string;
  severity: DiagnosticSeverity;
  supportingSignals: string[];
  discriminatingEvidence: string[];
  recommendedActionIds: string[];
}

export interface DiagnosticResult {
  status: "diagnostic" | "insufficient-evidence" | "no-abnormality";
  candidates: DiagnosticCandidate[];
  evidenceRequests: string[];
}

function abs(v: number) { return Math.abs(v); }
function rel(observed: number, expected: number) {
  return (observed - expected) / Math.max(abs(expected), 1e-9);
}
function severityFor(relativeResidual: number, tolerance: number): DiagnosticSeverity {
  const magnitude = abs(relativeResidual);
  if (magnitude <= tolerance) return "normal";
  if (magnitude <= tolerance * 2) return "warning";
  return "critical";
}

export function diagnoseResiduals(input: DiagnosticInput): DiagnosticResult {
  const abnormal = input.signals
    .map((signal) => ({ ...signal, residual: rel(signal.observed, signal.expected) }))
    .filter((signal) => abs(signal.residual) > signal.toleranceRelative);

  if (!input.signals.length) {
    return { status: "insufficient-evidence", candidates: [], evidenceRequests: ["Obtain at least one observed signal and an independent healthy expectation."] };
  }

  if (!abnormal.length) {
    return { status: "no-abnormality", candidates: [], evidenceRequests: [] };
  }

  const has = (key: string) => abnormal.find((signal) => signal.key === key);
  const candidates: DiagnosticCandidate[] = [];

  if (input.domain === "equipment" || input.domain === "hvac") {
    const power = has("power_kw");
    const capacity = has("capacity_kw");
    const flow = has("flow_m3h");
    const pressure = has("pressure_bar");
    const supply = has("supply_temp_c");
    const returnTemp = has("return_temp_c");
    const speed = has("speed_rpm");

    if (power && power.residual > power.toleranceRelative) {
      const supports = ["power_kw"];
      const evidence = ["Capture load/current power at a stable operating point."];
      if (flow && flow.residual < -flow.toleranceRelative) {
        supports.push("flow_m3h");
        evidence.push("Check filter/strainer condition, valve position, fan/pump speed and measured flow.");
        candidates.push({
          causeId: "hydraulic-airflow_restriction",
          cause: "Delivered flow is below the expected operating point while power is elevated.",
          consequence: "The asset may spend more electrical power while delivering less useful capacity.",
          severity: severityFor(Math.max(power.residual, abs(flow.residual)), power.toleranceRelative),
          supportingSignals: supports,
          discriminatingEvidence: evidence,
          recommendedActionIds: ["controls.runhours", "equipment.efficiency.replace"],
        });
      }
      if (pressure && pressure.residual > pressure.toleranceRelative) {
        supports.push("pressure_bar");
        candidates.push({
          causeId: "pressure_drop",
          cause: "Observed pressure is above the independent expectation alongside elevated power.",
          consequence: "Higher pressure differential can increase fan/pump/compressor work and may indicate restriction or control mismatch.",
          severity: severityFor(power.residual, power.toleranceRelative),
          supportingSignals: supports,
          discriminatingEvidence: ["Measure suction/discharge or upstream/downstream pressure and verify valve/filter state."],
          recommendedActionIds: ["controls.runhours"],
        });
      }
      if (supply && returnTemp) {
        const deltaObserved = returnTemp.observed - supply.observed;
        const deltaExpected = returnTemp.expected - supply.expected;
        if (abs(deltaObserved - deltaExpected) > Math.max(abs(deltaExpected) * 0.1, 0.5)) {
          candidates.push({
            causeId: "thermal_transfer_degradation",
            cause: "Observed supply/return temperature lift differs materially from the healthy reference.",
            consequence: "The asset may be transferring heat less effectively or operating under a changed process condition.",
            severity: "warning",
            supportingSignals: ["supply_temp_c", "return_temp_c"],
            discriminatingEvidence: ["Verify entering/leaving temperatures, load, flow and sensor calibration at the same operating condition."],
            recommendedActionIds: ["equipment.efficiency.replace"],
          });
        }
      }
      if (speed && speed.residual < -speed.toleranceRelative) {
        candidates.push({
          causeId: "under_speed",
          cause: "Measured speed is below the expected operating point while power remains elevated.",
          consequence: "Control settings, drive limits or mechanical resistance may be preventing the asset from reaching the required operating point.",
          severity: "warning",
          supportingSignals: ["speed_rpm", "power_kw"],
          discriminatingEvidence: ["Read commanded versus actual speed and VFD/control status; inspect for mechanical restriction."],
          recommendedActionIds: ["controls.runhours"],
        });
      }
    }

    if (capacity && capacity.residual < -capacity.toleranceRelative) {
      candidates.push({
        causeId: "capacity_degradation",
        cause: "Measured/validated delivered capacity is below the independent reference.",
        consequence: "A capacity shortfall can drive comfort/process failure even when electrical consumption appears acceptable.",
        severity: severityFor(capacity.residual, capacity.toleranceRelative),
        supportingSignals: ["capacity_kw"],
        discriminatingEvidence: ["Validate load measurement and confirm operating conditions match the reference curve before declaring degradation."],
        recommendedActionIds: ["equipment.efficiency.replace"],
      });
    }
  }

  if (input.domain === "envelope") {
    const power = has("power_kw");
    const supply = has("supply_temp_c");
    if (power && power.residual > power.toleranceRelative) {
      candidates.push({
        causeId: "envelope_heat_gain",
        cause: "Cooling-side electrical demand is higher than expected under the supplied conditions.",
        consequence: "Additional envelope heat gain or infiltration may be increasing cooling load.",
        severity: severityFor(power.residual, power.toleranceRelative),
        supportingSignals: ["power_kw"],
        discriminatingEvidence: ["Capture envelope area/construction, outdoor/indoor conditions, solar exposure and infiltration evidence."],
        recommendedActionIds: ["env.roof.insulation", "env.glazing.uvalue", "env.shading.solar"],
      });
    }
    if (supply && supply.residual > supply.toleranceRelative) {
      candidates.push({
        causeId: "comfort_control_mismatch",
        cause: "Supply-side temperature is warmer than the healthy reference.",
        consequence: "Reduced cooling effectiveness may manifest as comfort degradation or higher runtime.",
        severity: severityFor(supply.residual, supply.toleranceRelative),
        supportingSignals: ["supply_temp_c"],
        discriminatingEvidence: ["Verify thermostat/setpoint, coil condition, airflow, refrigerant/process conditions and sensor calibration."],
        recommendedActionIds: ["controls.runhours"],
      });
    }
  }

  if (input.domain === "controls") {
    const speed = has("speed_rpm");
    const power = has("power_kw");
    if (speed && power && speed.residual < -speed.toleranceRelative && power.residual > power.toleranceRelative) {
      candidates.push({
        causeId: "control_mismatch",
        cause: "Actual speed is low relative to the reference while electrical demand is high.",
        consequence: "The control strategy may be inefficient or the asset may be fighting a process restriction.",
        severity: "warning",
        supportingSignals: ["speed_rpm", "power_kw"],
        discriminatingEvidence: ["Compare command, feedback, setpoint, process demand and control limits over a stable interval."],
        recommendedActionIds: ["controls.runhours"],
      });
    }
  }

  if (!candidates.length) {
    return {
      status: "insufficient-evidence",
      candidates: [],
      evidenceRequests: ["The residual pattern is abnormal but not specific enough to isolate a cause. Capture one discriminating operating measurement before intervention."],
    };
  }

  const evidenceRequests = Array.from(new Set(candidates.flatMap((candidate) => candidate.discriminatingEvidence))).slice(0, 5);
  return { status: "diagnostic", candidates, evidenceRequests };
}
