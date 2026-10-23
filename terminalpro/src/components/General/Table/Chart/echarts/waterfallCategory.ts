import type { WaterfallRenderInput } from "../application/waterfallTypes";
import type { WaterfallPoint } from "../compatibility/waterfallTotals";
import type { WaterfallWindow } from "./waterfallNavigator";

export function waterfallContinuous(input: WaterfallRenderInput): boolean {
  return input.appearance.application.axes.category.fields.type !== "category";
}
export function waterfallCategory(
  input: WaterfallRenderInput,
  index: number,
  local: number,
): number {
  const type = input.appearance.application.axes.category.fields.type;
  const raw = input.snapshot.rows[index].category;
  const value =
    type === "time" ? new Date(raw).getTime() : type === "number" ? Number(raw) : local;
  if (!Number.isFinite(value))
    throw Error("Waterfall category cannot be represented on its selected axis.");
  return value;
}
export function waterfallInterval(input: WaterfallRenderInput): number {
  if (!waterfallContinuous(input)) return 1;
  const values = [
    ...new Set(input.snapshot.rows.map((_, i) => waterfallCategory(input, i, i))),
  ].sort((a, b) => a - b);
  let interval = Number.POSITIVE_INFINITY;
  for (let i = 1; i < values.length; i++)
    interval = Math.min(interval, values[i] - values[i - 1]);
  return Number.isFinite(interval)
    ? interval
    : input.appearance.application.axes.category.fields.type === "time"
      ? 86400000
      : 1;
}
export function waterfallCategoryDomain(input: WaterfallRenderInput): WaterfallWindow {
  if (!waterfallContinuous(input)) return [0, Math.max(1, input.snapshot.rows.length)];
  const values = input.snapshot.rows.map((_, i) => waterfallCategory(input, i, i));
  const half = waterfallInterval(input) / 2;
  return values.length
    ? [
        values.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY) - half,
        values.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY) + half,
      ]
    : [0, 1];
}
export function waterfallCategoryWindow(
  input: WaterfallRenderInput,
  window: WaterfallWindow,
): WaterfallWindow {
  const full = waterfallCategoryDomain(input);
  const span = full[1] - full[0];
  return [full[0] + window[0] * span, full[0] + window[1] * span];
}
export function cropWaterfall(
  input: WaterfallRenderInput,
  points: readonly WaterfallPoint[],
  window: WaterfallWindow,
): readonly WaterfallPoint[] {
  if (!waterfallContinuous(input))
    return points.slice(
      Math.floor(window[0] * points.length),
      Math.ceil(window[1] * points.length),
    );
  const extent = waterfallCategoryWindow(input, window);
  return points.filter((point) => {
    const value = waterfallCategory(input, point.index, point.index);
    return value >= extent[0] && value <= extent[1];
  });
}
