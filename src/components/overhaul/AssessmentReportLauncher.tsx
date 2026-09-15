"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function AssessmentReportLauncher() {
  return (
    <motion.div
      className="fixed bottom-4 left-4 z-50 no-print"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.35, ease: "easeOut" }}
    >
      <Link
        href="/report"
        className="group flex items-center gap-3 border border-gold/35 bg-[#070b0b]/95 px-4 py-3 shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-gold/70"
      >
        <motion.span
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-8 w-8 place-items-center border border-gold/30 font-mono text-[9px] text-gold"
        >
          PDF
        </motion.span>
        <span>
          <span className="block font-mono text-[8px] uppercase tracking-[0.15em] text-gold">Final report</span>
          <span className="mt-0.5 block text-[10px] text-paper">Export complete analysis</span>
        </span>
      </Link>
    </motion.div>
  );
}
