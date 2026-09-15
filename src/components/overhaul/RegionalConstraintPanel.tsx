"use client";

import { useMemo } from "react";
import { deriveClimateConstraints } from "@/lib/engineering";

type Climate = { temperature?: number; humidity?: number; min?: number; max?: number; rain?: number } | null;
type Values = Record<string, number | string | null>;

export default function RegionalConstraintPanel({ climate, values }: { climate: Climate; values: Values }) {
  const constraints = useMemo(() => deriveClimateConstraints({ temperatureC: climate?.temperature, humidityPercent: climate?.humidity, sevenDayHighC: climate?.max, rainMm: climate?.rain, designOutdoorC: Number.isFinite(Number(values.outdoor_temp_c)) ? Number(values.outdoor_temp_c) : Number(values.design_outdoor_temp_c) }), [climate, values]);
  return <section className="overflow-hidden border border-sky-200/15 bg-[#07090b]"><div className="border-b border-steel/10 px-5 py-5"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-sky-200">Regional engineering constraints</p><h2 className="mt-1 font-display text-2xl">Climate changes what must be checked.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Weather context never creates savings. It changes the operating conditions and evidence checks that should surround a retrofit decision.</p></div><div className="grid gap-2 p-5">{constraints.map((item) => <div key={item.id} className="grid gap-3 border border-steel/10 p-4 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-sm text-paper">{item.label}</p><p className="mt-1 text-[8px] text-sky-200">{item.trigger}</p></div><div><p className="text-[9px] leading-4 text-steel">{item.consequence}</p><p className="mt-2 font-mono text-[7px] uppercase tracking-[0.08em] text-steel/70">Evidence: {item.evidenceNeeded}</p></div></div>)}</div></section>;
}
