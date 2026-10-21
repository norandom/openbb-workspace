import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  BoxPlotMappingInput,
  BoxLabelWrapping,
  BoxResolvedAxis,
  BoxStroke,
  ResolvedBoxFieldStyle,
} from "../echarts/boxPlotTypes";
import { composeAppearanceOptions } from "./appearanceComposition";
import type { AppearanceInput } from "./appearanceModel";
import type {
  ApplicationAxisRuntime,
  ApplicationConcreteAxis,
} from "./axisStructureTypes";
import type { BoxPlotControlValues } from "./boxPlotSessionTypes";
import { resolveCommonAppearance } from "./effectiveAppearance";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { mixAppearanceColor } from "./effectiveAppearanceColors";
import { at, bool, dash, number, object, text } from "./effectiveAppearanceValues";
export class BoxPlotExtensionError extends Error {}
function inspectExtensions(effective: RuntimeOptions) {
  if (at(effective, "navigator.miniChart.series") !== undefined)
    throw new BoxPlotExtensionError(
      "Explicit custom Box miniature series require compatibility support.",
    );
  for (const position of ["", ".bottom", ".top", ".left", ".right"])
    for (const field of ["values", "interval", "step"])
      if (at(effective, `axes.number${position}.tick.${field}`) !== undefined)
        throw new BoxPlotExtensionError(
          "Explicit custom Box numeric tick arrays or steps require compatibility support.",
        );
}
function concreteAxis(
  id: "category" | "number",
  horizontal: boolean,
  layers: RuntimeOptions[],
  runtime: ApplicationAxisRuntime,
): ApplicationConcreteAxis {
  const direction = (id === "category") !== horizontal ? "x" : "y";
  const positions = direction === "x" ? ["bottom", "top"] : ["left", "right"];
  let position: unknown = positions[0];
  for (const layer of layers) {
    const explicit = positions
      .map((p) => at(layer, `axes.${id}.${p}.position`))
      .find((p) => p !== undefined);
    position = explicit ?? at(layer, `axes.${id}.position`) ?? position;
  }
  if (
    position !== "bottom" &&
    position !== "top" &&
    position !== "left" &&
    position !== "right"
  )
    throw Error("Invalid Box axis position");
  if (!positions.includes(position))
    throw Error("Box axis position conflicts with direction");
  return {
    id,
    type: id,
    direction,
    position,
    options: runtime.axes.find((axis) => axis.id === id)?.options ?? {},
  };
}
function numericBounds(layers: RuntimeOptions[], axis: ApplicationConcreteAxis) {
  const result: { min?: number; max?: number } = {};
  const positions = axis.direction === "x" ? ["bottom", "top"] : ["left", "right"];
  for (const layer of layers)
    for (const key of ["min", "max"] as const) {
      const value =
        positions
          .map((p) => at(layer, `axes.number.${p}.${key}`))
          .find((v) => v !== undefined) ?? at(layer, `axes.number.${key}`);
      if (value !== undefined) result[key] = number(value, Number.NEGATIVE_INFINITY);
    }
  return result;
}
function axisValue(
  layers: RuntimeOptions[],
  axis: ApplicationConcreteAxis,
  path: string,
): unknown {
  const runtime = at(axis.options, path);
  if (runtime !== undefined) return runtime;
  const positions = axis.direction === "x" ? ["bottom", "top"] : ["left", "right"];
  let value: unknown;
  for (const layer of layers) {
    const root = at(layer, `axes.${axis.id}`);
    const generic = at(root, path);
    if (generic !== undefined) value = generic;
    for (const position of positions) {
      const positioned = at(root, `${position}.${path}`);
      if (positioned !== undefined) {
        value = positioned;
        break;
      }
    }
  }
  return value;
}
function labelPolicy(
  layers: RuntimeOptions[],
  axis: ApplicationConcreteAxis,
  appearance: BoxResolvedAxis,
): BoxResolvedAxis {
  const read = (key: string) => axisValue(layers, axis, `label.${key}`);
  const wrapping = read("wrapping") ?? (axis.id === "category" ? "on-space" : "never");
  if (!["never", "always", "hyphenate", "on-space"].includes(text(wrapping)))
    throw Error("Invalid Box label wrapping");
  const minSpacing = read("minSpacing");
  return {
    ...appearance,
    labels: {
      ...appearance.labels,
      enabled: bool(read("enabled") ?? true),
      avoidCollisions: bool(read("avoidCollisions") ?? true),
      wrapping: wrapping as BoxLabelWrapping,
      ...(minSpacing === undefined ? {} : { minSpacing: number(minSpacing) }),
    },
  };
}
function fieldStyle(
  series: RuntimeOptions,
  fill: string,
  stroke: string,
  background: string,
): ResolvedBoxFieldStyle {
  const main: BoxStroke = {
    stroke: text(series.stroke ?? stroke),
    strokeWidth: number(series.strokeWidth),
    strokeOpacity: number(series.strokeOpacity, 0, 1),
    lineDash: dash(series.lineDash),
    lineDashOffset: number(series.lineDashOffset, Number.NEGATIVE_INFINITY),
  };
  const whisker = object(series.whisker);
  return {
    ...main,
    ...(series.visible === undefined ? {} : { visible: bool(series.visible) }),
    ...(series.showInMiniChart === undefined
      ? {}
      : { showInMiniChart: bool(series.showInMiniChart) }),
    fill: text(series.fill ?? mixAppearanceColor(fill, background, 0.7)),
    fillOpacity: number(series.fillOpacity, 0, 1),
    whisker: {
      stroke: text(whisker.stroke ?? main.stroke),
      strokeWidth: number(whisker.strokeWidth ?? main.strokeWidth),
      strokeOpacity: number(whisker.strokeOpacity ?? main.strokeOpacity, 0, 1),
      lineDash: dash(whisker.lineDash ?? main.lineDash),
      lineDashOffset: number(
        whisker.lineDashOffset ?? main.lineDashOffset,
        Number.NEGATIVE_INFINITY,
      ),
    },
    cap: { lengthRatio: number(at(series, "cap.lengthRatio"), 0, 1) },
  };
}
export function resolveBoxPlotAppearance(
  input: Omit<AppearanceInput, "family"> & { family: "boxPlot" },
) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const defaults = merge({}, appearanceDefaults(input), {
    tooltip: { mode: "single" },
    series: {
      strokeWidth: 2,
      lineDashOffset: 0,
      direction: "vertical",
      cap: { lengthRatio: 0.5 },
    },
  });
  const layers = [
    defaults,
    object(input.theme.overrides.common),
    object(input.theme.overrides["box-plot"]),
    object(composed.value.common),
    object(composed.value["box-plot"]),
  ];
  const effective = merge({}, ...layers);
  inspectExtensions(effective);
  const series = object(effective.series);
  const direction = series.direction;
  if (direction !== "vertical" && direction !== "horizontal")
    throw Error("Invalid Box direction");
  const category = concreteAxis(
    "category",
    direction === "horizontal",
    layers,
    input.axisRuntime,
  );
  const numeric = concreteAxis(
    "number",
    direction === "horizontal",
    layers,
    input.axisRuntime,
  );
  const axisRuntime: ApplicationAxisRuntime = {
    axes: [category, numeric],
    categoryAxisType: "category",
  };
  const common = resolveCommonAppearance({ ...input, axisRuntime }, layers);
  const application = {
    ...common,
    axes: {
      category: labelPolicy(layers, category, common.axes.category),
      number: labelPolicy(layers, numeric, common.axes.number),
    },
  };
  const fields = Object.fromEntries(
    input.seriesIds.map((id, index) => [
      id,
      fieldStyle(
        series,
        application.palette.fills[index % application.palette.fills.length],
        application.palette.strokes[index % application.palette.strokes.length],
        input.theme.colors.chartBackgroundColor,
      ),
    ]),
  );
  const style: BoxPlotMappingInput["style"] = {
    common: {
      textColor: input.theme.colors.textColor,
      fontFamily: application.axes.category.labels.font,
      fontSize: application.axes.category.labels.size,
      precision: input.precision,
    },
    application,
    direction,
    axes: {
      category: application.axes.category,
      number: {
        appearance: application.axes.number,
        ...numericBounds(layers, numeric),
      },
    },
    band: {
      paddingInner: number(axisValue(layers, category, "paddingInner") ?? 0.3, 0, 1),
      paddingOuter: number(axisValue(layers, category, "paddingOuter") ?? 0.15, 0, 0.5),
      groupPaddingInner: number(
        axisValue(layers, category, "groupPaddingInner") ?? 0.2,
        0,
        1,
      ),
    },
    fields,
  };
  // Empty selections retain editable inherited styles without inventing a field in the mapper.
  const controls = fieldStyle(
    series,
    application.palette.fills[0],
    application.palette.strokes[0],
    input.theme.colors.chartBackgroundColor,
  );
  const values: BoxPlotControlValues = {
    direction,
    whisker: controls.whisker,
    cap: controls.cap,
  };
  return {
    application,
    style,
    axisRuntime,
    controls: values,
    configuredVisible: series.visible === undefined ? true : bool(series.visible),
  };
}
