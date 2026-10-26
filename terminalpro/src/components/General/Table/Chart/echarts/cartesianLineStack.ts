import type { SnapshotRow } from "../compatibility/snapshotTypes";
import {
  type LineStackInput,
  LineStackOverflowError,
  type LineStackProjection,
} from "./cartesianLineTypes";

function groups(input: LineStackInput): number[][] {
  const grouped = new Map<string, number[]>();
  const first: unknown = input.snapshot.rows[0]?.category;
  input.snapshot.rows.forEach((row, index) => {
    let coordinate: unknown = row.category;
    if (
      input.categoryAxisType === "time" &&
      !(first instanceof Date) &&
      typeof coordinate === "string"
    )
      coordinate = new Date(coordinate);
    const key =
      input.categoryAxisType === "category"
        ? String(index)
        : typeof coordinate === "object"
          ? JSON.stringify(coordinate)
          : String(coordinate);
    const rows = grouped.get(key) ?? [];
    rows.push(index);
    grouped.set(key, rows);
  });
  return [...grouped.values()];
}
interface Endpoint {
  readonly row: number;
  readonly id: string;
  readonly raw: number | null;
}
function endpoints(input: LineStackInput, indices: readonly number[]): Endpoint[] {
  return input.columns.flatMap((column) =>
    indices.map((row) => {
      const value = input.snapshot.rows[row].values[column.id];
      const admitted =
        input.legendSelection?.[column.id] !== false &&
        typeof value === "number" &&
        Number.isFinite(value);
      return { row, id: column.id, raw: admitted ? value : null };
    }),
  );
}
function prefixes(points: readonly Endpoint[], scale: number): number[] {
  let sum = 0;
  return points.map((point) => {
    sum += (point.raw ?? 0) / scale;
    return sum;
  });
}
function coordinates(
  points: readonly Endpoint[],
  normalized: boolean,
): (number | null)[] {
  let sums = prefixes(points, 1);
  const overflow = sums.some((value) => !Number.isFinite(value));
  let scale = 1;
  if (overflow) {
    scale = points.reduce((max, point) => Math.max(max, Math.abs(point.raw ?? 0)), 0);
    sums = prefixes(points, scale);
  }
  if (!normalized) {
    const restored = sums.map((value) => value * scale);
    if (restored.some((value) => !Number.isFinite(value)))
      throw new LineStackOverflowError();
    return restored.map((value, i) => (points[i].raw === null ? null : value));
  }
  const denominator = sums.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  return sums.map((value, i) =>
    points[i].raw === null || denominator === 0
      ? null
      : Math.max(-100, Math.min(100, (value / denominator) * 100)),
  );
}

/** Derives geometry only; source observations remain the unit-bearing display owner. */
export function projectLineStack(input: LineStackInput): LineStackProjection {
  const values = input.snapshot.rows.map((row) => ({ ...row.values }));
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const indices of groups(input)) {
    const points = endpoints(input, indices);
    const drawn = coordinates(points, input.family === "normalizedLine");
    points.forEach((point, i) => {
      const value = drawn[i];
      values[point.row][point.id] = value;
      if (value !== null) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
  }
  const empty = !Number.isFinite(min);
  const rows: SnapshotRow[] = input.snapshot.rows.map((row, i) => ({
    ...row,
    values: values[i],
  }));
  return {
    drawn: { ...input.snapshot, rows },
    extent: empty ? { min: 0, max: 1 } : { min, max },
    empty,
  };
}
