import { calculateBoxSummary } from "../compatibility/boxSummary";
import type { SnapshotDiagnostic, SnapshotRow } from "../compatibility/snapshotTypes";
import type {
  BoxPlotDatum,
  BoxPlotField,
  BoxPlotMappingInput,
  BoxPlotProjection,
} from "./boxPlotTypes";

type ProjectionFailure = {
  readonly status: "invalid";
  readonly diagnostics: readonly SnapshotDiagnostic[];
};
function datum(
  rows: readonly SnapshotRow[],
  id: string,
  slot: number,
): BoxPlotDatum | ProjectionFailure {
  const result = calculateBoxSummary(rows.map((row) => row.values[id] ?? null));
  if (result.status === "invalid")
    return {
      status: "invalid",
      diagnostics: result.diagnostics.map((d) => ({
        ...d,
        path: ["groups", slot, "fields", id, ...d.path],
      })),
    };
  return {
    groupSlot: slot,
    count: result.count,
    summary: result.summary,
    sourceRowIds: rows
      .filter((row) => typeof row.values[id] === "number")
      .map((row) => row.id),
  };
}
export function projectBoxPlot(
  input: BoxPlotMappingInput,
): BoxPlotProjection | ProjectionFailure {
  const grouped = new Map<string | number, SnapshotRow[]>();
  for (const row of input.snapshot.rows) {
    const rows = grouped.get(row.category) ?? [];
    rows.push(row);
    grouped.set(row.category, rows);
  }
  const groups = [...grouped].map(([category, rows], slot) => ({
    slot,
    category,
    rowIds: rows.map((row) => row.id),
  }));
  const columns = new Map(input.snapshot.columns.map((c) => [c.id, c]));
  const descriptors = input.snapshot.selectedColumnIds.flatMap((id) => {
    const column = columns.get(id);
    return column?.role === "number" ? [column] : [];
  });
  const fields: BoxPlotField[] = [];
  for (const [paletteIndex, descriptor] of descriptors.entries()) {
    const data: BoxPlotDatum[] = [];
    for (const [slot, rows] of [...grouped.values()].entries()) {
      const result = datum(rows, descriptor.id, slot);
      if ("status" in result) return result;
      data.push(result);
    }
    fields.push({
      descriptor,
      paletteIndex,
      enabled:
        input.context.legendSelection?.[descriptor.id] ??
        input.style.fields[descriptor.id].visible ??
        true,
      data,
    });
  }
  return { groups, fields };
}
