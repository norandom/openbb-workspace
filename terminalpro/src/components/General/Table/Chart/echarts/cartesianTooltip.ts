import type { TooltipComponentOption } from "echarts";
import type { ChartDisplayPolicy } from "../application/types";
import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";
import { escapeHtml } from "./cartesianDisplay";
import type { ResolvedCartesianStyle } from "./cartesianTypes";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
function tooltipContent(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  display: ChartDisplayPolicy,
  mode: string,
  params: unknown,
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
  const selected = (
    mode === "shared"
      ? columns
      : columns.filter((c) => c.id === entry?.seriesId || c.id === entry?.seriesName)
  ).filter((column) => {
    if (!drawn) return true;
    const endpoint = drawn.rows[entry!.dataIndex as number]?.values[column.id];
    return typeof endpoint === "number" && Number.isFinite(endpoint);
  });
  if (drawn && selected.length === 0) return "";
  const lines = selected.map((column) => {
    const value = row.values[column.id];
    return `${escapeHtml(column.label)}: ${typeof value === "number" ? escapeHtml(display.tooltipNumber(value)) : "—"}`;
  });
  return [
    ...(mode === "compact" ? [] : [escapeHtml(String(display.category(row.category)))]),
    ...lines,
  ].join("<br/>");
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
      tooltipContent(snapshot, columns, display, mode, params, drawn),
  };
}
