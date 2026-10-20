import type { XyMappingInput } from "./xyTypes";
/** Original number axes become empty when a one-sided bound excludes the observations. */
export function xyEmptyAxes(input: XyMappingInput): ("x" | "y")[] {
  return (["x", "y"] as const).filter((id) => {
    const spec = input.style.axes[id];
    let low = Infinity, high = -Infinity;
    for (const a of input.assignments) {
      if (input.context.legendSelection?.[a.yColId] === false) continue;
      for (const row of input.snapshot.rows) {
        const x = row.values[a.xColId], y = row.values[a.yColId];
        if (typeof x !== "number" || typeof y !== "number") continue;
        const value = id === "x" ? x : y;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
    return low !== Infinity && (
      (spec.min !== undefined && spec.min > high) ||
      (spec.max !== undefined && spec.max < low));
  });
}
