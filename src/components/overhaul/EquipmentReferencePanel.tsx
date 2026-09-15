"use client";

import { useMemo } from "react";
import { buildEquipmentReference } from "@/lib/engineering/equipmentReference";

type RawObservation = {
  field: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  confidence: number;
  sourceText: string;
};

type Extraction = { evidenceId?: string; evidenceType?: string; observations?: RawObservation[] };

export default function EquipmentReferencePanel({ extracts }: { extracts: Extraction[] }) {
  const reference = useMemo(() => buildEquipmentReference(extracts), [extracts]);
  return (
    <section className="mt-4 border border-teal/20 bg-teal/[0.03] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Independent reference layer</p>
          <h3 className="mt-1 text-lg">Healthy performance is calculated before comparison.</h3>
        </div>
        <span className="font-mono text-[8px] uppercase text-steel">{reference.length ? `${reference.length} reference signal${reference.length === 1 ? "" : "s"}` : "Reference not established"}</span>
      </div>
      {reference.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {reference.map((item) => (
            <div key={`${item.key}-${item.expected}`} className="border border-steel/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[8px] uppercase text-steel">{item.key.replaceAll("_", " ")}</span>
                <span className="font-mono text-[8px] uppercase text-teal">{item.reference.source}</span>
              </div>
              <p className="mt-2 text-xl">{item.expected.toFixed(2)} {item.unit}</p>
              <p className="mt-1 text-[10px] leading-4 text-steel">±{(item.toleranceRelative * 100).toFixed(0)}% tolerance · {item.reference.basis}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-steel">No independent healthy reference was found in the supplied evidence. OVERHAUL will request a nameplate, performance sheet, or validated operating reference rather than inventing one.</p>
      )}
    </section>
  );
}
