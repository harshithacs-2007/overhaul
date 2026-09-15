"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { EvidenceCategory, EvidenceItem } from "@/lib/evidence/types";
import {
  createEmptyBuildingModel,
  type BuildingElementKind,
  type BuildingModel,
} from "@/lib/building/types";
import {
  createEmptyEngineeringModel,
  type EngineeringReadyModel,
} from "@/lib/engineering/model";

export type WorkspaceSection =
  | "overview"
  | "evidence"
  | "building"
  | "climate"
  | "physics"
  | "hvac"
  | "simulate"
  | "optimize"
  | "sequence"
  | "retrofit"
  | "results";

export type Selection =
  | { type: "none" }
  | { type: "evidence"; id: string }
  | { type: "element"; id: BuildingElementKind };

export type CenterMode =
  | "first"
  | "overview"
  | "camera"
  | "upload"
  | "manual"
  | "building"
  | "evidence"
  | "physics"
  | "simulate"
  | "optimize"
  | "sequence";

interface State {
  section: WorkspaceSection;
  centerMode: CenterMode;
  evidence: EvidenceItem[];
  building: BuildingModel;
  engineering: EngineeringReadyModel;
  selection: Selection;
  statusMessage: string;
  navOpen: boolean;
  inspectorOpenMobile: boolean;
}

type Action =
  | { type: "setSection"; section: WorkspaceSection }
  | { type: "setCenterMode"; mode: CenterMode }
  | { type: "addEvidence"; item: EvidenceItem }
  | { type: "updateEvidence"; id: string; patch: Partial<EvidenceItem> }
  | { type: "removeEvidence"; id: string }
  | { type: "replaceEvidence"; id: string; item: EvidenceItem }
  | { type: "setSelection"; selection: Selection }
  | { type: "setBuilding"; building: BuildingModel }
  | { type: "setEngineering"; engineering: EngineeringReadyModel }
  | { type: "selectElement"; id: BuildingElementKind }
  | {
      type: "linkEvidenceToElement";
      elementId: BuildingElementKind;
      evidenceId: string;
    }
  | { type: "setStatus"; message: string }
  | { type: "setNavOpen"; open: boolean }
  | { type: "setInspectorOpenMobile"; open: boolean };

const initial: State = {
  section: "overview",
  centerMode: "first",
  evidence: [],
  building: createEmptyBuildingModel(),
  engineering: createEmptyEngineeringModel(),
  selection: { type: "none" },
  statusMessage: "Ready — no analysis claimed",
  navOpen: false,
  inspectorOpenMobile: false,
};

function isLocked(_section: WorkspaceSection): boolean {
  void _section;
  return false;
}

function normalizeSection(s: WorkspaceSection): WorkspaceSection {
  if (s === "retrofit") return "simulate";
  if (s === "results") return "optimize";
  return s;
}

function sectionForMode(mode: CenterMode): WorkspaceSection {
  if (mode === "overview" || mode === "first") return "overview";
  if (mode === "evidence" || mode === "camera" || mode === "upload")
    return "evidence";
  if (mode === "building" || mode === "manual") return "building";
  if (mode === "physics") return "physics";
  if (mode === "simulate") return "simulate";
  if (mode === "optimize") return "optimize";
  if (mode === "sequence") return "sequence";
  return "overview";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setSection": {
      const section = normalizeSection(action.section);
      if (isLocked(section)) {
        return {
          ...state,
          section,
          statusMessage: `${section} — locked`,
        };
      }
      const mode: CenterMode =
        section === "overview"
          ? state.evidence.length
            ? "overview"
            : "first"
          : section === "evidence"
            ? "evidence"
            : section === "building"
              ? "building"
              : section === "climate" || section === "hvac" || section === "physics"
                ? "physics"
                : section === "simulate"
                  ? "simulate"
                  : section === "optimize"
                    ? "optimize"
                    : section === "sequence"
                      ? "sequence"
                      : state.centerMode;
      return { ...state, section, centerMode: mode };
    }
    case "setCenterMode":
      return {
        ...state,
        centerMode: action.mode,
        section: sectionForMode(action.mode),
      };
    case "addEvidence":
      return {
        ...state,
        evidence: [action.item, ...state.evidence],
        statusMessage: `Evidence added · analysis: ${action.item.analysisState.replaceAll("_", " ")}`,
        centerMode: "evidence",
        section: "evidence",
        selection: { type: "evidence", id: action.item.id },
        inspectorOpenMobile: true,
      };
    case "updateEvidence":
      return {
        ...state,
        evidence: state.evidence.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e
        ),
      };
    case "removeEvidence":
      return {
        ...state,
        evidence: state.evidence.filter((e) => e.id !== action.id),
        selection:
          state.selection.type === "evidence" &&
          state.selection.id === action.id
            ? { type: "none" }
            : state.selection,
        building: {
          ...state.building,
          elements: state.building.elements.map((el) => ({
            ...el,
            linkedEvidenceIds: el.linkedEvidenceIds.filter(
              (id) => id !== action.id
            ),
          })),
        },
        statusMessage: "Evidence removed",
      };
    case "replaceEvidence":
      return {
        ...state,
        evidence: state.evidence.map((e) =>
          e.id === action.id ? action.item : e
        ),
        selection: { type: "evidence", id: action.item.id },
        statusMessage: "Evidence replaced",
      };
    case "setSelection":
      return {
        ...state,
        selection: action.selection,
        inspectorOpenMobile: action.selection.type !== "none",
      };
    case "setBuilding":
      return { ...state, building: action.building };
    case "setEngineering":
      return { ...state, engineering: action.engineering };
    case "selectElement":
      return {
        ...state,
        section: "building",
        centerMode: "building",
        building: {
          ...state.building,
          elements: state.building.elements.map((el) => ({
            ...el,
            selected: el.id === action.id,
          })),
        },
        selection: { type: "element", id: action.id },
        inspectorOpenMobile: true,
      };
    case "linkEvidenceToElement":
      return {
        ...state,
        building: {
          ...state.building,
          elements: state.building.elements.map((el) =>
            el.id === action.elementId
              ? {
                  ...el,
                  linkedEvidenceIds: el.linkedEvidenceIds.includes(
                    action.evidenceId
                  )
                    ? el.linkedEvidenceIds
                    : [...el.linkedEvidenceIds, action.evidenceId],
                }
              : el
          ),
        },
      };
    case "setStatus":
      return { ...state, statusMessage: action.message };
    case "setNavOpen":
      return { ...state, navOpen: action.open };
    case "setInspectorOpenMobile":
      return { ...state, inspectorOpenMobile: action.open };
    default:
      return state;
  }
}

