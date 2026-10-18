import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";

/** Keep observations immutable: only enabled finite values contribute to signed mass. */
export function normalizedCoordinates(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  selection: Readonly<Record<string, boolean>> = {},
): ChartSnapshot {
  return {
    ...snapshot,
    rows: snapshot.rows.map((row) => {
      const enabled = columns.filter((column) => selection[column.id] !== false);
      const values = enabled.map((column) => row.values[column.id]);
      // A common scale cancels from raw / max(P, abs(N)), avoiding finite-input overflow.
      const scale = values.reduce<number>(
        (max, value) =>
          typeof value === "number" ? Math.max(max, Math.abs(value)) : max,
        0,
      );
      const positive = values.reduce<number>(
        (sum, v) => sum + (typeof v === "number" && v > 0 ? v / scale : 0),
        0,
      );
      const negative = values.reduce<number>(
        (sum, v) => sum + (typeof v === "number" && v < 0 ? -v / scale : 0),
        0,
      );
      const denominator = Math.max(positive, negative);
      return {
        ...row,
        values: Object.fromEntries(
          columns.map((column) => {
            const raw = row.values[column.id];
            const value =
              selection[column.id] !== false &&
              typeof raw === "number" &&
              Number.isFinite(raw) &&
              denominator > 0
                ? (raw / scale / denominator) * 100
                : null;
            return [column.id, value];
          }),
        ),
      };
    }),
  };
}

/** Endpoints include zero and retain the smaller sign's actual extent. */
export function normalizedExtent(snapshot: ChartSnapshot) {
  const endpoints = snapshot.rows.flatMap((row) => {
    const values = Object.values(row.values).filter(
      (v): v is number => typeof v === "number",
    );
    return [
      values.reduce((sum, v) => sum + Math.min(0, v), 0),
      values.reduce((sum, v) => sum + Math.max(0, v), 0),
    ];
  });
  const min = Math.min(0, ...endpoints);
  const max = Math.max(0, ...endpoints);
  // A symmetric display extent puts the sole zero tick in the middle, without data nodes.
  return min === max ? { min: -1, max: 1, interval: 1 } : { min, max };
}
