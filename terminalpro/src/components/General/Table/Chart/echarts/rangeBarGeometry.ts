import type { CustomSeriesRenderItem, CustomSeriesRenderItemAPI } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { rangeCoordinate, rangeTransport } from "./rangeBarAxes";
import { rangeBarBand, rangeBarCategoryCoordinate } from "./rangeBarBands";
import type {
  RangeBarDatum,
  RangeBarFieldStyle,
  RangeBarMappingInput,
  RangeBarProjection,
  RangeBarText,
} from "./rangeBarTypes";
import { rangeCategoryTransport } from "./rangeCategoryCoordinates";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

type Plot = { x: number; y: number; width: number; height: number };
type Child =
  | { type: "rect"; shape: Record<string, number>; style: Record<string, unknown> }
  | { type: "text"; style: Record<string, unknown> };
export function finiteRangeGeometry(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Range Bar nonfinite geometry.");
  if (value !== null && typeof value === "object")
    Object.values(value).forEach(finiteRangeGeometry);
}
function plotRectangle(v: unknown): Plot {
  if (
    !v ||
    typeof v !== "object" ||
    !("x" in v) ||
    !("y" in v) ||
    !("width" in v) ||
    !("height" in v) ||
    typeof v.x !== "number" ||
    typeof v.y !== "number" ||
    typeof v.width !== "number" ||
    typeof v.height !== "number" ||
    v.width <= 0 ||
    v.height <= 0
  )
    throw Error("Range Bar requires positive Cartesian geometry.");
  const plot = { x: v.x, y: v.y, width: v.width, height: v.height };
  finiteRangeGeometry(plot);
  return plot;
}
function endpointPoints(
  input: RangeBarMappingInput,
  datum: RangeBarDatum,
  coord: CustomSeriesRenderItemAPI["coord"],
  category: RangeCategoryPlan,
): number[][] {
  const vertical = input.style.direction === "vertical";
  const c = rangeBarCategoryCoordinate(category, datum.groupSlot);
  if (c === null) throw Error("Range Bar requires an admitted category coordinate.");
  return [datum.summary!.min, datum.summary!.max].map((value) => {
    const v = rangeCoordinate(value, input);
    const point = coord(vertical ? [c, v] : [v, c]);
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number"
    )
      throw Error("Range Bar invalid engine coordinate.");
    finiteRangeGeometry(point);
    return point;
  });
}
function interval(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
  datum: RangeBarDatum,
  fieldIndex: number,
  plot: Plot,
  coord: CustomSeriesRenderItemAPI["coord"],
  category: RangeCategoryPlan,
): Plot {
  const vertical = input.style.direction === "vertical";
  const points = endpointPoints(input, datum, coord, category);
  const enabled = projection.fields.filter((f) => f.enabled);
  const field = projection.fields[fieldIndex];
  const visibleIndex = enabled.findIndex(
    (f) => f.descriptor.id === field.descriptor.id,
  );
  const peer = rangeBarBand(
    vertical ? plot.width : plot.height,
    category,
    input,
    enabled.length,
    visibleIndex,
  );
  const start = Math.round(points[0][vertical ? 0 : 1] - peer.centering) + peer.offset;
  const [low, high] = points.map((p) => Math.round(p[vertical ? 1 : 0]));
  const valueStart = Math.min(low, high);
  const extent = Math.max(
    input.style.fields[field.descriptor.id].strokeWidth,
    Math.abs(high - low),
  );
  const rect = vertical
    ? { x: start, y: valueStart, width: peer.width, height: extent }
    : { x: valueStart, y: start, width: extent, height: peer.width };
  finiteRangeGeometry(rect);
  return rect;
}
function labels(
  rect: Plot,
  vertical: boolean,
  style: RangeBarFieldStyle,
  text: readonly [string, string],
): Child[] {
  const l = style.label;
  const outside = l.placement === "outside";
  const padding = (l.spacing + l.padding) * (outside ? 1 : -1);
  const low = {
    x: rect.x + (vertical ? rect.width / 2 : -padding),
    y: rect.y + (vertical ? rect.height + padding : rect.height / 2),
  };
  const high = {
    x: rect.x + (vertical ? rect.width / 2 : rect.width + padding),
    y: rect.y + (vertical ? -padding : rect.height / 2),
  };
  return [low, high].map((p, index) => ({
    type: "text",
    style: {
      ...fontStyle(l),
      fill: l.color,
      text: text[index],
      x: p.x,
      y: p.y,
      align: vertical ? "center" : (index === 0) === outside ? "right" : "left",
      verticalAlign: !vertical
        ? "middle"
        : (index === 0) === outside
          ? "top"
          : "bottom",
    },
  }));
}
function children(
  rect: Plot,
  vertical: boolean,
  s: RangeBarFieldStyle,
  text: readonly [string, string] | null,
): Child[] {
  const result: Child[] = [
    {
      type: "rect",
      shape: { ...rect },
      style: { fill: s.fill, opacity: s.fillOpacity, lineWidth: 0 },
    },
    {
      type: "rect",
      shape: { ...rect },
      style: {
        fill: "none",
        stroke: s.stroke,
        lineWidth: s.strokeWidth,
        opacity: s.strokeOpacity,
        lineDash: [...s.lineDash],
        lineDashOffset: s.lineDashOffset,
      },
    },
  ];
  if (text) result.push(...labels(rect, vertical, s, text));
  finiteRangeGeometry(result);
  return result;
}
export function createRangeRenderer(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
  fieldIndex: number,
  text: RangeBarText,
  category: RangeCategoryPlan,
): CustomSeriesRenderItem {
  return (params, api) => {
    const field = projection.fields[fieldIndex];
    const slot = Number(api.value(3));
    const datum = field.data[slot];
    if (input.style.valueScale === null || !field.enabled || !datum?.summary) return;
    const plot = plotRectangle(params.coordSys);
    if (rangeBarCategoryCoordinate(category, slot) === null) return;
    const rect = interval(
      input,
      projection,
      datum,
      fieldIndex,
      plot,
      api.coord,
      category,
    );
    const vertical = input.style.direction === "vertical";
    if ((vertical ? rect.width : rect.height) === 0) return;
    return {
      type: "group",
      children: children(
        rect,
        vertical,
        input.style.fields[field.descriptor.id],
        text.endpoints[fieldIndex][slot],
      ),
      clipPath: { type: "rect", shape: { ...plot } },
    };
  };
}
function preflightCoord(
  input: RangeBarMappingInput,
  category: RangeCategoryPlan,
): CustomSeriesRenderItemAPI["coord"] {
  const p = input.context.plot;
  const vertical = input.style.direction === "vertical";
  const [min, max] = rangeTransport(input);
  const [cmin, cmax] = rangeCategoryTransport(category) ?? [0, 1];
  return (data) => {
    if (!Array.isArray(data)) throw Error("Range Bar requires coordinate pairs.");
    const slot = Number(data[vertical ? 0 : 1]);
    const value = Number(data[vertical ? 1 : 0]);
    const normalized = (value - min) / (max - min);
    const band = (slot - cmin) / (cmax - cmin);
    return vertical
      ? [p.left + band * p.width, p.top + (1 - normalized) * p.height]
      : [p.left + normalized * p.width, p.top + band * p.height];
  };
}
/** Admission uses the supplied plot; renderItem separately validates the later engine layout. */
export function preflightRangeGeometry(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
  text: RangeBarText,
  category: RangeCategoryPlan,
): void {
  const p = input.context.plot;
  const plot = { x: p.left, y: p.top, width: p.width, height: p.height };
  const coord = preflightCoord(input, category);
  for (const s of Object.values(input.style.fields))
    finiteRangeGeometry({
      spacing: s.label.spacing + s.label.padding + p.width + p.height,
      strokeEnvelope: s.strokeWidth + p.width + p.height,
      dashEnvelope: s.lineDash.reduce((sum, n) => sum + n, Math.abs(s.lineDashOffset)),
    });
  if (input.style.valueScale === null) return;
  projection.fields.forEach((field, index) => {
    if (field.enabled)
      for (const datum of field.data)
        if (
          datum.summary &&
          rangeBarCategoryCoordinate(category, datum.groupSlot) !== null
        ) {
          const rect = interval(input, projection, datum, index, plot, coord, category);
          children(
            rect,
            input.style.direction === "vertical",
            input.style.fields[field.descriptor.id],
            text.endpoints[index][datum.groupSlot],
          );
        }
  });
}
