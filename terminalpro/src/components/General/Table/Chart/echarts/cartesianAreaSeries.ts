import type { LineSeriesOption } from "echarts";
import type { ChartDisplayPolicy } from "../application/types";
import type {
  ChartSnapshot,
  SnapshotColumn,
} from "../compatibility/snapshotTypes";
import type {
  AreaProjection,
  AreaSeriesProjection,
} from "./cartesianAreaTypes";
import { categoryCoordinate, continuousCategory } from "./cartesianAxes";
import { applicationSeries } from "./cartesianSeries";
import { seriesAppearance } from "./cartesianStyle";
import type { ResolvedCartesianStyle } from "./cartesianTypes";

type AreaNativeSeries = LineSeriesOption & { openbbAreaGeometry: true };
export interface AreaRenderingContext {
  readonly paletteIndexes?: readonly number[];
  readonly reservedIds?: Set<string>;
  readonly coordinates?: readonly (string | number)[];
}

function coordinate(
  snapshot: ChartSnapshot,
  style: ResolvedCartesianStyle,
  index: number,
  context?: AreaRenderingContext,
) {
  if (context?.coordinates) return context.coordinates[index];
  const axis = style.application?.axes.category;
  return axis && continuousCategory(axis)
    ? categoryCoordinate(snapshot.rows[index].category, axis)
    : index;
}
function geometry(
  id: string,
  data: unknown[],
  horizontal: boolean,
): AreaNativeSeries {
  return {
    openbbAreaGeometry: true,
    id,
    name: id,
    type: "line",
    data: data as LineSeriesOption["data"],
    dimensions: ["y", "x"],
    encode: horizontal ? { x: "x", y: "y" } : { x: "y", y: "x" },
    silent: true,
    showSymbol: false,
    connectNulls: false,
    tooltip: { show: false },
    emphasis: { disabled: true },
    lineStyle: { width: 0, opacity: 0 },
    animation: false,
  };
}
function joinedSpans<T>(
  spans: readonly (readonly T[])[],
  same: (a: T, b: T) => boolean,
): T[][] {
  const result: T[][] = [];
  for (const span of spans) {
    if (!span.length) continue;
    const previous = result[result.length - 1];
    if (previous && same(previous[previous.length - 1], span[0]))
      previous.push(...span.slice(1));
    else result.push([...span]);
  }
  return result;
}
function internalId(
  key: string,
  role: string,
  index: number,
  reserved: Set<string>,
): string {
  let id = `openbb-area-${role}-${key}-${index}`;
  while (reserved.has(id)) id += "-internal";
  reserved.add(id);
  return id;
}
function areaParts(
  item: AreaSeriesProjection,
  snapshot: ChartSnapshot,
  style: ResolvedCartesianStyle,
  color: string,
  lineStyle: LineSeriesOption["lineStyle"],
  horizontal: boolean,
  reserved: Set<string>,
  context?: AreaRenderingContext,
): LineSeriesOption[] {
  const s = style.application?.series;
  const key = encodeURIComponent(item.id);
  const points = (span: readonly { rowIndex: number; value: number }[]) =>
    span.map((p) => [
      p.value,
      coordinate(snapshot, style, p.rowIndex, context),
    ]);
  const fillSpans = joinedSpans(
    item.fills,
    (a, b) =>
      a.rowIndex === b.rowIndex && a.lower === b.lower && a.upper === b.upper,
  );
  const strokes = joinedSpans(
    item.strokes,
    (a, b) => a.rowIndex === b.rowIndex && a.value === b.value,
  );
  const fills = fillSpans.flatMap((span, index) => {
    const stack = `openbb-area-band-${key}-${index}`;
    const base = geometry(
      internalId(key, "base", index, reserved),
      span.map((p) => [
        p.lower,
        coordinate(snapshot, style, p.rowIndex, context),
      ]),
      horizontal,
    );
    const fill = geometry(
      internalId(key, "fill", index, reserved),
      span.map((p) => [
        p.upper - p.lower,
        coordinate(snapshot, style, p.rowIndex, context),
      ]),
      horizontal,
    );
    return [
      {
        ...base,
        stack,
        stackStrategy: "all" as const,
        areaStyle: { opacity: 0 },
      },
      {
        ...fill,
        stack,
        stackStrategy: "all" as const,
        areaStyle: {
          color,
          opacity: s?.fillOpacity ?? 0.8,
          shadowBlur: s?.shadow.enabled ? s.shadow.blur : 0,
          shadowColor: s?.shadow.enabled ? s.shadow.color : "transparent",
          shadowOffsetX: s?.shadow.enabled ? s.shadow.xOffset : 0,
          shadowOffsetY: s?.shadow.enabled ? s.shadow.yOffset : 0,
        },
      },
    ];
  });
  return [
    ...fills,
    ...strokes.map((span, index) => ({
      ...geometry(
        internalId(key, "stroke", index, reserved),
        points(span),
        horizontal,
      ),
      lineStyle,
      z: 3,
    })),
  ];
}
export function cartesianAreaSeries(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  style: ResolvedCartesianStyle,
  display: ChartDisplayPolicy,
  projection: AreaProjection,
  context?: AreaRenderingContext,
): LineSeriesOption[] {
  const horizontal =
    !style.application ||
    ["top", "bottom"].includes(style.application.axes.category.fields.position);
  const reserved = context?.reservedIds ?? new Set(columns.map((c) => c.id));
  return columns.flatMap((column, localIndex) => {
    const index = context?.paletteIndexes?.[localIndex] ?? localIndex;
    const item = projection.series[localIndex];
    const app = applicationSeries(
      style,
      column,
      index,
      snapshot,
      "line",
      display,
    ) as Partial<LineSeriesOption>;
    const common = {
      ...seriesAppearance(style, column.id, index, "line"),
      ...app,
    };
    const override = style.series[column.id];
    const fill =
      override?.fill ??
      override?.color ??
      style.application?.palette.fills[
        index % style.application.palette.fills.length
      ] ??
      style.palette[index % style.palette.length];
    const publicSeries: AreaNativeSeries = {
      ...common,
      openbbAreaGeometry: true,
      id: column.id,
      name: column.id,
      type: "line",
      z: 4,
      data: item.markers.map((value, i) =>
        horizontal
          ? [coordinate(snapshot, style, i, context), value]
          : [value, coordinate(snapshot, style, i, context)],
      ),
      lineStyle: { width: 0, opacity: 0 },
      connectNulls: false,
      label: {
        ...app.label,
        formatter: (params: { dataIndex: number }) => {
          const value = item.labelValues[params.dataIndex];
          return typeof value === "number"
            ? String(display.seriesLabel(value))
            : "";
        },
      },
      legendHoverLink: false,
    };
    const lineStyle = common.lineStyle ?? { color: fill, width: 0 };
    return [
      ...areaParts(
        item,
        snapshot,
        style,
        fill,
        lineStyle,
        horizontal,
        reserved,
        context,
      ),
      publicSeries,
    ];
  });
}
