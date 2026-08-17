"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function TapCard({
  selected,
  onClick,
  title,
  subtitle,
  indicator,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  indicator?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      animate={selected ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={`w-full border px-4 py-4 text-left transition-colors ${
        selected
          ? "border-teal bg-teal/10"
          : "border-steel/25 bg-transparent hover:border-steel/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-paper">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-xs text-steel">{subtitle}</div>
          ) : null}
        </div>
        {indicator}
      </div>
      {children}
    </motion.button>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`border px-3 py-1.5 text-xs tracking-wide ${
        selected
          ? "border-teal text-teal"
          : "border-steel/30 text-steel hover:border-steel/60"
      }`}
    >
      {children}
    </motion.button>
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = ((step + 1) / total) * 100;
  return (
    <div className="h-[2px] w-full bg-steel/20">
      <motion.div
        className="h-full bg-teal"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
    </div>
  );
}

export function EfficiencyDot({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-teal" : value >= 40 ? "bg-gold" : "bg-clay";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="font-mono-num text-[11px] text-steel">{value}%</span>
    </div>
  );
}
