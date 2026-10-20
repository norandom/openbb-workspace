import type { SnapshotPolicy } from "../compatibility/snapshotTypes";
import { isXyChartFamily } from "./xySessionTypes";

export function observationSnapshotPolicy(family: string): SnapshotPolicy | undefined {
  return family === "histogram" ? "histogram-observations"
    : isXyChartFamily(family) ? "xy-coordinates" : undefined;
}
/** Native intrinsic calls avoid invoking a provider object's arbitrary coercion hooks. */
export function normalizeHistogramObservation(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || typeof value !== "object") return null;
  try {
    const number = Number.prototype.valueOf.call(value);
    return Number.isFinite(number) ? number : null;
  } catch {
    try {
      const timestamp = Date.prototype.getTime.call(value);
      return Number.isFinite(timestamp) ? timestamp : null;
    } catch {
      return null;
    }
  }
}
