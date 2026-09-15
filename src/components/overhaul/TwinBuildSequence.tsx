"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type Scope = "building" | "facility" | "equipment";
type Props = {
  scope: Scope;
  evidenceCount: number;
  signalCount: number;
  confidence: number;
};

const phases = [
  ["01", "Evidence", "Fuse camera, documents, nameplates and measurements into one evidence set."],
  ["02", "Perception", "AI extracts identity, geometry, components and measurable signals."],
  ["03", "Semantic twin", "Convert observations into linked assets, systems and relationships."],
  ["04", "3D / CAD", "Render the same semantic model as a progressive editable scene."],
  ["05", "Healthy reference", "Attach an independent physics, manufacturer or trained-model expectation."],
  ["06", "Digital Shadow", "Compare expected behaviour with the real observed state."],
] as const;

export default function TwinBuildSequence({ scope, evidenceCount, signalCount, confidence }: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setActive((v) => (v + 1) % phases.length), 2600);
    return () => window.clearInterval(id);
  }, []);

  const objectLabel = useMemo(() => scope === "equipment" ? "machine" : scope === "facility" ? "facility" : "building", [scope]);

  return (
    <section className="mb-5 overflow-hidden border border-teal/20 bg-black/20 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal">OVERHAUL // Twin construction</p>
          <h2 className="mt-1 font-display text-3xl sm:text-4xl">Watch the asset become a model.</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-steel">This is not a decorative 3D preview. The scene is the visible form of the same semantic model used downstream for engineering comparison and retrofit reasoning.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 font-mono text-[8px] uppercase tracking-[0.08em]">
          <Mini label="evidence" value={String(evidenceCount)} />
          <Mini label="signals" value={String(signalCount)} />
          <Mini label="confidence" value={`${confidence}%`} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="relative min-h-[310px] overflow-hidden border border-steel/15 bg-[radial-gradient(circle_at_50%_45%,rgba(52,211,188,0.10),transparent_40%)]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:38px_38px]" />
          <motion.div className="absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2" animate={{ scale: active >= 2 ? 1 : 0.72, opacity: active === 0 ? 0.45 : 1 }} transition={{ duration: 0.7 }}>
            <div className="absolute inset-x-6 top-5 h-28 border border-paper/40 bg-paper/[0.025]" />
            <div className="absolute left-10 top-0 h-16 w-20 -skew-y-12 border border-steel/30 bg-steel/[0.03]" />
            <div className="absolute right-10 top-0 h-16 w-20 skew-y-12 border border-steel/30 bg-steel/[0.03]" />
            {Array.from({ length: active >= 3 ? 5 : 2 }).map((_, i) => (
              <motion.div key={i} className="absolute rounded border border-teal/35 bg-teal/[0.04]" style={{ left: 26 + i * 28, top: 76 - (i % 2) * 8, width: 22, height: 20 }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.12 }} />
            ))}
            {active >= 4 && <motion.div className="absolute left-[48%] top-[38%] h-16 w-20 rounded-full border border-teal/55" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} />}
            {active >= 5 && (
              <motion.div className="absolute inset-0 border border-teal/30" animate={{ boxShadow: ["0 0 0 rgba(52,211,188,0)", "0 0 34px rgba(52,211,188,0.14)", "0 0 0 rgba(52,211,188,0)"] }} transition={{ duration: 1.8, repeat: Infinity }} />
            )}
            <div className="absolute left-1/2 top-[52%] -translate-x-1/2 text-center">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-teal">{objectLabel}</p>
              <p className="mt-1 font-mono text-[8px] uppercase text-steel">{phases[active][1]}</p>
            </div>
          </motion.div>

          {active >= 1 && Array.from({ length: 7 }).map((_, i) => (
            <motion.div key={i} className="absolute h-px bg-teal/40" style={{ left: `${12 + i * 11}%`, top: `${18 + (i % 5) * 13}%`, width: `${9 + (i % 3) * 5}%`, transform: `rotate(${i % 2 ? 22 : -14}deg)` }} animate={{ opacity: [0.15, 0.75, 0.15] }} transition={{ duration: 1.5 + i * 0.1, repeat: Infinity, delay: i * 0.1 }} />
          ))}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[7px] uppercase text-steel"><span>observed geometry</span><span>→</span><span className="text-teal">engineering-ready representation</span></div>
        </div>

        <div className="space-y-2">
          {phases.map(([num, title, description], i) => (
            <button key={num} type="button" onClick={() => setActive(i)} className={`w-full border p-3 text-left transition ${active === i ? "border-teal/45 bg-teal/5" : "border-steel/15 hover:border-steel/30"}`}>
              <div className="flex items-center gap-3"><span className="font-mono text-[8px] text-teal">{num}</span><span className="text-sm">{title}</span></div>
              {active === i && <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-[10px] leading-5 text-steel">{description}</motion.p>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 px-3 py-2"><p className="text-steel">{label}</p><p className="mt-1 text-paper">{value}</p></div>;
}
