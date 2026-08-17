"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { BuildingElementKind } from "@/lib/building/types";

/**
 * Data-driven technical building visualization (SVG).
 * No stock house imagery. Elements selectable for inspector.
 */
export function BuildingCanvas() {
  const { state, selectElement } = useWorkspace();
  const reduce = useReducedMotion();
  const selected =
    state.selection.type === "element" ? state.selection.id : null;

  const stroke = (id: BuildingElementKind) =>
    selected === id ? "var(--teal)" : "var(--steel)";
  const fill = (id: BuildingElementKind) =>
    selected === id
      ? "color-mix(in srgb, var(--teal) 18%, transparent)"
      : "color-mix(in srgb, var(--steel) 6%, transparent)";

  const evidenceCount = (id: BuildingElementKind) =>
    state.building.elements.find((e) => e.id === id)?.linkedEvidenceIds.length ??
    0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-steel/20 px-4 py-3">
        <h2 className="font-display text-xl text-paper">Building model</h2>
        <p className="text-xs text-steel">
          Structure · envelope · openings · HVAC — select an element. No values
          invented.
        </p>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-4">
        <motion.svg
          viewBox="0 0 400 320"
          className="h-full max-h-[420px] w-full max-w-xl text-steel"
          role="img"
          aria-label="Technical building model diagram"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Ground line */}
          <line
            x1="40"
            y1="280"
            x2="360"
            y2="280"
            stroke="currentColor"
            strokeWidth="0.75"
            opacity="0.4"
          />

          {/* Walls mass */}
          <motion.path
            d="M80 260 L80 140 L200 80 L320 140 L320 260 Z"
            fill={fill("walls")}
            stroke={stroke("walls")}
            strokeWidth={selected === "walls" ? 2 : 1.25}
            className="cursor-pointer"
            tabIndex={0}
            role="button"
            aria-label={`Walls${evidenceCount("walls") ? `, ${evidenceCount("walls")} evidence` : ""}`}
            onClick={() => selectElement("walls")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectElement("walls");
            }}
            whileHover={reduce ? undefined : { opacity: 0.95 }}
          />

          {/* Roof plane */}
          <motion.path
            d="M70 145 L200 70 L330 145 L200 95 Z"
            fill={fill("roof")}
            stroke={stroke("roof")}
            strokeWidth={selected === "roof" ? 2 : 1.25}
            className="cursor-pointer"
            tabIndex={0}
            role="button"
            aria-label="Roof"
            onClick={() => selectElement("roof")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectElement("roof");
            }}
          />

          {/* Windows openings */}
          <motion.g
            className="cursor-pointer"
            tabIndex={0}
            role="button"
            aria-label="Windows"
            onClick={() => selectElement("windows")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectElement("windows");
            }}
          >
            <rect
              x="110"
              y="170"
              width="36"
              height="48"
              fill={fill("windows")}
              stroke={stroke("windows")}
              strokeWidth={selected === "windows" ? 2 : 1.1}
            />
            <rect
              x="254"
              y="170"
              width="36"
              height="48"
              fill={fill("windows")}
              stroke={stroke("windows")}
              strokeWidth={selected === "windows" ? 2 : 1.1}
            />
            <line
              x1="128"
              y1="170"
              x2="128"
              y2="218"
              stroke={stroke("windows")}
              strokeWidth="0.8"
            />
            <line
              x1="272"
              y1="170"
              x2="272"
              y2="218"
              stroke={stroke("windows")}
              strokeWidth="0.8"
            />
          </motion.g>

          {/* HVAC unit — outdoor condenser glyph */}
          <motion.g
            className="cursor-pointer"
            tabIndex={0}
            role="button"
            aria-label="HVAC"
            onClick={() => selectElement("hvac")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectElement("hvac");
            }}
          >
            <rect
              x="300"
              y="232"
              width="44"
              height="28"
              rx="1"
              fill={fill("hvac")}
              stroke={stroke("hvac")}
              strokeWidth={selected === "hvac" ? 2 : 1.1}
            />
            <circle
              cx="322"
              cy="246"
              r="7"
              fill="none"
              stroke={stroke("hvac")}
              strokeWidth="1"
            />
            <path
              d="M314 246 h16 M322 238 v16"
              stroke={stroke("hvac")}
              strokeWidth="0.8"
            />
          </motion.g>

          {/* Dimension ticks — technical language */}
          <g opacity="0.45" stroke="currentColor" strokeWidth="0.6">
            <line x1="80" y1="292" x2="320" y2="292" />
            <line x1="80" y1="288" x2="80" y2="296" />
            <line x1="320" y1="288" x2="320" y2="296" />
          </g>
          <text
            x="200"
            y="308"
            textAnchor="middle"
            fill="var(--steel)"
            fontSize="9"
            fontFamily="var(--font-ibm-plex-mono)"
          >
            envelope schematic · not to scale
          </text>
        </motion.svg>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-steel/20 p-3 sm:grid-cols-4">
        {state.building.elements.map((el) => (
          <button
            key={el.id}
            type="button"
            onClick={() => selectElement(el.id)}
            className={`border px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
              selected === el.id
                ? "border-teal text-teal"
                : "border-steel/25 text-steel hover:text-paper"
            }`}
          >
            <div className="text-[11px] uppercase tracking-[0.12em]">
              {el.label}
            </div>
            <div className="mt-1 font-mono-num text-[10px]">
              {el.linkedEvidenceIds.length
                ? `${el.linkedEvidenceIds.length} evidence`
                : "no evidence"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
