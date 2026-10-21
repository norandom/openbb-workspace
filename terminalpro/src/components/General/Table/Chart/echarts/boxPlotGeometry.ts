import type { CustomSeriesRenderItem, CustomSeriesRenderItemAPI } from "echarts";
import { type BoxValueScale, boxCoordinate } from "./boxPlotDomain";
import type {
  BoxPlotDatum,
  BoxPlotMappingInput,
  BoxPlotProjection,
  BoxStroke,
  ResolvedBoxFieldStyle,
} from "./boxPlotTypes";

type Plot = { x: number; y: number; width: number; height: number };
type Child = {
  type: "rect" | "line";
  shape: Record<string, number>;
  style: Record<string, unknown>;
};
function plotRectangle(value: unknown): Plot {
  if (
    !value ||
    typeof value !== "object" ||
    !("x" in value) ||
    !("y" in value) ||
    !("width" in value) ||
    !("height" in value) ||
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    typeof value.width !== "number" ||
    typeof value.height !== "number"
  )
    throw Error("Box Plot renderer requires a Cartesian plot rectangle.");
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}
export function finiteBoxGeometry(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite Box Plot renderer geometry.");
  if (value !== null && typeof value === "object")
    Object.values(value).forEach(finiteBoxGeometry);
}
export function boxBand(span: number, count: number, inner: number, outer: number) {
  const step =
    count === 1
      ? span * (1 - 2 * outer)
      : span / Math.max(1, count - inner + 2 * outer);
  return { step, width: step * (count === 1 ? 1 : 1 - inner) };
}
function groupBand(width: number, count: number, inner: number, index: number) {
  const padding = count === 1 ? 0 : inner;
  const rawStep = width / Math.max(1, count - padding);
  const step = padding !== 0 ? Math.floor(rawStep) : rawStep;
  const inset = Math.round((width - step * (count - padding)) / 2);
  const rounded = Math.round(step * (1 - padding));
  const bandwidth = rounded < 1 ? rawStep * (1 - padding) : rounded;
  return { offset: Math.round(inset + index * step), width: Math.round(bandwidth) };
}
function strokeStyle(s: BoxStroke, width = s.strokeWidth) {
  return {
    stroke: s.stroke,
    lineWidth: width,
    opacity: s.strokeOpacity,
    lineDash: [...s.lineDash],
    lineDashOffset: s.lineDashOffset,
    fill: "none",
  };
}
function rect(
  vertical: boolean,
  value: number,
  band: number,
  extent: number,
  width: number,
): Record<string, number> {
  return vertical
    ? { x: band, y: value, width, height: extent }
    : { x: value, y: band, width: extent, height: width };
}
function line(
  vertical: boolean,
  v1: number,
  b1: number,
  v2: number,
  b2: number,
): Record<string, number> {
  return vertical
    ? { x1: b1, y1: v1, x2: b2, y2: v2 }
    : { x1: v1, y1: b1, x2: v2, y2: b2 };
}
function children(
  vertical: boolean,
  values: readonly number[],
  start: number,
  width: number,
  s: ResolvedBoxFieldStyle,
): Child[] {
  const [low, q1, median, q3, high] = values;
  const box = rect(vertical, q1, start, q3 - q1, width);
  const w = Math.min(s.whisker.strokeWidth, width);
  const result: Child[] = [
    {
      type: "rect",
      shape: box,
      style: { fill: s.fill, opacity: s.fillOpacity, lineWidth: 0 },
    },
    { type: "rect", shape: { ...box }, style: strokeStyle(s) },
  ];
  const medianStart = Math.max(
    Math.round(median - s.strokeWidth / 2),
    q1 + s.strokeWidth,
  );
  const medianEnd = Math.min(
    Math.round(median + s.strokeWidth / 2),
    q3 - s.strokeWidth,
  );
  if (medianStart < medianEnd)
    result.push({
      type: "rect",
      shape: rect(
        vertical,
        medianStart,
        start + s.strokeWidth,
        medianEnd - medianStart,
        Math.max(0, width - 2 * s.strokeWidth),
      ),
      style: { fill: s.stroke, opacity: s.strokeOpacity, lineWidth: 0 },
    });
  const center = Math.floor(start + width / 2);
  const capStart = Math.floor(start + (width * (1 - s.cap.lengthRatio)) / 2);
  const capEnd = Math.ceil(start + (width * (1 + s.cap.lengthRatio)) / 2);
  const paint = strokeStyle(s.whisker, w);
  result.push(
    {
      type: "line",
      shape: line(vertical, Math.round(low + w / 2), center, q1, center),
      style: paint,
    },
    {
      type: "line",
      shape: line(vertical, q3, center, Math.round(high - w / 2), center),
      style: { ...paint },
    },
    {
      type: "line",
      shape: line(vertical, low, capStart, low, capEnd),
      style: { ...paint },
    },
    {
      type: "line",
      shape: line(vertical, high, capStart, high, capEnd),
      style: { ...paint },
    },
  );
  finiteBoxGeometry(result);
  return result;
}
function shapeBox(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  datum: BoxPlotDatum,
  fieldIndex: number,
  scale: BoxValueScale,
  plot: Plot,
  coord: CustomSeriesRenderItemAPI["coord"],
) {
  const vertical = input.style.direction === "vertical";
  const bandIndex = vertical ? 0 : 1;
  const valueIndex = vertical ? 1 : 0;
  const enabled = projection.fields.filter((f) => f.enabled);
  const field = projection.fields[fieldIndex];
  const visibleIndex = enabled.findIndex(
    (f) => f.descriptor.id === field.descriptor.id,
  );
  const span = vertical ? plot.width : plot.height;
  if (!(plot.width > 0 && plot.height > 0))
    throw Error("Box Plot renderer requires positive Cartesian spans.");
  finiteBoxGeometry(plot);
  const band = boxBand(
    span,
    projection.groups.length,
    input.style.band.paddingInner,
    input.style.band.paddingOuter,
  );
  const grouped = groupBand(
    band.width,
    enabled.length,
    input.style.band.groupPaddingInner,
    visibleIndex,
  );
  const raw = datum.summary!;
  const points = [raw.min, raw.q1, raw.median, raw.q3, raw.max].map((value) => {
    const v = boxCoordinate(value, scale);
    const point = coord(vertical ? [datum.groupSlot, v] : [v, datum.groupSlot]);
    if (!Array.isArray(point) || point.length < 2)
      throw Error("Invalid Box Plot coordinate.");
    finiteBoxGeometry(point);
    return point;
  });
  const start = Math.round(points[0][bandIndex] - band.width / 2) + grouped.offset;
  const pixels = points.map((p) => Math.round(p[valueIndex]));
  if (pixels[0] > pixels[4]) pixels.reverse();
  return children(
    vertical,
    pixels,
    start,
    grouped.width,
    input.style.fields[field.descriptor.id],
  );
}
export function createBoxRenderer(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  fieldIndex: number,
  scale: BoxValueScale,
  empty: boolean,
): CustomSeriesRenderItem {
  return (params, api) => {
    const datum = projection.fields[fieldIndex].data[params.dataIndex];
    if (empty || !projection.fields[fieldIndex].enabled || !datum?.summary) return;
    const plot = plotRectangle(params.coordSys);
    const shapes = shapeBox(
      input,
      projection,
      datum,
      fieldIndex,
      scale,
      plot,
      api.coord,
    );
    return {
      type: "group",
      children: shapes,
      clipPath: {
        type: "rect",
        shape: { x: plot.x, y: plot.y, width: plot.width, height: plot.height },
      },
    };
  };
}
/** Use the viewport envelope only for admission; the real render uses post-layout coordinates. */
export function preflightBoxGeometry(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  scale: BoxValueScale,
): void {
  const { width, height } = input.context.viewport;
  const vertical = input.style.direction === "vertical";
  for (const s of Object.values(input.style.fields))
    finiteBoxGeometry({
      mainInset: s.strokeWidth * 2,
      strokeEnvelope: s.whisker.strokeWidth + width + height,
      dashEnvelope: s.lineDash.reduce((sum, n) => sum + n, Math.abs(s.lineDashOffset)),
      whiskerDashEnvelope: s.whisker.lineDash.reduce(
        (sum, n) => sum + n,
        Math.abs(s.whisker.lineDashOffset),
      ),
    });
  const coord: CustomSeriesRenderItemAPI["coord"] = (data) => {
    if (!Array.isArray(data))
      throw Error("Box Plot preflight requires coordinate pairs.");
    const slot = Number(data[vertical ? 0 : 1]);
    const value = Number(data[vertical ? 1 : 0]);
    const normalized = (value - scale.min) / (scale.max - scale.min);
    const band = (slot + 0.5) / Math.max(1, projection.groups.length);
    return vertical
      ? [band * width, (1 - normalized) * height]
      : [normalized * width, band * height];
  };
  projection.fields.forEach((field, index) => {
    if (field.enabled)
      for (const datum of field.data)
        if (datum.summary)
          shapeBox(
            input,
            projection,
            datum,
            index,
            scale,
            { x: 0, y: 0, width, height },
            coord,
          );
  });
}
