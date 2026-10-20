import type { XySeriesAssignment } from "../compatibility/xyAssignments";
import type { XyDatum, XyMappingInput } from "./xyTypes";
/** Scaling by the largest magnitude keeps opposite signed finite domains finite. */
function ratio(value: number, low: number, high: number): number {
  if (Number.isFinite(high - low)) return (value - low) / (high - low);
  const magnitude = Math.max(Math.abs(low), Math.abs(high), Math.abs(value));
  return (
    (value / magnitude - low / magnitude) / (high / magnitude - low / magnitude)
  );
}
function diameter(
  value: number | null | undefined,
  domain: readonly number[],
  a: number,
  b: number,
): number {
  if (typeof value !== "number") return a;
  const [low, high] = domain;
  if (low === high) return a / 2 + b / 2;
  const t = ratio(value, low, high);
  const result = (1 - t) * a + t * b;
  if (!Number.isFinite(result)) throw Error("Nonfinite bubble diameter.");
  return result;
}
function domain(
  input: XyMappingInput,
  assignment: XySeriesAssignment,
): number[] {
  let low = Infinity,
    high = -Infinity;
  for (const row of input.snapshot.rows) {
    const v =
      assignment.sizeColId === undefined
        ? undefined
        : row.values[assignment.sizeColId];
    if (typeof v === "number") {
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
  }
  return [low, high];
}
export function xyObservations(
  input: XyMappingInput,
  assignment: XySeriesAssignment,
): XyDatum[] {
  const columns = new Map(input.snapshot.columns.map((c) => [c.id, c]));
  const sizes = domain(input, assignment);
  return input.snapshot.rows.flatMap((row, rowIndex) => {
    const x = row.values[assignment.xColId],
      y = row.values[assignment.yColId];
    if (typeof x !== "number" || typeof y !== "number") return [];
    const rawSize =
      assignment.sizeColId === undefined
        ? undefined
        : row.values[assignment.sizeColId];
    return [
      {
        value: [x, y] as [number, number],
        diameter:
          input.chartType === "bubble"
            ? diameter(
                rawSize,
                sizes,
                input.style.series.markers.size,
                input.style.maxSize,
              )
            : input.style.series.markers.size,
        metadata: {
          rowId: row.id,
          rowIndex,
          category: row.category,
          x: columns.get(assignment.xColId)!,
          y: columns.get(assignment.yColId)!,
          size:
            assignment.sizeColId === undefined
              ? undefined
              : columns.get(assignment.sizeColId),
          rawX: x,
          rawY: y,
          rawSize,
        },
      },
    ];
  });
}
