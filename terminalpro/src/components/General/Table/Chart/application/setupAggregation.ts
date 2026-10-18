import type { SnapshotRow } from "../compatibility/snapshotTypes";
import type { SetupAggregation } from "../echarts/cartesianTypes";

export interface SetupObservationGroup {
  readonly row: SnapshotRow;
  readonly sourceRowIds: readonly string[];
}
function reduce(
  values: readonly (number | null | undefined)[],
  operator: SetupAggregation,
) {
  if (operator === "count") return values.length;
  if (operator === "first") return values.length ? values[0] : null;
  if (operator === "last") return values.length ? values[values.length - 1] : null;
  const numeric = values.filter((v): v is number => typeof v === "number");
  if (!numeric.length) return null;
  if (operator === "min") return numeric.reduce((a, b) => Math.min(a, b));
  if (operator === "max") return numeric.reduce((a, b) => Math.max(a, b));
  const sum = numeric.reduce((a, b) => a + b, 0);
  return operator === "avg" ? sum / numeric.length : sum;
}
/** Object-key coercion matches source grouping; Map prevents prototype collisions. */
export function aggregateSetupRows(
  rows: readonly SnapshotRow[],
  seriesIds: readonly string[],
  operator?: SetupAggregation,
): SetupObservationGroup[] {
  if (!operator) return rows.map((row) => ({ row, sourceRowIds: [row.id] }));
  const groups = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = String(row.category);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map((group) => {
    const values: Record<string, number | null> = Object.create(null);
    for (const id of seriesIds) {
      const value = reduce(
        group.map((r) => (Object.hasOwn(r.values, id) ? r.values[id] : undefined)),
        operator,
      );
      // First/last preserve absent endpoints, rather than introducing own undefined.
      if (value !== undefined) values[id] = value;
    }
    return {
      row: {
        id: `setup:aggregate:${JSON.stringify(group.map((r) => r.id))}`,
        category: group[0].category,
        values,
      },
      sourceRowIds: group.map((r) => r.id),
    };
  });
}
