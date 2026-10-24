import type { RadialMappingInput } from "../compatibility/radialContracts";
import { measureText } from "./cartesianLayout";
import type { RadialData } from "./radialData";
import { bands, convert, TOP, TURN } from "./radialScale";

export interface BarMeasuredAngularLabel {
  readonly value: number;
  readonly angle: number;
  readonly width: number;
  readonly height: number;
}
export interface BarMeasuredCategoryLabel {
  readonly value: string | number;
  readonly radiusFraction: number;
  readonly width: number;
  readonly height: number;
}
export interface BarCircleFitInput {
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly innerRadiusRatio: number;
  readonly angularOffset: number;
  readonly angular: readonly BarMeasuredAngularLabel[];
  readonly category: readonly BarMeasuredCategoryLabel[];
}
export interface BarFittedAnchor {
  readonly value: string | number;
  readonly x: number;
  readonly y: number;
  readonly angle?: number;
  readonly align: "left" | "center" | "right";
  readonly verticalAlign: "top" | "middle" | "bottom";
}
export interface BarCircleFit {
  readonly center: readonly [number, number];
  readonly radius: number;
  readonly hole: number;
  readonly numericalLabels: readonly BarFittedAnchor[];
  readonly categoryLabels: readonly BarFittedAnchor[];
}
function finite(value: number, minimum = Number.NEGATIVE_INFINITY): number {
  if (!Number.isFinite(value) || value < minimum)
    throw Error("Invalid Bar fit input");
  return value;
}
function direction(angle: number) {
  finite(angle);
  const zero = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
  return { c: zero(Math.cos(angle)), s: zero(Math.sin(angle)) };
}
function angularLimit(
  half: number,
  dimension: number,
  component: number,
  offset: number,
) {
  finite(dimension, 0);
  return component === 0
    ? dimension / 2 <= half
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY
    : (half - dimension) / Math.abs(component) - offset;
}
export function fitRadialBarCircle(
  input: BarCircleFitInput,
): BarCircleFit | null {
  const { rect, angularOffset: offset, innerRadiusRatio: ratio } = input;
  finite(rect.x);
  finite(rect.y);
  finite(offset, 0);
  finite(ratio, 0);
  if (ratio > 1) throw Error("Invalid Bar hole ratio");
  const a = finite(rect.width, 0) / 2;
  const b = finite(rect.height, 0) / 2;
  let radius = Math.min(a, b);
  for (const label of input.angular) {
    finite(label.value);
    const { c, s } = direction(label.angle);
    radius = Math.min(
      radius,
      angularLimit(a, label.width, c, offset),
      angularLimit(b, label.height, s, offset),
    );
  }
  for (const label of input.category) {
    if (typeof label.value === "number") finite(label.value);
    finite(label.width, 0);
    finite(label.height, 0);
    finite(label.radiusFraction, 0);
    if (label.width + 10 > a || label.height / 2 > b)
      radius = Number.NEGATIVE_INFINITY;
    if (label.radiusFraction > 0)
      radius = Math.min(radius, (b - label.height / 2) / label.radiusFraction);
  }
  if (radius < 0) return null;
  return {
    center: [finite(rect.x + a), finite(rect.y + b)],
    radius,
    hole: radius * ratio,
    numericalLabels: input.angular.map((label) => {
      const { c, s } = direction(label.angle);
      return {
        value: label.value,
        x: (radius + offset) * c,
        y: (radius + offset) * s,
        angle: label.angle - TOP,
        align: c > 0 ? "left" : c < 0 ? "right" : "center",
        verticalAlign: s > 0 ? "top" : s < 0 ? "bottom" : "middle",
      };
    }),
    categoryLabels: input.category.map((label) => ({
      value: label.value,
      x: -10,
      y: -label.radiusFraction * radius,
      align: "right",
      verticalAlign: "middle",
    })),
  };
}
/** Adapter formats prepared ticks; the fitter has no application-state dependency. */
export function prepareBarLayout(
  input: RadialMappingInput,
  data: RadialData,
  domain: readonly [number, number],
  ticks: readonly number[],
  rect: BarCircleFitInput["rect"],
): BarCircleFit | null {
  if (input.style.axes.numerical.labels.orientation !== "fixed") return null;
  const category = input.style.axes.category;
  const ratio = category.innerRadiusRatio;
  const band = bands(
    1,
    ratio,
    data.categories.length,
    category.paddingInner,
    category.paddingOuter,
  );
  return fitRadialBarCircle({
    rect,
    innerRadiusRatio: ratio,
    angularOffset: 11,
    angular: ticks
      .filter(
        (value, i) => i === 0 || domain[0] === domain[1] || value !== domain[1],
      )
      .map((value) => ({
        value,
        angle: convert(value, domain, TOP, TOP + TURN),
        ...measureText(
          String(input.context.numericAxisLabel(value)),
          input.style.axes.numerical.labels,
        ),
      })),
    category: data.categories.map((value, i) => ({
      value,
      radiusFraction: 1 + ratio - band.origin(i) + Math.abs(band.width) / 2,
      ...measureText(
        String(input.context.display.category(value)),
        category.labels,
      ),
    })),
  });
}
/** Single row/column reservation matches native legend bounds; scroll retains the existing fallback. */
export function barLegendSize(
  input: RadialMappingInput,
  data: RadialData,
): number | null {
  const app = input.style.application;
  const legend = app.legend;
  const sizes = data.series.map((s) =>
    measureText(String(input.context.display.legend(s.label)), legend),
  );
  const widths = sizes.map(
    (s) => s.width + legend.markerSize + legend.itemSpacing,
  );
  const heights = sizes.map((s) => Math.max(s.height, legend.markerSize));
  const vertical = legend.position === "left" || legend.position === "right";
  if (vertical) {
    const height =
      heights.reduce((sum, value) => sum + value, 0) +
      Math.max(0, sizes.length - 1) * legend.verticalSpacing;
    return height <=
      input.context.viewport.height - app.padding.top - app.padding.bottom
      ? Math.max(0, ...widths)
      : null;
  }
  const width =
    widths.reduce((sum, value) => sum + value, 0) +
    Math.max(0, sizes.length - 1) * legend.horizontalSpacing;
  return width <=
    input.context.viewport.width - app.padding.left - app.padding.right
    ? Math.max(0, ...heights)
    : null;
}
