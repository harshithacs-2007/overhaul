"use client";

import { useEffect, useState } from "react";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null>;
type Field = { key: string; label: string; unit?: string; required?: boolean; min?: number; max?: number; step?: string; text?: boolean };

const BUILDING_FIELDS: Field[] = [
  { key: "primary_envelope_material", label: "Primary envelope material", required: true, text: true },
  { key: "material_age_years", label: "Primary envelope/material age", unit: "yr", required: true, min: 0, step: "1" },
  { key: "floor_area_m2", label: "Conditioned floor area", unit: "m²", required: true, min: 0.1, step: "0.1" },
  { key: "envelope_area_m2", label: "Envelope area", unit: "m²", required: true, min: 0.1, step: "0.1" },
  { key: "envelope_u_w_m2k", label: "Average envelope U-value", unit: "W/m²K", required: true, min: 0.001, step: "0.001" },
  { key: "ventilation_m3s", label: "Outdoor-air flow", unit: "m³/s", required: true, min: 0, step: "0.001" },
  { key: "infiltration_m3s", label: "Infiltration flow", unit: "m³/s", required: true, min: 0, step: "0.001" },
  { key: "hvac_capacity_kw", label: "Installed HVAC capacity", unit: "kW", required: true, min: 0.1, step: "0.1" },
  { key: "cop", label: "Observed/nameplate HVAC COP", unit: "COP", required: true, min: 0.1, step: "0.01" },
  { key: "hvac_auxiliary_power_kw", label: "HVAC fan/pump/auxiliary draw while cooling", unit: "kW", min: 0, step: "0.01" },
  { key: "electricity_rate_inr_per_kwh", label: "Electricity tariff", unit: "₹/kWh", required: true, min: 0, step: "0.01" },
  { key: "indoor_temp_c", label: "Target indoor temperature", unit: "°C", required: true, min: 5, step: "0.1" },
  { key: "indoor_rh_pct", label: "Target indoor relative humidity", unit: "%RH", required: true, min: 0, max: 100, step: "0.1" },
  { key: "solar_gain_factor", label: "Effective solar aperture", unit: "m²", required: true, min: 0, step: "0.01" },
  { key: "internal_gain_kw", label: "Occupied internal sensible gain", unit: "kW", required: true, min: 0, step: "0.1" },
];

const EQUIPMENT_FIELDS: Field[] = [
  { key: "asset_age_years", label: "Asset/machine age", unit: "yr", required: true, min: 0, step: "1" },
  { key: "capacity_kw", label: "Rated capacity", unit: "kW", required: true, min: 0.01, step: "0.01" },
  { key: "load_kw", label: "Observed load", unit: "kW", min: 0, step: "0.01" },
  { key: "power_kw", label: "Observed electrical power", unit: "kW", min: 0, step: "0.01" },
  { key: "efficiency", label: "Observed efficiency", unit: "fraction", min: 0.001, step: "0.001" },
  { key: "annual_hours", label: "Annual runtime", unit: "h/yr", required: true, min: 0, max: 8760, step: "1" },
  { key: "electricity_rate_inr_per_kwh", label: "Electricity tariff", unit: "₹/kWh", required: true, min: 0, step: "0.01" },
];
function asString(value: number | string | null | undefined) { return value == null ? "" : String(value); }
function num(value: string) { const n = Number(value); return Number.isFinite(n) ? n : null; }

