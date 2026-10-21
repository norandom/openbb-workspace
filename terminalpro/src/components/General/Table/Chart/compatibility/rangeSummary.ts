import type { SnapshotDiagnostic } from "./snapshotTypes";

export interface RangeSummary {
  readonly min: number;
  readonly max: number;
}

export type RangeSummaryResult =
  | {
      readonly status: "resolved";
      readonly count: number;
      readonly summary: RangeSummary | null;
    }
  | { readonly status: "invalid"; readonly diagnostics: readonly SnapshotDiagnostic[] };

function invalid(
  message: string,
  path: readonly (string | number)[] = [],
): RangeSummaryResult {
  return { status: "invalid", diagnostics: [{ code: "invalid-input", path, message }] };
}

function resolve(values: unknown): RangeSummaryResult {
  if (!Array.isArray(values))
    return invalid("Expected a dense array of finite numbers or null.");
  const length = values.length;
  if (!Number.isSafeInteger(length) || length < 0)
    return invalid("Invalid array length.");
  let count = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(values, index)) return invalid("Missing observation.", [index]);
    const value: unknown = values[index];
    if (value === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return invalid("Expected a finite number or null.", [index]);
    }
    // Pairwise extrema preserve signed zero without spread limits or endpoint arithmetic.
    min = Math.min(min, value);
    max = Math.max(max, value);
    count++;
  }
  return { status: "resolved", count, summary: count === 0 ? null : { min, max } };
}

export function calculateRangeSummary(values: unknown): RangeSummaryResult {
  try {
    return resolve(values);
  } catch {
    return invalid("Range summary input could not be read safely.");
  }
}
