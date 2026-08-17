"use client";

import { motion } from "framer-motion";

/**
 * Signature thermal ribbon — color stop driven by load-vs-capacity ratio.
 * position 0 = fully efficient (teal end), 1 = overloaded/inefficient (clay end)
 */
export function ThermalRibbon({
  position,
  label,
  className = "",
}: {
  position: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.min(Math.max(position, 0), 1);

  return (
    <div className={`w-full ${className}`}>
      {label ? (
        <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.14em] text-steel">
          <span>Efficient</span>
          <span className="font-mono-num text-paper/80">{label}</span>
          <span>Stressed</span>
        </div>
      ) : null}
      <div className="thermal-ribbon">
        <motion.span
          className="thermal-ribbon-marker"
          initial={{ left: "0%" }}
          animate={{ left: `${clamped * 100}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