interface CtxValue {
  state: State;
  setSection: (s: WorkspaceSection) => void;
  setCenterMode: (m: CenterMode) => void;
  addEvidence: (item: EvidenceItem) => void;
  updateEvidence: (id: string, patch: Partial<EvidenceItem>) => void;
  removeEvidence: (id: string) => void;
  replaceEvidence: (id: string, item: EvidenceItem) => void;
  setSelection: (s: Selection) => void;
  selectElement: (id: BuildingElementKind) => void;
  setBuilding: (b: BuildingModel) => void;
  setEngineering: (m: EngineeringReadyModel) => void;
  linkEvidence: (elementId: BuildingElementKind, evidenceId: string) => void;
  setStatus: (m: string) => void;
  setNavOpen: (o: boolean) => void;
  setInspectorOpenMobile: (o: boolean) => void;
  categorize: (id: string, category: EvidenceCategory) => void;
  selectedEvidence: EvidenceItem | null;
}

const WorkspaceCtx = createContext<CtxValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const selectedEvidence = useMemo(() => {
    if (state.selection.type !== "evidence") return null;
    const evidenceId = state.selection.id;
    return state.evidence.find((e) => e.id === evidenceId) ?? null;
  }, [state.evidence, state.selection]);

  const setSection = useCallback(
    (section: WorkspaceSection) => dispatch({ type: "setSection", section }),
    []
  );
  const setCenterMode = useCallback(
    (mode: CenterMode) => dispatch({ type: "setCenterMode", mode }),
    []
  );
  const addEvidence = useCallback(
    (item: EvidenceItem) => dispatch({ type: "addEvidence", item }),
    []
  );
  const updateEvidence = useCallback(
    (id: string, patch: Partial<EvidenceItem>) =>
      dispatch({ type: "updateEvidence", id, patch }),
    []
  );
  const removeEvidence = useCallback(
    (id: string) => dispatch({ type: "removeEvidence", id }),
    []
  );
  const replaceEvidence = useCallback(
    (id: string, item: EvidenceItem) =>
      dispatch({ type: "replaceEvidence", id, item }),
    []
  );
  const setSelection = useCallback(
    (selection: Selection) => dispatch({ type: "setSelection", selection }),
    []
  );
  const selectElement = useCallback(
    (id: BuildingElementKind) => dispatch({ type: "selectElement", id }),
    []
  );
  const setBuilding = useCallback(
    (building: BuildingModel) => dispatch({ type: "setBuilding", building }),
    []
  );
  const setEngineering = useCallback(
    (engineering: EngineeringReadyModel) =>
      dispatch({ type: "setEngineering", engineering }),
    []
  );
  const linkEvidence = useCallback(
    (elementId: BuildingElementKind, evidenceId: string) =>
      dispatch({ type: "linkEvidenceToElement", elementId, evidenceId }),
    []
  );
  const setStatus = useCallback(
    (message: string) => dispatch({ type: "setStatus", message }),
    []
  );
  const setNavOpen = useCallback(
    (open: boolean) => dispatch({ type: "setNavOpen", open }),
    []
  );
  const setInspectorOpenMobile = useCallback(
    (open: boolean) => dispatch({ type: "setInspectorOpenMobile", open }),
    []
  );
  const categorize = useCallback((id: string, category: EvidenceCategory) => {
    dispatch({
      type: "updateEvidence",
      id,
      patch: {
        category,
        reviewState: category === "other" ? "unclassified" : "needs_review",
      },
    });
  }, []);

  const value: CtxValue = {
    state,
    setSection,
    setCenterMode,
    addEvidence,
    updateEvidence,
    removeEvidence,
    replaceEvidence,
    setSelection,
    selectElement,
    setBuilding,
    setEngineering,
    linkEvidence,
    setStatus,
    setNavOpen,
    setInspectorOpenMobile,
    categorize,
    selectedEvidence,
  };

  return (
    <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>
  );
}

export function useWorkspace(): CtxValue {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace requires WorkspaceProvider");
  return ctx;
}

export { isLocked };