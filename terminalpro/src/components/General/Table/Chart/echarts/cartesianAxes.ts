import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import type { ResolvedApplicationAxis } from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import { fontStyle, timeLabel } from "./cartesianDisplay";
import { alternatingGrid } from "./cartesianGrid";
import { measureText } from "./cartesianLayout";
import type { CartesianMappingContext } from "./cartesianTypes";

export function continuousCategory(axis: ResolvedApplicationAxis): boolean {
  return axis.fields.type === "number" || axis.fields.type === "time";
}
export function categoryCoordinate(
  value: string | number,
  axis: ResolvedApplicationAxis,
): string | number {
  if (axis.fields.type === "time") return new Date(value).getTime();
  return value;
}
function rotation(
  axis: ResolvedApplicationAxis,
  snapshot: ChartSnapshot,
  display: ChartDisplayPolicy,
  viewport: NonNullable<CartesianMappingContext["viewport"]>,
): number {
  if (axis.labels.rotation !== undefined) return -axis.labels.rotation;
  if (!axis.labels.autoRotate || axis.fields.type !== "category") return 0;
  const labels = snapshot.rows.map((row) =>
    measureText(String(display.category(row.category)), axis.labels),
  );
  const horizontal =
    axis.fields.position === "top" || axis.fields.position === "bottom";
  const overlap = labels.some(
    (label) =>
      (horizontal ? label.width : label.height) + 10 >
      (horizontal ? viewport.width : viewport.height) / Math.max(1, labels.length),
  );
  return overlap ? 25 : 0;
}
function axisOptions(
  axis: ResolvedApplicationAxis,
  snapshot: ChartSnapshot,
  display: ChartDisplayPolicy,
  category: boolean,
  viewport: NonNullable<CartesianMappingContext["viewport"]>,
): XAXisComponentOption {
  const continuous = !category || continuousCategory(axis);
  const formatCategory = (value: string | number) => {
    const raw = continuous ? value : (snapshot.rows[Number(value)]?.category ?? "");
    return axis.fields.type === "time"
      ? timeLabel(raw, axis.fields.timeFormat)
      : String(display.category(raw));
  };
  return {
    type:
      axis.fields.type === "number"
        ? "value"
        : axis.fields.type === "time"
          ? "time"
          : "category",
    position: axis.fields.position as "top" | "bottom",
    nameLocation: "middle",
    name: axis.title.enabled ? axis.title.text : "",
    nameGap: axis.title.spacing,
    nameMoveOverlap: true,
    nameTextStyle: fontStyle(axis.title),
    ...(!continuous
      ? { data: snapshot.rows.map((_, i) => String(i)), boundaryGap: true }
      : {}),
    axisLine: {
      show: axis.lineEnabled,
      onZero: false,
      lineStyle: { color: axis.fields.color, width: axis.fields.thickness },
    },
    axisTick: {
      show: axis.ticks.enabled,
      length: axis.ticks.length,
      alignWithLabel: true,
      lineStyle: { color: axis.ticks.color, width: axis.ticks.width },
    },
    splitLine: {
      show: axis.grid.enabled && !alternatingGrid(axis),
      lineStyle: {
        color: axis.gridStyles.map((s) => s.stroke),
        width: axis.grid.thickness,
        type: [...axis.gridStyles[0].lineDash],
      },
    },
    axisLabel: {
      ...fontStyle(axis.labels),
      margin: axis.labels.padding,
      rotate: rotation(axis, snapshot, display, viewport),
      formatter: category
        ? formatCategory
        : (value: number) => String(display.numericAxis(value)),
    },
    axisPointer: {
      label: {
        formatter: (params) =>
          String(
            display.crosshair(
              category && !continuous
                ? (snapshot.rows[Number(params.value)]?.category ?? "")
                : params.value,
            ),
          ),
      },
    },
  } as XAXisComponentOption;
}
export function applicationAxes(
  category: ResolvedApplicationAxis,
  number: ResolvedApplicationAxis,
  snapshot: ChartSnapshot,
  display: ChartDisplayPolicy,
  viewport: NonNullable<CartesianMappingContext["viewport"]>,
): { xAxis: XAXisComponentOption; yAxis: YAXisComponentOption } {
  const c = axisOptions(category, snapshot, display, true, viewport);
  const n = axisOptions(number, snapshot, display, false, viewport);
  return category.fields.position === "top" || category.fields.position === "bottom"
    ? { xAxis: c, yAxis: n as YAXisComponentOption }
    : { xAxis: n, yAxis: c as YAXisComponentOption };
}
