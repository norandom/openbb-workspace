import merge from "lodash.merge";
import { isCartesianFamily } from "../echarts/cartesianTypes";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import { composeAppearanceOptions } from "./appearanceComposition";
import type {
  AppearanceInput,
  ResolveApplicationAppearance,
  ResolvedApplicationAppearance,
} from "./appearanceModel";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import { paletteSeries, resolveAppearanceSeries } from "./effectiveAppearanceSeries";
import {
  at,
  bool,
  caption,
  child,
  font,
  number,
  object,
  text,
  type ReadAppearance,
} from "./effectiveAppearanceValues";

function validateInput(input: AppearanceInput): void {
  if (!isCartesianFamily(input.family))
    throw new Error("Unsupported appearance family");
  number(input.precision, 0, 20);
  if (!Number.isInteger(input.precision))
    throw new Error("Precision must be an integer");
  if (
    !Array.isArray(input.seriesIds) ||
    input.seriesIds.some((id) => typeof id !== "string" || !id) ||
    new Set(input.seriesIds).size !== input.seriesIds.length
  )
    throw new Error("Invalid stable series IDs");
  if (!input.theme.name || !["light", "dark"].includes(input.theme.mode))
    throw new Error("Missing selected application theme");
  for (const palette of [input.theme.palette.fills, input.theme.palette.strokes]) {
    if (
      !Array.isArray(palette) ||
      !palette.length ||
      palette.some((entry) => typeof entry !== "string" || !entry)
    )
      throw new Error("Missing selected theme palette");
  }
  const axes = input.axisRuntime.axes;
  if (
    !Array.isArray(axes) ||
    axes.length !== 2 ||
    new Set(axes.map((axis) => axis.id)).size !== 2 ||
    new Set(axes.map((axis) => axis.direction)).size !== 2
  )
    throw new Error("Missing concrete chart axes");
  for (const axis of axes) {
    if (
      !["category", "number"].includes(axis.id) ||
      !["category", "number", "time", "grouped-category"].includes(axis.type)
    )
      throw new Error("Invalid concrete axis identity/type");
    if (
      !(axis.direction === "x" ? ["top", "bottom"] : ["left", "right"]).includes(
        axis.position,
      )
    )
      throw new Error("Invalid concrete axis position");
  }
}

function layers(input: AppearanceInput): RuntimeOptions[] {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw new Error(composed.error);
  const selected = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: "appearance",
    previous: {
      stateAddress: "appearance",
      chartType: input.family,
      model: {},
      options: input.theme.overrides,
    },
  });
  if (!selected.valid) throw new Error(selected.error);
  const family = input.family === "line" ? "line" : "bar";
  const overrides = [
    object(selected.value.options.common),
    object(selected.value.options[family]),
    object(composed.value.common),
    object(composed.value[family]),
  ];
  const supplied = merge({}, ...overrides);
  const defaults = appearanceDefaults(input);
  const series = object(defaults.series);
  if (input.family !== "line" && at(supplied, "series.stroke") !== undefined)
    series.strokeWidth = 2;
  if (at(supplied, "series.marker.stroke") !== undefined)
    object(series.marker).strokeWidth = 1;
  if (
    ["outside-start", "outside-end"].includes(
      String(at(supplied, "series.label.placement")),
    )
  )
    object(series.label).color = input.theme.colors.textColor;
  return [defaults, ...overrides];
}

function resolveLegend(read: ReadAppearance): ResolvedApplicationAppearance["legend"] {
  return {
    ...font(child(read, "item.label")),
    enabled: bool(read("enabled")),
    position: text(read("position")),
    spacing: number(read("spacing")),
    markerSize: number(read("item.marker.size")),
    markerStroke: number(read("item.marker.strokeWidth")),
    itemSpacing: number(read("item.marker.padding")),
    horizontalSpacing: number(read("item.paddingX")),
    verticalSpacing: number(read("item.paddingY")),
  };
}

