import type { NormalizedRecord } from "./types";
import type { ShadowObservation } from "../engineering/digitalShadow";
import { normalizedRecordToShadowObservations } from "./shadowBridge";

export interface AggregatedSignal {
  key: ShadowObservation["key"];
  value: number;
  unit: string;
  samples: number;
  confidence: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

/**
 * Collapse time-series observations into robust calibration signals.
 * Median is used to reduce the influence of spikes while preserving provenance
 * through sample count, confidence, and time bounds.
 */
export function aggregateNormalizedRecords(records: NormalizedRecord[]): AggregatedSignal[] {
  const groups = new Map<string, ShadowObservation[]>();

  for (const record of records) {
    for (const observation of normalizedRecordToShadowObservations(record)) {
      const key = `${observation.key}|${observation.unit}`;
      const existing = groups.get(key) ?? [];
      existing.push(observation);
      groups.set(key, existing);
    }
  }

  return [...groups.values()].map((observations) => {
    const timestamps = observations
      .map((item) => item.timestamp)
      .filter((item): item is string => Boolean(item))
      .sort();
    return {
      key: observations[0].key,
      value: median(observations.map((item) => item.value)),
      unit: observations[0].unit,
      samples: observations.length,
      confidence: observations.reduce((sum, item) => sum + item.confidence, 0) / observations.length,
      firstTimestamp: timestamps[0],
      lastTimestamp: timestamps[timestamps.length - 1],
    };
  });
}

export function aggregatedSignalsToShadowObservations(
  signals: AggregatedSignal[],
): ShadowObservation[] {
  return signals.map((signal) => ({
    key: signal.key,
    value: signal.value,
    unit: signal.unit,
    source: signal.confidence >= 0.9 ? "measured" : signal.confidence >= 0.75 ? "document" : "inferred",
    confidence: signal.confidence,
    timestamp: signal.lastTimestamp,
  }));
}
