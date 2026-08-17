"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useWorkspace,
  type WorkspaceSection,
} from "./WorkspaceProvider";
import { FirstExperience } from "./FirstExperience";
import { Inspector } from "./Inspector";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { UploadDropzone } from "@/components/evidence/UploadDropzone";
import { BuildingCanvas } from "@/components/building/BuildingCanvas";
import { ManualBuilder } from "@/components/building/ManualBuilder";
import { PhysicsPanel } from "@/components/building/PhysicsPanel";
import { RetrofitPanel } from "@/components/retrofit/RetrofitPanel";

const CameraCapture = dynamic(
  () =>
    import("@/components/evidence/CameraCapture").then((m) => m.CameraCapture),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-steel">
        Loading camera…
      </div>
    ),
  }
);

const NAV: { id: WorkspaceSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "building", label: "Building" },
  { id: "climate", label: "Climate" },
  { id: "physics", label: "Physics" },
  { id: "hvac", label: "HVAC" },
  { id: "simulate", label: "Simulate" },
  { id: "optimize", label: "Optimize" },
  { id: "sequence", label: "Sequence" },
];

export function WorkspaceShell() {
  const {
    state,
    setSection,
    setCenterMode,
    setNavOpen,
    setInspectorOpenMobile,
  } = useWorkspace();
  const reduce = useReducedMotion();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-navy text-paper">
      {/* Top bar — mobile */}
      <header className="flex items-center justify-between border-b border-steel/20 px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setNavOpen(!state.navOpen)}
          className="border border-steel/30 px-2 py-1 text-[11px] uppercase tracking-wide text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          aria-expanded={state.navOpen}
        >
          Menu
        </button>
        <span className="font-display text-lg text-paper">Overhaul</span>
        <button
          type="button"
          onClick={() => setInspectorOpenMobile(true)}
          className="border border-steel/30 px-2 py-1 text-[11px] uppercase tracking-wide text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Inspect
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Left nav */}
        <nav
          aria-label="Workspace"
          className={`absolute inset-y-0 left-0 z-30 w-52 border-r border-steel/20 bg-navy transition-transform lg:static lg:translate-x-0 ${
            state.navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="hidden border-b border-steel/20 px-4 py-4 lg:block">
            <p className="font-display text-xl text-paper">Overhaul</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-steel">
              Engineering workspace
            </p>
          </div>
          <ul className="space-y-0.5 p-2">
            {NAV.map((item) => {
              const active = state.section === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setNavOpen(false);
                      if (item.id === "evidence") setCenterMode("evidence");
                      if (item.id === "building") setCenterMode("building");
                      if (
                        item.id === "climate" ||
                        item.id === "hvac" ||
                        item.id === "physics"
                      )
                        setCenterMode("physics");
                      if (item.id === "simulate") setCenterMode("simulate");
                      if (item.id === "optimize") setCenterMode("optimize");
                      if (item.id === "sequence") setCenterMode("sequence");
                      if (item.id === "overview")
                        setCenterMode(
                          state.evidence.length ? "building" : "first"
                        );
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                      active
                        ? "bg-paper/5 text-paper"
                        : "text-steel hover:text-paper"
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {state.navOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-20 bg-black/40 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        {/* Center */}
        <main className="relative min-w-0 flex-1 overflow-hidden border-r border-steel/10">
          <AnimatePresence mode="wait">
            <motion.div
              key={state.centerMode}
              className="h-full"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {state.centerMode === "first" && <FirstExperience />}
              {state.centerMode === "camera" && (
                <CameraCapture onClose={() => setCenterMode("evidence")} />
              )}
              {state.centerMode === "upload" && (
                <UploadDropzone onClose={() => setCenterMode("evidence")} />
              )}
              {state.centerMode === "evidence" && <EvidencePanel />}
              {state.centerMode === "building" && <BuildingCanvas />}
              {state.centerMode === "manual" && (
                <ManualBuilder onDone={() => setCenterMode("building")} />
              )}
              {state.centerMode === "physics" && <PhysicsPanel />}
              {state.centerMode === "simulate" && (
                <RetrofitPanel view="simulate" />
              )}
              {state.centerMode === "optimize" && (
                <RetrofitPanel view="optimize" />
              )}
              {state.centerMode === "sequence" && (
                <RetrofitPanel view="sequence" />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right inspector — desktop */}
        <div className="hidden w-80 shrink-0 lg:block xl:w-96">
          <Inspector />
        </div>

        {/* Inspector sheet — mobile */}
        <AnimatePresence>
          {state.inspectorOpenMobile ? (
            <motion.div
              className="absolute inset-0 z-40 flex flex-col justify-end lg:hidden"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
            >
              <button
                type="button"
                className="flex-1 bg-black/50"
                aria-label="Dismiss inspector"
                onClick={() => setInspectorOpenMobile(false)}
              />
              <motion.div
                className="max-h-[75vh] overflow-hidden border-t border-steel/30 bg-navy"
                initial={reduce ? false : { y: "100%" }}
                animate={{ y: 0 }}
                exit={reduce ? undefined : { y: "100%" }}
                transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
              >
                <Inspector />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Bottom status strip */}
      <footer className="flex items-center justify-between gap-4 border-t border-steel/20 px-3 py-2 text-[11px] text-steel">
        <span className="truncate">{state.statusMessage}</span>
        <span className="shrink-0 font-mono-num">
          evidence {state.evidence.length} · analysis not claimed
        </span>
      </footer>
    </div>
  );
}
