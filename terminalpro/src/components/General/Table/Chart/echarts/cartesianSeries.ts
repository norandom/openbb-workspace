import type { BarSeriesOption, LineSeriesOption } from "echarts";
import { color } from "echarts";
import type { ChartDisplayPolicy } from "../application/types";
import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";
import { categoryCoordinate, continuousCategory } from "./cartesianAxes";
import { fontStyle } from "./cartesianDisplay";
import { markerDimensions, markerSymbol } from "./cartesianMarkers";
import { seriesAppearance } from "./cartesianStyle";
import type { CartesianFamily, ResolvedCartesianStyle } from "./cartesianTypes";

function alpha(value: string, opacity: number): string {
  if (opacity === 1) return value;
  const original = color.parse(value);
  const result = original && color.modifyAlpha(value, original[3] * opacity);
  if (!result) throw new Error("ECharts cannot apply opacity to this color");
  return result;
}
function observationData(
  snapshot: ChartSnapshot,
  column: SnapshotColumn,
  style: ResolvedCartesianStyle,
) {
  const axis = style.application?.axes.category;
  if (!axis || !continuousCategory(axis))
    return snapshot.rows.map((r) => r.values[column.id] ?? null);
  const horizontal =
    axis.fields.position === "top" || axis.fields.position === "bottom";
  return snapshot.rows.map((row) => {
    const category = categoryCoordinate(row.category, axis);
    const value = row.values[column.id] ?? null;
    return horizontal ? [category, value] : [value, category];
  });
}
function applicationSeries(
  style: ResolvedCartesianStyle,
  column: SnapshotColumn,
  index: number,
  snapshot: ChartSnapshot,
  family: CartesianFamily,
  display: ChartDisplayPolicy,
) {
  const a = style.application;
  if (!a) return {};
  const s = a.series;
  const override = style.series[column.id];
  const fill =
    override?.fill ??
    override?.color ??
    a.palette.fills[index % a.palette.fills.length];
  const stroke =
    override?.stroke ??
    override?.color ??
    a.palette.strokes[index % a.palette.strokes.length];
  const line = family === "line";
  const width = override?.strokeWidth ?? override?.lineWidth ?? s.strokeWidth;
  return {
    itemStyle: {
      color: alpha(line ? (override?.markerFill ?? fill) : fill, s.fillOpacity),
      borderColor: alpha(
        line ? (override?.markerStroke ?? stroke) : stroke,
        s.strokeOpacity,
      ),
      borderWidth: line
        ? (override?.markerStrokeWidth ?? s.markers.strokeWidth)
        : width,
      borderType: line ? "solid" : [...s.lineDash],
      shadowBlur: s.shadow.enabled ? s.shadow.blur : 0,
      shadowColor: s.shadow.enabled ? s.shadow.color : "transparent",
      shadowOffsetX: s.shadow.enabled ? s.shadow.xOffset : 0,
      shadowOffsetY: s.shadow.enabled ? s.shadow.yOffset : 0,
    },
    label: {
      ...fontStyle(s.labels),
      show: s.labels.enabled,
      position: line ? "top" : "inside",
      formatter: (params: { dataIndex: number }) => {
        const value = snapshot.rows[params.dataIndex]?.values[column.id];
        return typeof value === "number" ? String(display.seriesLabel(value)) : "";
      },
    },
    ...(line
      ? {
          lineStyle: {
            color: stroke,
            width,
            opacity: s.strokeOpacity,
            type: [...s.lineDash],
          },
          // ECharts attaches line labels to symbols. Zero-size symbols retain
          // independent labels while the original marker toggle hides geometry.
          showSymbol: s.markers.enabled || s.labels.enabled,
          symbol: markerSymbol(s.markers.shape),
          symbolSize: s.markers.enabled
            ? markerDimensions(s.markers.shape, s.markers.size)
            : 0,
          symbolOffset:
            s.markers.shape === "triangle" ? [0, -s.markers.size * 0.065] : [0, 0],
          connectNulls: s.connectMissingData,
        }
      : { barCategoryGap: "30%", barGap: "11.1111111111%" }),
  };
}
export function cartesianSeries(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  family: CartesianFamily,
  style: ResolvedCartesianStyle,
  display: ChartDisplayPolicy,
): (BarSeriesOption | LineSeriesOption)[] {
  return columns.map((column, index) => {
    const common = {
      id: column.id,
      // ECharts addresses legend selection by name; labels can legitimately repeat.
      name: column.id,
      data: observationData(snapshot, column, style),
      ...seriesAppearance(style, column.id, index, family),
      ...applicationSeries(style, column, index, snapshot, family, display),
    };
    if (family === "line") return { ...common, type: "line" } as LineSeriesOption;
    return {
      ...common,
      type: "bar",
      ...(family === "stackedColumn"
        ? { stack: "total", stackStrategy: "samesign" }
        : {}),
    } as BarSeriesOption;
  });
}
