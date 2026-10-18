import { isDate, isDateTime } from "../../ColumnValues";
import { getWidgetStorage } from "../../communityState";

export const customChartWidgetIds = [
  "analyst_estimates",
  "earnings_trends",
  "revenue_trends",
  "revenue_per_bus_line",
  "revenue_per_geography",
];
/** The original custom/Index/date-column transformations remain separate parity obligations. */
export function callerOrientation(
  widget: any,
  columns: readonly string[],
  rows: readonly any[],
) {
  const custom = !widget.external && customChartWidgetIds.includes(widget.widgetId);
  const transpose =
    Boolean(getWidgetStorage(widget)?.transpose) &&
    Object.hasOwn(rows[0] ?? {}, "Index");
  const dateColumns = columns.filter((id) => isDate(id) || isDateTime(id));
  const externalTranspose =
    widget.external &&
    dateColumns.length > 0 &&
    columns.length - dateColumns.length === 1;
  return { custom, transposed: transpose || Boolean(externalTranspose) };
}
