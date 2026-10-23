import type {
  CustomSeriesOption,
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
} from "echarts";
import type { WaterfallRenderInput } from "../application/waterfallTypes";
import type { WaterfallPoint } from "../compatibility/waterfallTotals";
import { fontStyle } from "./cartesianDisplay";
import type { RangePickCandidate } from "./rangePointerTypes";
import { waterfallCategory, waterfallInterval } from "./waterfallCategory";

export interface WaterfallGeometry {
  readonly candidates: RangePickCandidate[];
  plot?: { left: number; top: number; width: number; height: number };
}
type Rect = NonNullable<RangePickCandidate["rect"]>;
function rect(
  api: CustomSeriesRenderItemAPI,
  category: number,
  point: WaterfallPoint,
  horizontal: boolean,
  interval: number,
): Rect {
  const a = api.coord(horizontal ? [point.start, category] : [category, point.start]);
  const b = api.coord(horizontal ? [point.end, category] : [category, point.end]);
  const size = api.size!(horizontal ? [0, interval] : [interval, 0]) as number[];
  const band = Math.abs(size[horizontal ? 1 : 0]) * 0.7;
  return horizontal
    ? {
        x: Math.min(a[0], b[0]),
        y: a[1] - band / 2,
        width: Math.abs(a[0] - b[0]),
        height: band,
      }
    : {
        x: a[0] - band / 2,
        y: Math.min(a[1], b[1]),
        width: band,
        height: Math.abs(a[1] - b[1]),
      };
}
function remember(
  geometry: WaterfallGeometry,
  input: WaterfallRenderInput,
  p: WaterfallPoint,
  box: Rect,
  params: CustomSeriesRenderItemParams,
) {
  const coordinate = params.coordSys;
  if (
    !("x" in coordinate) ||
    !("y" in coordinate) ||
    !("width" in coordinate) ||
    !("height" in coordinate)
  )
    throw Error("Waterfall requires Cartesian engine geometry.");
  const { x, y, width, height } = coordinate;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  )
    throw Error("Waterfall requires numeric engine geometry.");
  geometry.plot = { left: x, top: y, width, height };
  const row = input.snapshot.rows[p.index];
  geometry.candidates.push({
    key: row.id,
    identityKey: row.id,
    fieldSlot: 0,
    groupSlot: p.index,
    endpoint: "bar",
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    size: 0,
    majorVisible: true,
    minorVisible:
      box.x + box.width >= x &&
      box.x <= x + width &&
      box.y + box.height >= y &&
      box.y <= y + height,
    rect: box,
    rawIdentity: { category: row.category, sourceRowIds: [row.id] },
  });
}
function label(input: WaterfallRenderInput, point: WaterfallPoint, box: Rect) {
  const style =
    input.appearance.series.item[point.kind === "negative" ? "negative" : "positive"]
      .label;
  if (!style.enabled) return;
  const horizontal = input.appearance.series.direction === "horizontal";
  const positive = point.kind === "positive";
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  let align: "left" | "center" | "right" = "center";
  let verticalAlign: "top" | "middle" | "bottom" = "middle";
  const outside = style.placement.startsWith("outside");
  if (!style.placement.endsWith("center")) {
    const end = style.placement.endsWith("end");
    const sign = (horizontal ? 1 : -1) * (end === positive ? 1 : -1);
    const offset = sign * (outside ? 1 : -1) * style.spacing;
    if (horizontal) {
      x = box.x + (sign > 0 ? box.width : 0) + offset;
      align = sign > 0 === outside ? "left" : "right";
    } else {
      y = box.y + (sign > 0 ? box.height : 0) + offset;
      verticalAlign = sign > 0 === outside ? "top" : "bottom";
    }
  }
  return {
    type: "text" as const,
    silent: true,
    style: {
      x,
      y,
      text: String(input.context.display.seriesLabel(point.delta!)),
      fill: style.color,
      ...fontStyle(style),
      align,
      verticalAlign,
    },
  };
}
function connector(
  input: WaterfallRenderInput,
  points: readonly WaterfallPoint[],
  local: number,
  box: Rect,
  api: CustomSeriesRenderItemAPI,
  interval: number,
) {
  const style = input.appearance.series.line;
  const next = points[local + 1];
  if (
    !style.enabled ||
    style.strokeWidth === 0 ||
    !next ||
    next.kind === "missing" ||
    next.index !== points[local].index + 1
  )
    return;
  const horizontal = input.appearance.series.direction === "horizontal";
  const other = rect(
    api,
    waterfallCategory(input, next.index, local + 1),
    next,
    horizontal,
    interval,
  );
  const category = waterfallCategory(input, points[local].index, local);
  const end = api.coord(
    horizontal ? [points[local].end, category] : [category, points[local].end],
  );
  return {
    type: "line" as const,
    silent: true,
    shape: horizontal
      ? { x1: end[0], x2: end[0], y1: box.y + box.height, y2: other.y }
      : { x1: box.x + box.width, x2: other.x, y1: end[1], y2: end[1] },
    style: {
      stroke: style.stroke,
      lineWidth: style.strokeWidth,
      strokeOpacity: style.strokeOpacity,
      lineDash: [...style.lineDash],
      lineDashOffset: style.lineDashOffset,
    },
  };
}
export function waterfallSeries(
  input: WaterfallRenderInput,
  points: readonly WaterfallPoint[],
  geometry?: WaterfallGeometry,
): CustomSeriesOption {
  const horizontal = input.appearance.series.direction === "horizontal";
  const interval = waterfallInterval(input);
  return {
    id: "openbb-waterfall-data",
    type: "custom",
    coordinateSystem: "cartesian2d",
    clip: true,
    animation: false,
    dimensions: ["category", "start", "end", "delta", "sourceIndex"],
    encode: horizontal ? { x: [1, 2], y: 0 } : { x: 0, y: [1, 2] },
    data: points.map((p, local) => ({
      id: input.snapshot.rows[p.index].id,
      value: [
        waterfallCategory(input, p.index, local),
        p.start,
        p.end,
        p.delta,
        p.index,
      ],
    })),
    renderItem: (params, api) => {
      if (params.dataIndex === 0 && geometry) geometry.candidates.length = 0;
      const local = params.dataIndex;
      const point = points[local];
      if (!input.appearance.series.visible || point.kind === "missing") return;
      const item = input.appearance.series.item[point.kind];
      const rawBox = rect(
        api,
        waterfallCategory(input, point.index, local),
        point,
        horizontal,
        interval,
      );
      const box = {
        ...rawBox,
        [horizontal ? "width" : "height"]: Math.max(
          item.strokeWidth,
          rawBox[horizontal ? "width" : "height"],
        ),
      };
      const children = [];
      const line = connector(input, points, local, box, api, interval);
      if (line) children.push(line);
      if (point.delta !== 0 || item.strokeWidth > 0) {
        if (geometry) remember(geometry, input, point, box, params);
        children.push({
          type: "rect" as const,
          shape: box,
          style: {
            fill: item.fill,
            stroke: item.stroke,
            lineWidth: item.strokeWidth,
            fillOpacity: item.fillOpacity,
            strokeOpacity: item.strokeOpacity,
            lineDash: [...item.lineDash],
            lineDashOffset: item.lineDashOffset,
          },
        });
        const text = geometry ? label(input, point, box) : undefined;
        if (text) children.push(text);
      }
      return { type: "group", children };
    },
  };
}
