/** Provenance for every important engineering property. Never treat ASSUMED as measured. */

export const PROVENANCE_KINDS = [
  "USER_PROVIDED",
  "EVIDENCE_VERIFIED",
  "EXTERNAL_DATA",
  "CALCULATED",
  "ASSUMED",
  "UNKNOWN",
] as const;

export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export interface ProvenanceRecord {
  kind: ProvenanceKind;
  /** Human-readable note; assumptions must be explicit */
  note?: string;
  evidenceIds?: string[];
  sourceId?: string;
  recordedAt: string;
}

export interface ProvenancedValue<T> {
  value: T | null;
  provenance: ProvenanceRecord;
  /** Display unit if different from internal */
  displayUnit?: string;
  originalValue?: number | string | null;
}

export function unknownValue<T = never>(): ProvenancedValue<T> {
  return {
    value: null,
    provenance: {
      kind: "UNKNOWN",
      recordedAt: new Date().toISOString(),
    },
  };
}

export function userProvided<T>(
  value: T,
  opts?: { displayUnit?: string; originalValue?: number | string | null }
): ProvenancedValue<T> {
  return {
    value,
    displayUnit: opts?.displayUnit,
    originalValue: opts?.originalValue ?? null,
    provenance: {
      kind: "USER_PROVIDED",
      recordedAt: new Date().toISOString(),
    },
  };
}

export function externalData<T>(
  value: T,
  sourceId: string,
  note?: string
): ProvenancedValue<T> {
  return {
    value,
    provenance: {
      kind: "EXTERNAL_DATA",
      sourceId,
      note,
      recordedAt: new Date().toISOString(),
    },
  };
}

export function evidenceVerified<T>(
  value: T,
  evidenceIds: string[],
  note?: string
): ProvenancedValue<T> {
  return {
    value,
    provenance: {
      kind: "EVIDENCE_VERIFIED",
      evidenceIds,
      note,
      recordedAt: new Date().toISOString(),
    },
  };
}

export function isKnown<T>(p: ProvenancedValue<T>): p is ProvenancedValue<T> & {
  value: T;
} {
  return p.value !== null && p.provenance.kind !== "UNKNOWN";
}

export function assertNotSilentAssumption(p: ProvenancedValue<unknown>): void {
  if (p.provenance.kind === "ASSUMED" && !p.provenance.note) {
    throw new Error("ASSUMED values require an explicit note");
  }
}
