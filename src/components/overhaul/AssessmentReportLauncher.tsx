"use client";

import Link from "next/link";

export default function AssessmentReportLauncher() {
  return (
    <div className="fixed bottom-4 left-4 z-50 no-print">
      <Link href="/report" className="group flex items-center gap-3 border border-gold/35 bg-[#070b0b]/95 px-4 py-3 shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-gold/70">
        <span className="grid h-8 w-8 place-items-center border border-gold/30 font-mono text-[9px] text-gold transition group-hover:rotate-3">PDF</span>
        <span><span className="block font-mono text-[8px] uppercase tracking-[0.15em] text-gold">Final report</span><span className="mt-0.5 block text-[10px] text-paper">Export complete analysis</span></span>
      </Link>
    </div>
  );
}
