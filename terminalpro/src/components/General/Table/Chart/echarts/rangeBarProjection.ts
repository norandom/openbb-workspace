import { calculateRangeSummary } from "../compatibility/rangeSummary";
import { validateSnapshot } from "../compatibility/snapshot";
import type { ChartSnapshot, SnapshotRow } from "../compatibility/snapshotTypes";
import { copyRangeData, rangeFailure, rangeLegendValid } from "./rangeBarAdmission";
import type {
  RangeBarDatum,
  RangeBarProjection,
  RangeBarProjectionResult,
} from "./rangeBarTypes";

function project(
  snapshot: ChartSnapshot,
  selection?: Readonly<Record<string, boolean>>,
): RangeBarProjectionResult {
  const grouped = new Map<string | number, SnapshotRow[]>();
  for (const row of snapshot.rows) {
    const rows = grouped.get(row.category) ?? [];
    rows.push(row);
    grouped.set(row.category, rows);
  }
  const groups = [...grouped].map(([category, rows], slot) => ({
    slot,
    category,
    rowIds: rows.map((r) => r.id),
  }));
  const columns = new Map(snapshot.columns.map((c) => [c.id, c]));
  const descriptors = snapshot.selectedColumnIds.flatMap((id) => {
    const c = columns.get(id);
    return c?.role === "number" ? [c] : [];
  });
  const fields: RangeBarProjection["fields"][number][] = [];
  let extent: [] | [number, number] = [];
  for (const [paletteIndex, descriptor] of descriptors.entries()) {
    const enabled = selection?.[descriptor.id] !== false;
    const data: RangeBarDatum[] = [];
    for (const [slot, rows] of [...grouped.values()].entries()) {
      const result = calculateRangeSummary(
        rows.map((r) => r.values[descriptor.id] ?? null),
      );
      if (result.status === "invalid")
        return {
          status: "invalid",
          diagnostics: result.diagnostics.map((d) => ({
            ...d,
            path: ["groups", slot, "fields", descriptor.id, ...d.path],
          })),
        };
      data.push({
        groupSlot: slot,
        count: result.count,
        summary: result.summary,
        sourceRowIds: rows
          .filter((r) => typeof r.values[descriptor.id] === "number")
          .map((r) => r.id),
      });
      if (enabled && result.summary)
        extent = extent.length
          ? [
              Math.min(extent[0], result.summary.min),
              Math.max(extent[1], result.summary.max),
            ]
          : [result.summary.min, result.summary.max];
    }
    fields.push({ descriptor, paletteIndex, enabled, data });
  }
  return { status: "resolved", projection: { groups, fields, dataExtent: extent } };
}
/** Grouping consumes normalized observations; setup aggregation and unit conversion belong upstream. */
export function projectRangeBar(
  snapshot: ChartSnapshot,
  legendSelection?: Readonly<Record<string, boolean>>,
): RangeBarProjectionResult {
  try {
    const copied = copyRangeData(snapshot);
    const checked = validateSnapshot(copied, "xy-coordinates");
    if (!checked.valid) return { status: "invalid", diagnostics: checked.diagnostics };
    const value = checked.snapshot;
    const selection = copyRangeData(legendSelection) as typeof legendSelection;
    if (
      !rangeLegendValid(
        selection,
        value.selectedColumnIds.filter((id) => id !== value.categoryColumnId),
      )
    )
      return rangeFailure("Malformed Range Bar legend identity.");
    if (!["flat", "transformed", "grouped"].includes(value.sourceMode))
      return rangeFailure("Unsupported Range Bar source mode.", "unsupported");
    return project(value, selection);
  } catch {
    return rangeFailure("Range Bar snapshot could not be safely copied or projected.");
  }
}
