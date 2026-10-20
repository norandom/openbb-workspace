import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { HistogramMappingInput } from "../echarts/histogramTypes";
import type { AppearanceInput } from "./appearanceModel";
import { composeAppearanceOptions } from "./appearanceComposition";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { resolveCommonAppearance } from "./effectiveAppearance";
import { at, number, object } from "./effectiveAppearanceValues";
import { resolveXyAxisPositions } from "./xyAxisPositions";
import { xyAxesRuntime } from "./xyAppearance";

function bounds(layers: RuntimeOptions[], direction: "x" | "y") {
  const positions = direction === "x" ? ["bottom", "top"] : ["left", "right"];
  const result: { min?: number; max?: number } = {};
  for (const layer of layers) {
    for (const key of ["min", "max"] as const) {
      const positioned = positions.map(position => at(layer, `axes.number.${position}.${key}`))
        .find(value => value !== undefined);
      const value = positioned === undefined ? at(layer, `axes.number.${key}`) : positioned;
      if (value !== undefined) result[key] = number(value, -Infinity);
    }
  }
  return result;
}
export function resolveHistogramAppearance(input: Omit<AppearanceInput, "family"> & { family: "histogram" }) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const defaults = merge({}, appearanceDefaults(input), {
    tooltip: { mode: "single" }, series: { strokeWidth: 1, fillOpacity: 1 },
  });
  const layers = [defaults, object(input.theme.overrides.common), object(input.theme.overrides.histogram),
    object(composed.value.common), object(composed.value.histogram)];
  const axisRuntime = resolveXyAxisPositions(xyAxesRuntime, layers);
  const application = resolveCommonAppearance({ ...input, axisRuntime }, layers);
  const series = object(merge({}, ...layers).series);
  const style: HistogramMappingInput["style"] = {
    common: { textColor: input.theme.colors.textColor, fontFamily: application.axes.category.labels.font,
      fontSize: application.axes.category.labels.size, precision: input.precision },
    application,
    axes: { x: { appearance: application.axes.category, ...bounds(layers, "x") },
      y: { appearance: application.axes.number, ...bounds(layers, "y") } },
    series: { ...application.series,
      ...(series.fill === undefined ? {} : { fill: series.fill as string }),
      ...(series.stroke === undefined ? {} : { stroke: series.stroke as string }) },
  };
  // H1 validates inactive supplied boundaries too; do not coerce or discard them here.
  const binning = { ...(series.binCount === undefined ? {} : { binCount: series.binCount }),
    ...(series.bins === undefined ? {} : { bins: series.bins }) } as HistogramMappingInput["binning"];
  return { application, style, binning };
}

