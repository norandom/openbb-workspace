import type {
  HierarchySnapshot,
  HierarchySnapshotRow,
} from "../compatibility/hierarchyContracts";
import type { HierarchySetupSelection } from "./hierarchyTypes";
import type { HierarchyPreparedDatum } from "./hierarchySetupTypes";
import { hierarchyInvalid } from "./hierarchySetupSelection";
import type { SetupResult } from "./setupTypes";
function field(row: HierarchySnapshotRow, id: string): number | null | undefined {
  return Object.hasOwn(row.values, id) ? row.values[id] : undefined;
}
function reduceField(
  rows: readonly HierarchySnapshotRow[],
  id: string,
  operator: HierarchySetupSelection["aggFunc"],
): number | null | undefined {
  if (!operator || operator === "last") return field(rows.at(-1)!, id);
  if (operator === "first") return field(rows[0], id);
  if (operator === "count") return rows.length;
  let value: number | undefined = operator === "avg" ? 0 : undefined;
  let count = 0;
  for (const row of rows) {
    const next = field(row, id);
    if (typeof next !== "number") continue;
    count++;
    if (operator === "min") value = value === undefined || next < value ? next : value;
    else if (operator === "max")
      value = value === undefined || next > value ? next : value;
    else value = value === undefined ? next : value + next;
    if (!Number.isFinite(value)) throw new Error("Nonfinite bucket accumulation");
  }
  return count === 0 ? null : operator === "avg" ? value! / count : value!;
}
function prepareBucket(
  rows: readonly HierarchySnapshotRow[],
  selection: HierarchySetupSelection,
): SetupResult<HierarchyPreparedDatum> {
  const operator = selection.categoryIds.length ? selection.aggFunc : undefined;
  const values: Record<string, number | null> = {};
  for (const id of selection.seriesIds) {
    try {
      const value = reduceField(rows, id, operator);
      if (value !== undefined)
        Object.defineProperty(values, id, { value, enumerable: true });
    } catch {
      return hierarchyInvalid("Numeric aggregation overflow", [
        "source",
        "rows",
        rows[0].id,
        "values",
        id,
      ]);
    }
  }
  const representative = !operator || operator === "last" ? rows.at(-1)! : rows[0];
  return {
    status: "ready",
    value: {
      categoryPath: representative.categoryPath,
      values,
      sourceRowIds: rows.map((row) => row.id),
      representativeRowId: representative.id,
    },
  };
}
/** Candidate provenance includes missing endpoints and overwritten duplicate paths. */
export function aggregateHierarchySetupRows(
  source: HierarchySnapshot,
  selection: HierarchySetupSelection,
): SetupResult<readonly HierarchyPreparedDatum[]> {
  const buckets = new Map<string, HierarchySnapshotRow[]>();
  for (const row of source.rows) {
    const key = selection.categoryIds.length
      ? JSON.stringify(row.categoryPath)
      : JSON.stringify([row.id]);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const data: HierarchyPreparedDatum[] = [];
  for (const rows of buckets.values()) {
    const prepared = prepareBucket(rows, selection);
    if (prepared.status === "invalid") return prepared;
    data.push(prepared.value);
  }
  return { status: "ready", value: data };
}
