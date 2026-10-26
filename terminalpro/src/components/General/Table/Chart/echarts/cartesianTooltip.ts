import type { TooltipComponentOption } from "echarts";
import type { ChartDisplayPolicy } from "../application/types";
import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";
import { categoryCoordinate, continuousCategory } from "./cartesianAxes";
import { escapeHtml } from "./cartesianDisplay";
import type { ResolvedCartesianStyle } from "./cartesianTypes";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
function sharedRowIndices(
  snapshot: ChartSnapshot,
  index: number,
  style: ResolvedCartesianStyle,
): number[] {
  const axis = style.application?.axes.category;
  if (!axis || !continuousCategory(axis)) return [index];
  const coordinate = Number(categoryCoordinate(snapshot.rows[index].category, axis));
  if (!Number.isFinite(coordinate)) return [index];
  return snapshot.rows.flatMap((row, rowIndex) =>
    Number(categoryCoordinate(row.category, axis)) === coordinate ? [rowIndex] : [],
  );
}
function rowContent(
  snapshot: ChartSnapshot,
  selected: readonly SnapshotColumn[],
  display: ChartDisplayPolicy,
  mode: string,
  index: number,
  drawn?: ChartSnapshot,
  identify = false,
): string {
  const row = snapshot.rows[index];
  const admitted = selected.filter((column) => {
    if (!drawn) return true;
    const endpoint = drawn.rows[index]?.values[column.id];
    return typeof endpoint === "number" && Number.isFinite(endpoint);
  });
  if (drawn && admitted.length === 0) return "";
  const lines = admitted.map((column) => {
    const value = row.values[column.id];
    return `${escapeHtml(column.label)}: ${typeof value === "number" ? escapeHtml(display.tooltipNumber(value)) : "—"}`;
  });
  const category = String(display.category(row.category));
  const header = identify ? `${category} (observation ${index + 1})` : category;
  return [...(mode === "compact" ? [] : [escapeHtml(header)]), ...lines].join("<br/>");
}
function tooltipContent(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  display: ChartDisplayPolicy,
  mode: string,
  params: unknown,
  style: ResolvedCartesianStyle,
  drawn?: ChartSnapshot,
): string {
  const entries = (Array.isArray(params) ? params : [params])
    .filter(record)
    .filter(
      (p) =>
        (p.seriesId === undefined && p.seriesName === undefined) ||
        columns.some((c) => c.id === p.seriesId || c.id === p.seriesName),
    );
  const entry = entries.find((p) => typeof p.dataIndex === "number");
  const row = entry ? snapshot.rows[entry.dataIndex as number] : undefined;
  if (!row) return "";
  const selected =
    mode === "shared"
      ? columns
      : columns.filter((c) => c.id === entry?.seriesId || c.id === entry?.seriesName);
  const index = entry!.dataIndex as number;
  const indices =
    drawn && mode === "shared" ? sharedRowIndices(snapshot, index, style) : [index];
  return indices
    .map((rowIndex) =>
      rowContent(
        snapshot,
        selected,
        display,
        mode,
        rowIndex,
        drawn,
        indices.length > 1,
      ),
    )
    .filter(Boolean)
    .join("<br/><br/>");
}
export function cartesianTooltip(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  style: ResolvedCartesianStyle,
  display: ChartDisplayPolicy,
  drawn?: ChartSnapshot,
): TooltipComponentOption {
  const state = style.application?.tooltip;
  const mode = state?.mode ?? "shared";
  return {
    show: state?.enabled ?? true,
    trigger: mode === "shared" ? "axis" : "item",
    renderMode: "html",
    formatter: (params) =>
      tooltipContent(snapshot, columns, display, mode, params, style, drawn),
  };
}
