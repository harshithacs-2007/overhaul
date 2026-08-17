"use client";

import { motion, useReducedMotion } from "framer-motion";
import { IsometricBuilding } from "@/components/IsometricBuilding";
import { useWorkspace } from "./WorkspaceProvider";

export function FirstExperience() {
  const { setCenterMode } = useWorkspace();
  const reduce = useReducedMotion();

  return (
    <div className="relative flex h-full flex-col justify-center px-6 py-10 sm:px-12">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 max-w-xl"
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-steel">
          Overhaul · evidence workspace
        </p>
        <h1 className="font-display mt-4 text-4xl leading-tight text-paper sm:text-5xl">
          Let&apos;s model your building.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-steel">
          Bring evidence from the building. Overhaul turns it into a verifiable
          model.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <PrimaryAction
            label="Scan with camera"
            onClick={() => setCenterMode("camera")}
            accent="gold"
          />
          <PrimaryAction
            label="Upload evidence"
            onClick={() => setCenterMode("upload")}
            accent="teal"
          />
          <PrimaryAction
            label="Build manually"
            onClick={() => setCenterMode("manual")}
            accent="steel"
          />
        </div>
      </motion.div>

      <IsometricBuilding className="pointer-events-none absolute bottom-6 right-6 hidden h-36 w-44 text-steel/50 sm:block" />
    </div>
  );
}

function PrimaryAction({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent: "gold" | "teal" | "steel";
}) {
  const reduce = useReducedMotion();
  const styles =
    accent === "gold"
      ? "border-gold/80 text-gold hover:bg-gold/10"
      : accent === "teal"
        ? "border-teal/80 text-teal hover:bg-teal/10"
        : "border-steel/50 text-paper hover:bg-paper/5";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      className={`min-w-[11rem] border px-5 py-3.5 text-left text-sm tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${styles}`}
    >
      {label}
    </motion.button>
  );
}