export default function EngineeringAnchorGate({ scope, values, assetAgeYears }: { scope: Scope; values: Values; assetAgeYears?: number | null }) {
  const fields = scope === "equipment" ? EQUIPMENT_FIELDS : BUILDING_FIELDS;
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { const next = Object.fromEntries(fields.map((field) => [field.key, asString(values[field.key])])); if (scope === "equipment" && !next.asset_age_years && assetAgeYears != null) next.asset_age_years = String(assetAgeYears); setDraft(next); }, [fields, scope, values, assetAgeYears]);
  const missing = fields.filter((field) => { if (!field.required) return false; const raw = draft[field.key]?.trim(); if (!raw) return true; if (field.text) return false; const parsed = num(raw); return parsed == null || (field.min != null && parsed < field.min) || (field.max != null && parsed > field.max); }).map((field) => field.label);
  const equipmentOperatingAnchor = scope !== "equipment" || (num(draft.load_kw) != null && num(draft.power_kw) != null) || (num(draft.load_kw) != null && num(draft.efficiency) != null);
  const complete = missing.length === 0 && equipmentOperatingAnchor;
  const apply = () => {
    const next: Values = { ...values };
    for (const [key, raw] of Object.entries(draft)) { if (!raw.trim()) continue; const parsed = num(raw); next[key] = parsed == null ? raw.trim() : parsed; }
    try {
      sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify(next));
      if (scope === "equipment" && next.asset_age_years != null) { const assessment = JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null") as Record<string, unknown> | null; if (assessment) sessionStorage.setItem("overhaul:assessment", JSON.stringify({ ...assessment, assetAgeYears: Number(next.asset_age_years) })); }
      window.dispatchEvent(new CustomEvent("overhaul:supplemental-change")); window.dispatchEvent(new CustomEvent("overhaul:assessment-change"));
    } catch {}
  };
  return <section className={`border p-5 ${complete ? "border-teal/15 bg-teal/[.02]" : "border-amber-200/25 bg-amber-200/[.02]"}`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[.18em] text-amber-200">Engineering anchor gate</p><h2 className="mt-1 font-display text-2xl">No guessed engineering numbers.</h2><p className="mt-2 max-w-3xl text-[9px] leading-5 text-steel">Material identity and age are required context. Thermal properties, operating state and indoor moisture targets must come from evidence or explicit measurements. Vision can classify what is visible; it cannot manufacture a design value.</p></div><div className={`border px-3 py-2 font-mono text-[8px] uppercase ${complete ? "border-teal/25 text-teal" : "border-amber-200/25 text-amber-200"}`}>{complete ? "Inputs complete" : `${missing.length + (equipmentOperatingAnchor ? 0 : 1)} anchor(s) missing`}</div></div>
    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{fields.map((field) => <label key={field.key} className="block border border-steel/10 bg-black/15 p-3"><span className="flex items-center justify-between gap-3 font-mono text-[7px] uppercase tracking-[.08em] text-steel"><span>{field.label}{field.required ? <b className="ml-1 text-amber-200">*</b> : null}</span><span>{field.unit}</span></span><input value={draft[field.key] || ""} type={field.text ? "text" : "number"} min={field.min} max={field.max} step={field.step || "any"} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-2 w-full border border-steel/15 bg-[#050707] px-3 py-2 text-[11px] text-paper outline-none focus:border-teal/45" /></label>)}</div>
    {scope === "equipment" && !equipmentOperatingAnchor ? <p className="mt-3 text-[8px] text-amber-200">Provide observed load + power, or observed load + efficiency. Rated capacity alone cannot establish an operating baseline.</p> : null}
    {scope !== "equipment" ? <p className="mt-3 text-[8px] leading-4 text-steel">Building annual cooling uses the supplied envelope conductance, explicit air exchange, internal gain, indoor humidity target, and a complete NASA POWER hourly temperature/RH/pressure/solar boundary. Optional auxiliary HVAC draw is included only when explicitly supplied.</p> : null}
    {missing.length ? <p className="mt-3 text-[8px] leading-4 text-amber-200">Still missing: {missing.join(" · ")}</p> : null}
    <button type="button" onClick={apply} className="mt-4 border border-teal/25 px-4 py-2 font-mono text-[8px] uppercase tracking-[.1em] text-teal hover:bg-teal/[.05]">Validate & apply anchors</button>
  </section>;
}
