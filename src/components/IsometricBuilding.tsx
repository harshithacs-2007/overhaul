"use client";

import { motion, type Variants } from "framer-motion";

/** Simple isometric building line-drawing — stroke draw on mount */
export function IsometricBuilding({
  className = "",
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  const draw: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { delay: delay + i * 0.08, duration: 0.8, ease: "easeOut" as const },
        opacity: { delay: delay + i * 0.08, duration: 0.2 },
      },
    }),
  };

  return (
    <svg
      viewBox="0 0 200 160"
      className={className}
      fill="none"
      aria-hidden
    >
      <motion.path
        d="M100 20 L170 55 L170 115 L100 150 L30 115 L30 55 Z"
        stroke="currentColor"
        strokeWidth="1.2"
        custom={0}
        variants={draw}
        initial="hidden"
        animate="visible"
      />
      <motion.path
        d="M100 20 L100 80 L170 115"
        stroke="currentColor"
        strokeWidth="1.2"
        custom={1}
        variants={draw}
        initial="hidden"
        animate="visible"
      />
      <motion.path
        d="M100 80 L30 115"
        stroke="currentColor"
        strokeWidth="1.2"
        custom={2}
        variants={draw}
        initial="hidden"
        animate="visible"
      />
      <motion.path
        d="M70 95 L70 125 M70 95 L100 110 M100 110 L100 140"
        stroke="currentColor"
        strokeWidth="1"
        custom={3}
        variants={draw}
        initial="hidden"
        animate="visible"
      />
      <motion.path
        d="M120 70 L150 85 L150 105 L120 90 Z"
        stroke="currentColor"
        strokeWidth="1"
        custom={4}
        variants={draw}
        initial="hidden"
        animate="visible"
      />
    </svg>
  );
}
