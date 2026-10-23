import type { SnapshotDiagnostic } from "./snapshotTypes";

export interface WaterfallPoint {
  readonly index: number;
  readonly delta: number | null;
  readonly start: number;
  readonly end: number;
  readonly kind: "positive" | "negative" | "missing";
}

export type WaterfallTotalsResult =
  | {
      readonly status: "resolved";
      readonly points: readonly WaterfallPoint[];
      readonly extent: readonly [number, number];
      readonly count: number;
    }
  | { readonly status: "invalid"; readonly diagnostics: readonly SnapshotDiagnostic[] };

function invalid(
  message: string,
  path: readonly (string | number)[] = [],
): WaterfallTotalsResult {
  return { status: "invalid", diagnostics: [{ code: "invalid-input", path, message }] };
}

function resolve(values: unknown): WaterfallTotalsResult {
  if (!Array.isArray(values))
    return invalid("Expected a dense array of finite numbers or null.");
  const length = values.length;
  if (!Number.isSafeInteger(length) || length < 0) return invalid("Invalid array length.");
  const points: WaterfallPoint[] = [];
  let count = 0;
  let balance = 0;
  let min = 0;
  let max = 0;
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(values, index)) return invalid("Missing observation.", [index]);
    const delta: unknown = values[index];
    if (delta !== null && (typeof delta !== "number" || !Number.isFinite(delta)))
      return invalid("Expected a finite number or null.", [index]);
    const end = delta === null ? balance : balance + delta;
    if (!Number.isFinite(end)) return invalid("Cumulative balance is nonfinite.", [index]);
    // Missing rows retain their source position; only signed movements advance the balance.
    points.push(Object.freeze({
      index, delta, start: balance, end,
      kind: delta === null ? "missing" : delta < 0 ? "negative" : "positive",
    }));
    if (delta !== null) count++;
    min = Math.min(min, end);
    max = Math.max(max, end);
    balance = end;
  }
  return {
    status: "resolved", points: Object.freeze(points), count,
    extent: Object.freeze([min, max] as const),
  };
}

export function projectWaterfallTotals(values: unknown): WaterfallTotalsResult {
  try {
    return resolve(values);
  } catch {
    return invalid("Waterfall movement input could not be read safely.");
  }
}
