import type { FunnelRenderInput } from "../application/funnelRenderTypes";
import { measureText } from "./cartesianLayout";
import { funnelLabelLayout } from "./funnelLabels";

export interface FunnelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FunnelStageGeometry {
  index: number;
  rowId: string;
  points: number[][];
  connector?: number[][];
  center: [number, number];
  hitArea?: FunnelRect;
}
function hitArea(
  input: FunnelRenderInput,
  plot: FunnelRect,
  index: number,
): FunnelRect {
  const horizontal = input.style.direction === "horizontal";
  const n = input.data.stages.length;
  const cone = input.style.family === "coneFunnel";
  const start = cone && n > 1 ? Math.max(0, (index - 0.5) / (n - 1)) : index / n;
  const end = cone && n > 1 ? Math.min(1, (index + 0.5) / (n - 1)) : (index + 1) / n;
  return horizontal
    ? {
        x: plot.x + start * plot.width,
        y: plot.y,
        width: (end - start) * plot.width,
        height: plot.height,
      }
    : {
        x: plot.x,
        y: plot.y + start * plot.height,
        width: plot.width,
        height: (end - start) * plot.height,
      };
}
export interface FunnelGeometry {
  plot: FunnelRect;
  stageLabelArea: FunnelRect;
  numericLabelArea: FunnelRect;
  stages: FunnelStageGeometry[];
  positions: [number, number][];
}
function content(input: FunnelRenderInput): FunnelRect {
  const a = input.style.application;
  const s = input.style.seriesAreaPadding;
  const v = input.context.viewport;
  const caption = [a.title, a.subtitle].reduce(
    (sum, c) =>
      sum + (c.enabled && c.text ? measureText(c.text, c).height + c.spacing : 0),
    0,
  );
  const x = Math.min(v.width, a.padding.left + s.left);
  const y = Math.min(v.height, a.padding.top + caption + s.top);
  return {
    x,
    y,
    width: Math.max(0, v.width - x - a.padding.right - s.right),
    height: Math.max(0, v.height - y - a.padding.bottom - s.bottom),
  };
}
function fitAspect(input: FunnelRenderInput, plot: FunnelRect): FunnelRect {
  const s = input.style;
  if (s.family !== "pyramid" || !s.aspectRatio) return plot;
  const ratio = s.direction === "horizontal" ? 1 / s.aspectRatio : s.aspectRatio;
  const width = Math.min(plot.width, plot.height * ratio);
  const height = Math.min(plot.height, plot.width / ratio);
  return {
    x: plot.x + (plot.width - width) / 2,
    y: plot.y + (plot.height - height) / 2,
    width,
    height,
  };
}
function point(
  plot: FunnelRect,
  horizontal: boolean,
  axial: number,
  cross: number,
): [number, number] {
  return horizontal
    ? [plot.x + axial * plot.width, plot.y + cross * plot.height]
    : [plot.x + cross * plot.width, plot.y + axial * plot.height];
}
function polygon(
  plot: FunnelRect,
  horizontal: boolean,
  a: number,
  b: number,
  first: number,
  last: number,
) {
  return [
    point(plot, horizontal, a, (1 - first) / 2),
    point(plot, horizontal, a, (1 + first) / 2),
    point(plot, horizontal, b, (1 + last) / 2),
    point(plot, horizontal, b, (1 - last) / 2),
  ];
}
function magnitude(input: FunnelRenderInput, plot: FunnelRect, index: number) {
  if (input.data.family === "pyramid" || input.style.family === "pyramid")
    throw Error("Family mismatch");
  const n = input.data.stages.length;
  const horizontal = input.style.direction === "horizontal";
  const ratio = input.data.magnitudeRatios[index] ?? 0;
  const next = input.data.magnitudeRatios[index + 1];
  if (input.style.family === "coneFunnel") {
    const a = n > 1 ? index / (n - 1) : 0.5;
    const b = n > 1 ? (index + 1) / (n - 1) : a;
    return {
      points: next == null ? [] : polygon(plot, horizontal, a, b, ratio, next),
      center: point(plot, horizontal, a, 0.5),
    };
  }
  const gap = input.style.spacingRatio / (2 * n);
  const a = index / n + gap;
  const b = (index + 1) / n - gap;
  return {
    points: polygon(plot, horizontal, a, b, ratio, ratio),
    center: point(plot, horizontal, (index + 0.5) / n, 0.5),
    connector:
      input.style.dropOff.enabled && next != null
        ? polygon(plot, horizontal, b, (index + 1) / n + gap, ratio, next)
        : undefined,
  };
}
function pyramid(input: FunnelRenderInput, plot: FunnelRect, index: number) {
  if (input.data.family !== "pyramid" || input.style.family !== "pyramid")
    throw Error("Family mismatch");
  let range = input.data.axialRanges[index];
  const horizontal = input.style.direction === "horizontal";
  if (!range) {
    let boundary = 0;
    for (let previous = index - 1; previous >= 0; previous--) {
      const prior = input.data.axialRanges[previous];
      if (prior) {
        boundary = prior.end;
        break;
      }
    }
    range = { start: boundary, end: boundary };
  }
  const length = horizontal ? plot.width : plot.height;
  const spacing = input.style.spacing;
  const available = Math.max(0, length - spacing * (input.data.stages.length - 1));
  const a = length
    ? (available * range.start + Math.min(length, spacing * index)) / length
    : 0;
  const b = length
    ? (available * range.end + Math.min(length, spacing * index)) / length
    : 0;
  const width = (t: number) =>
    input.style.family === "pyramid" && input.style.reverse ? 1 - t : t;
  return {
    points: available ? polygon(plot, horizontal, a, b, width(a), width(b)) : [],
    center: point(plot, horizontal, (a + b) / 2, 0.5),
  };
}
export function funnelGeometry(input: FunnelRenderInput): FunnelGeometry {
  const layout = funnelLabelLayout(input, content(input));
  const plot = fitAspect(input, layout.plot);
  const stages: FunnelStageGeometry[] = [];
  const positions: [number, number][] = [];
  input.data.stages.forEach((stage, index) => {
    const shape =
      input.data.family === "pyramid"
        ? pyramid(input, plot, index)
        : magnitude(input, plot, index);
    positions.push(shape.center);
    if (stage.kind === "value" && plot.width > 0 && plot.height > 0)
      stages.push({
        index: stage.index,
        rowId: stage.rowId,
        ...shape,
        hitArea:
          input.style.family === "pyramid" ? undefined : hitArea(input, plot, index),
      });
  });
  return { ...layout, plot, stages, positions };
}
