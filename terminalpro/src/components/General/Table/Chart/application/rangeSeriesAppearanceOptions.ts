import merge from "lodash.merge";
import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import { composeAppearanceOptions } from "./appearanceComposition";
import { number, object } from "./effectiveAppearanceValues";
import type { RangeSeriesAppearanceInput } from "./rangeSeriesAppearance";

export class RangeAppearanceUnsupported extends Error {}

function copyOptions(value: unknown): RuntimeOptions {
  const result = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: "range-appearance",
    previous: {
      stateAddress: "range-appearance",
      chartType: "range-appearance",
      model: {},
      options: value,
    },
  });
  if (!result.valid) throw Error(result.error);
  return result.value.options;
}

/** Original caller fallback filters generated input only; saved overrides stay intact. */
export function buildRangeGeneratedSeries(
  callerSeries: RuntimeOptions,
): ValidationResult<RuntimeOptions> {
  try {
    const result = copyOptions(callerSeries);
    const label = object(result.label);
    delete result.marker;
    delete result.connectMissingData;
    delete result.calloutLabel;
    result.label = merge({}, { enabled: false }, label);
    return { valid: true, value: result };
  } catch {
    return { valid: false, error: "Invalid Range generated series options" };
  }
}

function seriesBranch(options: RuntimeOptions, key: string): RuntimeOptions {
  return object(object(options[key]).series);
}

function mergeSeriesLayers(...layers: RuntimeOptions[]): RuntimeOptions {
  const result: RuntimeOptions = Object.create(null);
  for (const layer of layers)
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      const previous = result[key];
      // AG theme defaults recurse through objects; arrays replace the lower value.
      result[key] =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? mergeSeriesLayers(
              previous !== null &&
                typeof previous === "object" &&
                !Array.isArray(previous)
                ? previous
                : {},
              value,
            )
          : value;
    }
  return result;
}

function defaults(input: RangeSeriesAppearanceInput): RuntimeOptions {
  const bar = input.family === "rangeBar";
  return {
    fillOpacity: bar ? 1 : 0.7,
    strokeWidth: bar ? 0 : 1,
    strokeOpacity: 1,
    lineDash: [0],
    lineDashOffset: 0,
    visible: true,
    ...(bar ? { direction: "vertical" } : {}),
    label: {
      enabled: false,
      placement: bar ? "inside" : "outside",
      spacing: 0,
      // Integrated overrides do not trigger direct-user spacing's zero padding.
      padding: bar ? 6 : 10,
      fontFamily: "Verdana, sans-serif",
      fontSize: 12,
      fontWeight: 400,
      color: bar
        ? input.theme.colors.chartBackgroundColor
        : input.theme.colors.textColor,
    },
    marker: {
      enabled: false,
      shape: "circle",
      size: 6,
      strokeWidth: 2,
      fillOpacity: 1,
      strokeOpacity: 1,
    },
    shadow: {
      enabled: false,
      color: "rgba(0, 0, 0, 0.5)",
      blur: 5,
      xOffset: 0,
      yOffset: 0,
    },
    interpolation: { type: "linear" },
    connectMissingData: false,
  };
}

function inspectLabel(series: RuntimeOptions) {
  const label = object(series.label);
  if (label.padding !== null && typeof label.padding === "object")
    throw new RangeAppearanceUnsupported("Range label side padding is not represented");
  for (const key of [
    "fill",
    "fillOpacity",
    "stroke",
    "strokeWidth",
    "strokeOpacity",
    "lineDash",
    "lineDashOffset",
    "border",
    "borderRadius",
    "cornerRadius",
  ])
    if (label[key] !== undefined)
      throw new RangeAppearanceUnsupported(`Range label.${key} is not represented`);
  const placement = label.placement;
  if (
    typeof placement === "string" &&
    placement !== "inside" &&
    placement !== "outside"
  )
    throw new RangeAppearanceUnsupported("Range label placement is not represented");
}

function inspectBar(series: RuntimeOptions) {
  if (series.cornerRadius !== undefined && series.cornerRadius !== 0)
    throw new RangeAppearanceUnsupported("Range Bar cornerRadius is not represented");
  const shadow = object(series.shadow);
  const expected: RuntimeOptions = {
    enabled: false,
    color: "rgba(0, 0, 0, 0.5)",
    blur: 5,
    xOffset: 0,
    yOffset: 0,
  };
  for (const key of Object.keys(shadow))
    if (shadow[key] !== undefined && shadow[key] !== expected[key])
      throw new RangeAppearanceUnsupported(
        `Range Bar shadow.${key} is not represented`,
      );
}

function inspectArea(series: RuntimeOptions) {
  const marker = object(series.marker);
  if (Array.isArray(marker.lineDash))
    for (const value of marker.lineDash) number(value);
  if (
    marker.lineDash !== undefined &&
    (!Array.isArray(marker.lineDash) || marker.lineDash.some((value) => value !== 0))
  )
    throw new RangeAppearanceUnsupported("Range Area marker dash is not represented");
  if (marker.lineDashOffset !== undefined && marker.lineDashOffset !== 0)
    throw new RangeAppearanceUnsupported(
      "Range Area marker dash offset is not represented",
    );
  if (series.direction !== undefined && series.direction !== "vertical")
    throw new RangeAppearanceUnsupported("Range Area direction is not represented");
}

export function prepareRangeSeriesOptions(source: RangeSeriesAppearanceInput) {
  // Admission copies the entire input before property reads, including theme and IDs.
  const input = copyOptions(source) as unknown as RangeSeriesAppearanceInput;
  if (input.family !== "rangeBar" && input.family !== "rangeArea")
    throw Error("Invalid Range family");
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const theme = object(input.theme);
  const overrides = object(theme.overrides);
  const key = input.family === "rangeBar" ? "range-bar" : "range-area";
  const common = mergeSeriesLayers(
    seriesBranch(overrides, "common"),
    seriesBranch(composed.value, "common"),
  );
  const family = mergeSeriesLayers(
    seriesBranch(overrides, key),
    seriesBranch(composed.value, key),
  );
  // Nested AG theme resolution collapses each scope before family beats common.
  const series = mergeSeriesLayers(defaults(input), common, family);
  inspectLabel(series);
  if (input.family === "rangeBar") inspectBar(series);
  else inspectArea(series);
  return { input, series };
}
