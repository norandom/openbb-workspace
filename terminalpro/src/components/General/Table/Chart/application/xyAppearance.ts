import { resolveXyAxisPositions } from "./xyAxisPositions";
import merge from "lodash.merge";
import type { XyChartType } from "../compatibility/xyAssignments";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { ResolvedXyStyle } from "../echarts/xyTypes";
import type { AppearanceInput } from "./appearanceModel";
import { composeAppearanceOptions } from "./appearanceComposition";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { resolveCommonAppearance } from "./effectiveAppearance";
import { at, number, object, text } from "./effectiveAppearanceValues";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";

export const xyAxesRuntime: ApplicationAxisRuntime = {
  categoryAxisType: "number",
  axes: [
    { id: "category", direction: "x", type: "number", position: "bottom", options: {} },
    { id: "number", direction: "y", type: "number", position: "left", options: {} },
  ],
};
type Input = Omit<AppearanceInput, "family"> & { family: XyChartType;
  defaultTitles?: { x: string; y: string; enabled: boolean } };
function layers(input: Input): RuntimeOptions[] {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const defaults = merge({}, appearanceDefaults(input), {
    paired: true,
    tooltip: { mode: "single" },
    series: {
      shape: "circle", size: 7, maxSize: 30, strokeWidth: 1, fillOpacity: 0.8,
      label: { color: input.theme.colors.textColor },
      marker: { enabled: true, shape: "circle", size: 7, strokeWidth: 1 },
    },
  });
  if (input.family === "scatter" && input.defaultTitles) {
    const family = object(composed.value.scatter);
    const hasTitle = ["top", "right", "left", "bottom"].some((position) =>
      at(family, `axes.number.${position}.title.text`) !== undefined);
    if (!hasTitle) {
      const title = { enabled: input.defaultTitles.enabled, spacing: 10, fontSize: 11 };
      merge(defaults, { axes: { number: {
        bottom: { title: { ...title, text: input.defaultTitles.x } },
        left: { title: { ...title, text: input.defaultTitles.y } },
      } } });
    }
  }
  return [defaults, object(input.theme.overrides.common),
    object(input.theme.overrides[input.family]), object(composed.value.common),
    object(composed.value[input.family])];
}
function bounds(layers: RuntimeOptions[], direction: "x" | "y") {
  const position = direction === "x" ? "bottom" : "left";
  const result: { min?: number; max?: number } = {};
  for (const layer of layers) {
    for (const key of ["min", "max"] as const) {
      const value = at(layer, `axes.number.${position}.${key}`) ?? at(layer, `axes.number.${key}`);
      if (value !== undefined) result[key] = number(value, -Infinity);
    }
  }
  return result;
}
function normalizePointLayer(layer: RuntimeOptions): RuntimeOptions {
  const { marker: _inactive, ...series } = object(layer.series);
  const marker: RuntimeOptions = { enabled: true };
  for (const key of ["shape", "size", "strokeWidth"] as const) {
    if (series[key] !== undefined)
      marker[key] = key === "shape" ? text(series[key]) : number(series[key]);
  }
  return { ...layer, series: { ...series, marker } };
}
export function resolveXyAppearance(input: Input) {
  const source = layers(input);
  const effective = merge({}, ...source);
  const series = object(effective.series);
  // Preserve layer order: a later shared axis leaf overrides an earlier positional leaf.
  const normalized = source.map(normalizePointLayer);
  const axisRuntime = resolveXyAxisPositions(xyAxesRuntime, source);
  const application = resolveCommonAppearance({ ...input, axisRuntime }, normalized);
  const overrides = Object.fromEntries(input.seriesIds.map((id) => [id, {
    ...(typeof series.fill === "string" ? { fill: series.fill } : {}),
    ...(typeof series.stroke === "string" ? { stroke: series.stroke } : {}),
  }]));
  const style: ResolvedXyStyle = {
    common: { textColor: input.theme.colors.textColor,
      fontFamily: application.axes.category.labels.font,
      fontSize: application.axes.category.labels.size, precision: input.precision },
    application,
    axes: {
      x: { appearance: application.axes.category, ...bounds(source, "x") },
      y: { appearance: application.axes.number, ...bounds(source, "y") },
    },
    series: application.series,
    maxSize: number(series.maxSize),
    overrides,
  };
  if (typeof effective.paired !== "boolean") throw Error("Invalid XY pairing");
  return { style, application, paired: effective.paired };
}
