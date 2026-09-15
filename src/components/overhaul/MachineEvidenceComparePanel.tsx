"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { calculateMachineBaseline, calculateMachineRetrofit, extractBillEnergy } from "@/lib/engineering/machineRetrofitCalculations";

type Values = Record<string, number | string | null | undefined>;
type Extraction = {
  evidenceId?: string;
  sourceName?: string;
  sourceKind?: string;
  observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText?: string }>;
};

type Props = {
  assetClass?: string | null;
  assetAgeYears?: number | null;
  values: Values;
  extracts: Extraction[];
};

function n(values: Values, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function fmt(value: number | null, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function sourceLooksLikeBill(extraction: Extraction) {
  const text = `${extraction.sourceKind || ""} ${extraction.sourceName || ""}`.toLowerCase();
  return text.includes("bill") || text.includes("electric") || text.includes("energy") || text.includes("utility");
}

export default function MachineEvidenceComparePanel({ assetClass, assetAgeYears, values, extracts }: Props) {
  const allObservations = useMemo(() => extracts.flatMap((item) => item.observations || []), [extracts]);
  const billObservations = useMemo(() => extracts.filter(sourceLooksLikeBill).flatMap((item) => item.observations || []), [extracts]);
  const bill = useMemo(() => extractBillEnergy(billObservations), [billObservations]);

  const baseline = useMemo(() => calculateMachineBaseline({
    loadKW: n(values, "load_kw", "observed_load_kw", "operating_load_kw"),
    ratedCapacityKW: n(values, "capacity_kw", "rated_capacity_kw"),
    powerKW: n(values, "power_kw", "observed_power_kw", "input_power_kw"),
    efficiency: n(values, "efficiency"),
    cop: n(values, "cop"),
    runtimeHours: n(values, "annual_hours", "runtime_hours", "annual_runtime_hours"),
    electricityRateINRPerKWh: n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"),
    billEnergyKWh: n(values, "bill_energy_kwh", "annual_bill_energy_kwh") ?? bill.totalKWh,
    billMonths: n(values, "bill_history_months", "bill_months"),
  }), [values, bill]);

  const retrofit = useMemo(() => calculateMachineRetrofit({
    loadKW: n(values, "load_kw", "observed_load_kw", "operating_load_kw"),
    ratedCapacityKW: n(values, "capacity_kw", "rated_capacity_kw"),
    powerKW: n(values, "power_kw", "observed_power_kw", "input_power_kw"),
    efficiency: n(values, "efficiency"),
    cop: n(values, "cop"),
    runtimeHours: n(values, "annual_hours", "runtime_hours", "annual_runtime_hours"),
    electricityRateINRPerKWh: n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"),
    targetEfficiency: n(values, "proposed_efficiency", "target_efficiency"),
    targetCOP: n(values, "proposed_cop", "target_cop"),
    targetRuntimeHours: n(values, "proposed_runtime_hours", "target_runtime_hours"),
    title: "Evidence-bound retrofit what-if",
  }), [values]);

  const identity = allObservations.filter((item) => /manufacturer|model|serial|part.?number/i.test(item.field) && item.value.trim()).slice(0, 3);
  const conditionEvidence = allObservations.filter((item) => /condition|corrosion|leak|damage|insulation|blocked|noise|vibration|wear/i.test(`${item.field} ${item.value}`)).slice(0, 5);
  const runtime = baseline.baselineBasis.find((basis) => basis.includes("electric bill")) || (baseline.billMonths != null ? `${baseline.billMonths} months supplied` : "Bill period not established");

  return (
    <section className="mt-5 overflow-hidden border border-amber-200/20 bg-[#090b0a]">
      <div className="border-b border-steel/15 p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[.16em] text-amber-200">Machine / appliance evidence bridge</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl">What the evidence says vs what the twin calculates.</h2>
            <p className="mt-2 max-w-4xl text-[10px] leading-5 text-steel">For standalone equipment, the scan is the spatial/condition evidence. Nameplate/model documents anchor identity, available electric bills anchor consumption history, and explicit operating inputs anchor the engineering calculation. No floor plan is required.</p>
          </div>
          <div className="border border-steel/15 bg-black/20 px-4 py-3 font-mono text-[8px] uppercase text-steel">{assetClass || "Equipment"} · {assetAgeYears != null ? `${fmt(assetAgeYears, 0)} yr old` : "age unresolved"}</div>
        </div>
      </div>

      <div className="grid gap-px border-b border-steel/15 bg-steel/10 lg:grid-cols-2">
        <div className="bg-[#090b0a] p-5 sm:p-6">
          <div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase tracking-[.13em] text-teal">Submitted evidence</p><span className="font-mono text-[8px] text-steel">{extracts.length} source{extracts.length === 1 ? "" : "s"}</span></div>
          <div className="mt-4 space-y-2">
            <EvidenceRow label="Asset class" value={assetClass || "Unresolved"} />
            <EvidenceRow label="Age" value={assetAgeYears != null ? `${fmt(assetAgeYears, 0)} years` : "Not supplied"} />
            <EvidenceRow label="Rated capacity" value={n(values, "capacity_kw", "rated_capacity_kw") != null ? `${fmt(n(values, "capacity_kw", "rated_capacity_kw"))} kW` : "Not established"} />
            <EvidenceRow label="Observed power" value={n(values, "power_kw", "observed_power_kw", "input_power_kw") != null ? `${fmt(n(values, "power_kw", "observed_power_kw", "input_power_kw"))} kW` : "Not measured"} />
            <EvidenceRow label="Runtime" value={n(values, "annual_hours", "runtime_hours", "annual_runtime_hours") != null ? `${fmt(n(values, "annual_hours", "runtime_hours", "annual_runtime_hours"), 0)} h/yr` : "Not supplied"} />
            <EvidenceRow label="Bill history" value={bill.totalKWh != null ? `${fmt(bill.totalKWh)} kWh extracted` : "No bill-energy value extracted"} />
            <EvidenceRow label="Bill period" value={runtime} />
          </div>
          {identity.length ? <div className="mt-4 border border-teal/15 p-3"><p className="font-mono text-[8px] uppercase text-teal">Identity evidence</p>{identity.map((item, i) => <p key={`${item.field}-${i}`} className="mt-2 text-[10px] text-steel"><span className="text-paper">{item.field}:</span> {item.value}</p>)}</div> : null}
          {conditionEvidence.length ? <div className="mt-4 border border-amber-200/15 p-3"><p className="font-mono text-[8px] uppercase text-amber-200">Visible / documented condition</p>{conditionEvidence.map((item, i) => <p key={`${item.field}-${i}`} className="mt-2 text-[10px] text-steel">{item.value || item.field}</p>)}</div> : null}
        </div>

        <div className="bg-[#090b0a] p-5 sm:p-6">
          <div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase tracking-[.13em] text-gold">Engineering interpretation</p><span className="font-mono text-[8px] text-steel">deterministic</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Calc label="Current electrical power" value={baseline.currentPowerKW != null ? `${fmt(baseline.currentPowerKW)} kW` : "—"} />
            <Calc label="Calculated power" value={baseline.calculatedPowerKW != null ? `${fmt(baseline.calculatedPowerKW)} kW` : "—"} />
            <Calc label="Projected annual energy" value={baseline.annualEnergyKWh != null ? `${fmt(baseline.annualEnergyKWh)} kWh/yr` : "—"} />
            <Calc label="Bill annualised*" value={baseline.annualizedBillEnergyKWh != null ? `${fmt(baseline.annualizedBillEnergyKWh)} kWh/yr` : "—"} />
          </div>
          {baseline.gaps.length ? <div className="mt-4 border border-clay/20 bg-clay/5 p-3"><p className="font-mono text-[8px] uppercase text-clay">Calculation gate</p>{baseline.gaps.map((gap) => <p key={gap} className="mt-2 text-[9px] leading-4 text-steel">{gap}</p>)}</div> : null}

          <div className="mt-5 border border-teal/20 bg-teal/[.025] p-4">
            <div className="flex items-center justify-between gap-3"><p className="font-mono text-[8px] uppercase text-teal">Retrofit counterfactual</p><span className="font-mono text-[8px] uppercase text-steel">not guessed</span></div>
            {retrofit ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><Calc label="Target power" value={retrofit.powerKW != null ? `${fmt(retrofit.powerKW)} kW` : "—"}/><Calc label="Annual energy" value={retrofit.annualEnergyKWh != null ? `${fmt(retrofit.annualEnergyKWh)} kWh/yr` : "—"}/><Calc label="Energy change" value={retrofit.energySavingKWh != null ? `${fmt(retrofit.energySavingKWh)} kWh/yr` : "—"}/></div> : <p className="mt-2 text-[9px] leading-5 text-steel">Enter a target efficiency/COP or target runtime from a valid retrofit reference to unlock the what-if calculation.</p>}
            {retrofit ? <p className="mt-3 font-mono text-[8px] leading-4 text-steel">Basis · {retrofit.basis}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
        <StatusCard title="Scan / twin" status="Visual geometry" detail="Browser 3D twin + Blender/CAD scene path use the scan and explicit dimensions where available." />
        <StatusCard title="Reference data" status="Evidence gated" detail="Manufacturer/reference data or an explicit validated relationship is required before claiming degradation." />
        <StatusCard title="Retrofit path" status={retrofit ? "Simulated" : "Waiting"} detail={retrofit ? "The counterfactual changes only the explicit target parameter(s)." : "No retrofit outcome is shown until a defensible target is supplied."} />
      </div>
    </section>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-steel/10 py-2 last:border-0"><span className="text-[9px] text-steel">{label}</span><span className="max-w-[60%] text-right font-mono text-[9px] text-paper">{value}</span></div>;
}

function Calc({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/12 bg-black/15 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><motion.p initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} className="mt-1 text-base">{value}</motion.p></div>;
}

function StatusCard({ title, status, detail }: { title: string; status: string; detail: string }) {
  return <div className="border border-steel/12 bg-black/10 p-4"><p className="font-mono text-[8px] uppercase text-steel">{title}</p><p className="mt-2 text-sm text-teal">{status}</p><p className="mt-2 text-[9px] leading-4 text-steel">{detail}</p></div>;
}
