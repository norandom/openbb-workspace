import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { isAreaFamily } from "../echarts/cartesianAreaTypes";
import { isCartesianFamily } from "../echarts/cartesianTypes";
import type {
  AppearanceInput,
  ResolveApplicationAppearance,
  ResolvedApplicationAppearance,
} from "./appearanceModel";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { appearanceLayers } from "./effectiveAppearanceLayers";
import { paletteSeries, resolveAppearanceSeries } from "./effectiveAppearanceSeries";
import {
  at,
  child,
  number,
  object,
  type ReadAppearance,
} from "./effectiveAppearanceValues";

function validateInput(input: AppearanceInput): void {
  if (!isCartesianFamily(input.family) && !isAreaFamily(input.family))
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

export function resolveCommonAppearance(
  input: Omit<AppearanceInput, "family"> & {
    family:
      | AppearanceInput["family"]
      | import("../compatibility/xyAssignments").XyChartType
      | "histogram"
      | "boxPlot"
      | "rangeBar"
      | "rangeArea"
      | "waterfall";
  },
  sourceLayers: RuntimeOptions[],
): ResolvedApplicationAppearance {
  const effective = merge({}, ...sourceLayers);
  const read: ReadAppearance = (path) => at(effective, path);
  const category = input.axisRuntime.axes.find((axis) => axis.id === "category");
  const numeric = input.axisRuntime.axes.find((axis) => axis.id === "number");
  if (!category || !numeric) throw new Error("Missing concrete category/number axis");
  const series = resolveAppearanceSeries(child(read, "series"));
  return {
    ...resolveAppearanceChrome(
      sourceLayers,
      input.theme.palette,
      input.family === "line" ? series.markers.strokeWidth : series.strokeWidth,
    ),
    axes: {
      category: resolveAppearanceAxis(sourceLayers, category),
      number: resolveAppearanceAxis(sourceLayers, numeric),
    },
    series,
  };
}

export const resolveApplicationAppearance: ResolveApplicationAppearance = (input) => {
  try {
    validateInput(input);
    const sourceLayers = appearanceLayers(input);
    const resolved = resolveCommonAppearance(input, sourceLayers);
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