function application(
  input: AppearanceInput,
  sourceLayers: RuntimeOptions[],
): ResolvedApplicationAppearance {
  const effective = merge({}, ...sourceLayers);
  const read: ReadAppearance = (path) => at(effective, path);
  let title = caption(child(read, "title"));
  const subtitle = caption(child(read, "subtitle"));
  if (
    subtitle.enabled &&
    sourceLayers.slice(1).every((layer) => at(layer, "title.spacing") === undefined)
  )
    title = { ...title, spacing: 10 };
  const category = input.axisRuntime.axes.find((axis) => axis.id === "category");
  const numeric = input.axisRuntime.axes.find((axis) => axis.id === "number");
  if (!category || !numeric) throw new Error("Missing concrete category/number axis");
  const series = resolveAppearanceSeries(child(read, "series"));
  const legend = resolveLegend(child(read, "legend"));
  const explicitLegendStroke = sourceLayers.slice(1).some(
    (layer) => at(layer, "legend.item.marker.strokeWidth") !== undefined,
  );
  return {
    title,
    subtitle,
    legend,
    legendMarkerStrokeWidth: explicitLegendStroke
      ? legend.markerStroke
      : Math.min(2, input.family === "line" ? series.markers.strokeWidth : series.strokeWidth),
    padding: {
      top: number(read("padding.top")),
      right: number(read("padding.right")),
      bottom: number(read("padding.bottom")),
      left: number(read("padding.left")),
    },
    background: {
      visible: bool(read("background.visible")),
      fill: text(read("background.fill")),
    },
    tooltip: {
      enabled: bool(read("tooltip.enabled")),
      mode: text(read("tooltip.mode")),
    },
    axes: {
      category: resolveAppearanceAxis(sourceLayers, category),
      number: resolveAppearanceAxis(sourceLayers, numeric),
    },
    series,
    palette: {
      fills: [...input.theme.palette.fills],
      strokes: [...input.theme.palette.strokes],
    },
  };
}

export const resolveApplicationAppearance: ResolveApplicationAppearance = (input) => {
  try {
    validateInput(input);
    const sourceLayers = layers(input);
    const resolved = application(input, sourceLayers);
    const seriesOptions = merge(
      {},
      ...sourceLayers.map((layer) => object(layer.series)),
    );
    const read: ReadAppearance = (path) => at(seriesOptions, path);
    const series = Object.fromEntries(
      input.seriesIds.map((id, index) => [
        id,
        paletteSeries(
          read,
          input.family,
          resolved.palette.fills[index % resolved.palette.fills.length],
          resolved.palette.strokes[index % resolved.palette.strokes.length],
          resolved.series,
        ),
      ]),
    );
    const position = resolved.legend.position;
    if (!["top", "bottom", "left", "right"].includes(position))
      throw new Error("Unresolved legend placement");
    return {
      valid: true,
      value: {
        application: resolved,
        background: resolved.background.visible
          ? resolved.background.fill
          : "transparent",
        palette: [...resolved.palette.fills],
        textColor: input.theme.colors.textColor,
        fontFamily: resolved.axes.category.labels.font,
        fontSize: resolved.axes.category.labels.size,
        title: resolved.title.text,
        titleEnabled: resolved.title.enabled,
        typography: {
          title: {
            color: resolved.title.color,
            fontFamily: resolved.title.font,
            fontSize: resolved.title.size,
          },
          legend: {
            color: resolved.legend.color,
            fontFamily: resolved.legend.font,
            fontSize: resolved.legend.size,
          },
          axis: {
            color: resolved.axes.category.labels.color,
            fontFamily: resolved.axes.category.labels.font,
            fontSize: resolved.axes.category.labels.size,
          },
        },
        legend: {
          visible: resolved.legend.enabled,
          position: position as "top" | "bottom" | "left" | "right",
        },
        line: {
          connectMissingData: resolved.series.connectMissingData,
          markers: {
            enabled: resolved.series.markers.enabled,
            shape: resolved.series.markers.shape,
            size: resolved.series.markers.size,
          },
        },
        series,
        precision: input.precision,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to resolve application appearance",
    };
  }
};
