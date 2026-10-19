import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import type { ResolvedApplicationAxis } from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import { isAreaFamily } from "./cartesianAreaTypes";
import { fontStyle, timeLabel } from "./cartesianDisplay";
import { alternatingGrid } from "./cartesianGrid";
import { measureText } from "./cartesianLayout";
import type { CartesianFamily, CartesianMappingContext } from "./cartesianTypes";
import { isHorizontalCartesianFamily } from "./cartesianTypes";

export function ordinalLineCategory(
  axis: ResolvedApplicationAxis,
  family: CartesianFamily,
): boolean {
  return (family === "line" || isAreaFamily(family)) && axis.fields.type === "category";
}

function numberExtent(snapshot: ChartSnapshot, pixels: number) {
  const values = snapshot.rows.flatMap((row) =>
    snapshot.selectedColumnIds.flatMap((id) =>
      typeof row.values[id] === "number" ? [row.values[id] as number] : [],
    ),
  );
  const min = values.reduce((result, value) => Math.min(result, value), 0);
  const max = values.reduce((result, value) => Math.max(result, value), 0);
  if (min === max) return {};
  // Original linear scales choose 1/2/5 steps around five ticks, at least 50px apart.
  const count = Math.max(1, Math.min(5, Math.floor(pixels / 50)));
  const maxCount = Math.max(1, Math.floor(pixels / Math.max(50, pixels / 6)));
  const power = 10 ** Math.floor(Math.log10((max - min) / count));
  const candidates = [1, 2, 5, 10].map((m) => power * m);
  const valid = candidates.filter((step) => Math.ceil((max - min) / step) <= maxCount);
  const interval = (valid.length ? valid : candidates).reduce((best, step) =>
    Math.abs(Math.ceil((max - min) / step) - count) <
    Math.abs(Math.ceil((max - min) / best) - count)
      ? step
      : best,
  );
  return {
    interval,
    min: Math.floor(min / interval) * interval,
    max: Math.ceil(max / interval) * interval,
  };
}

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
  family: CartesianFamily,
): XAXisComponentOption {
  const continuous = !category || continuousCategory(axis);
  const ordinal = category && ordinalLineCategory(axis, family);
  const formatCategory = (value: string | number) => {
    if (ordinal && (!Number.isInteger(Number(value)) || !snapshot.rows[Number(value)]))
      return "";
    const raw = continuous ? value : (snapshot.rows[Number(value)]?.category ?? "");
    return axis.fields.type === "time"
      ? timeLabel(raw, axis.fields.timeFormat)
      : String(display.category(raw));
  };
  return {
    type:
      ordinal || axis.fields.type === "number"
        ? "value"
        : axis.fields.type === "time"
          ? "time"
          : "category",
    position: axis.fields.position as "top" | "bottom",
    // Original horizontal bars preserve displayed input order from top to bottom.
    ...(category &&
    isHorizontalCartesianFamily(family) &&
    ["left", "right"].includes(axis.fields.position)
      ? { inverse: true }
      : {}),
    nameLocation: "middle",
    name: axis.title.enabled ? axis.title.text : "",
    nameGap: axis.title.spacing,
    nameMoveOverlap: true,
    nameTextStyle: fontStyle(axis.title),
    ...(ordinal
      ? {
          // Original line band padding is inner=1, outer=0.1; bar bands stay categorical.
          min: -0.1,
          max: Math.max(0, snapshot.rows.length - 1) + 0.1,
          minInterval: 1,
          maxInterval: 1,
        }
      : {}),
    ...(!category && family === "line"
      ? numberExtent(
          snapshot,
          ["top", "bottom"].includes(axis.fields.position)
            ? viewport.width
            : viewport.height,
        )
      : {}),
    ...(!continuous && !ordinal
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
      ...(ordinal ? { showMinLabel: false, showMaxLabel: false } : {}),
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
  family: CartesianFamily,
  extent: { min?: number; max?: number; interval?: number } = {},
): { xAxis: XAXisComponentOption; yAxis: YAXisComponentOption } {
  const c = axisOptions(category, snapshot, display, true, viewport, family);
  const n = {
    ...axisOptions(number, snapshot, display, false, viewport, family),
    ...extent,
  };
  return category.fields.position === "top" || category.fields.position === "bottom"
    ? { xAxis: c, yAxis: n as YAXisComponentOption }
    : { xAxis: n, yAxis: c as YAXisComponentOption };
}
