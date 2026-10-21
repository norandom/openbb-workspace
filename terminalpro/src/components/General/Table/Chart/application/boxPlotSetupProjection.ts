import type { DiagnosticPath, SnapshotRow } from "../compatibility/snapshotTypes";
import type { SetupAggregation } from "../echarts/cartesianTypes";
import type { SetupObservationGroup } from "./setupAggregation";
import type { SetupResult } from "./setupTypes";

function invalid(path: DiagnosticPath, message: string): SetupResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "box-setup-aggregation", path, message }],
  };
}
function selectedValues(row: SnapshotRow, seriesIds: readonly string[]) {
  const values: Record<string, number | null> = Object.create(null);
  for (const id of seriesIds) {
    if (Object.hasOwn(row.values, id)) values[id] = row.values[id];
  }
  return values;
}
function reduce(
  values: readonly (number | null | undefined)[],
  operator: SetupAggregation,
) {
  if (operator === "count") return values.length;
  if (operator === "first") return values[0];
  if (operator === "last") return values[values.length - 1];
  let result: number | null = null;
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (typeof value !== "number") continue;
    // Original sum starts at its first number; strict extrema retain signed-zero ties.
    if (operator === "sum") result = result === null ? value : result + value;
    if (operator === "min" && (result === null || result > value)) result = value;
    if (operator === "max" && (result === null || result < value)) result = value;
    if (operator === "avg") {
      sum += value;
      count++;
    }
  }
  return operator === "avg" ? (count ? sum / count : null) : result;
}
interface Bucket {
  readonly index: number;
  readonly rows: SnapshotRow[];
}
function reducedGroup(
  bucket: Bucket,
  seriesIds: readonly string[],
  operator: SetupAggregation,
): SetupResult<SetupObservationGroup> {
  const values: Record<string, number | null> = Object.create(null);
  for (const id of seriesIds) {
    const value = reduce(
      bucket.rows.map((row) =>
        Object.hasOwn(row.values, id) ? row.values[id] : undefined,
      ),
      operator,
    );
    if (typeof value === "number" && !Number.isFinite(value))
      return invalid(
        ["rows", bucket.index, "values", id],
        "Original Box aggregate exceeds the finite observation boundary",
      );
    if (value !== undefined) values[id] = value;
  }
  const sourceRowIds = bucket.rows.map((row) => row.id);
  return {
    status: "ready",
    value: {
      row: {
        id: `setup:aggregate:${JSON.stringify(sourceRowIds)}`,
        category: bucket.rows[0].category,
        boxPlotAggregationKey: bucket.rows[0].boxPlotAggregationKey,
        values,
      },
      sourceRowIds,
    },
  };
}
/** Receives validated Box observations; grouping precedes statistical category merging. */
export function aggregateBoxSetupRows(
  rows: readonly SnapshotRow[],
  seriesIds: readonly string[],
  operator?: SetupAggregation,
): SetupResult<readonly SetupObservationGroup[]> {
  if (!operator)
    return {
      status: "ready",
      value: rows.map((row) => ({
        row: { ...row, values: selectedValues(row, seriesIds) },
        sourceRowIds: [row.id],
      })),
    };
  const buckets = new Map<string, Bucket>();
  for (const [index, row] of rows.entries()) {
    const key = row.boxPlotAggregationKey as string;
    if (Object.hasOwn(Object.prototype, key))
      return invalid(
        ["rows", index, "boxPlotAggregationKey"],
        "Original Box aggregation cannot process an inherited Object.prototype category key",
      );
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { index, rows: [row] });
  }
  const groups: SetupObservationGroup[] = [];
  for (const bucket of buckets.values()) {
    const result = reducedGroup(bucket, seriesIds, operator);
    if (result.status !== "ready") return result;
    groups.push(result.value);
  }
  return { status: "ready", value: groups };
}
