import merge from "lodash.merge";
import { composeAppearanceOptions } from "../application/appearanceComposition";
import { bool, number, object } from "../application/effectiveAppearanceValues";
import { prepareRangeSeriesOptions } from "../application/rangeSeriesAppearanceOptions";
import type { RangeApplicationInput } from "./rangeApplicationTypes";
import type { RangePickRange } from "./rangePointerTypes";

function pickRange(value: unknown, fallback: RangePickRange): RangePickRange {
  if (value === undefined) return fallback;
  if (value === "exact" || value === "nearest") return value;
  return number(value, 0);
}
export function rangeNavigationPolicy(input: RangeApplicationInput) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const key = input.family === "rangeBar" ? "range-bar" : "range-area";
  const effective = merge(
    {},
    object(input.theme.overrides.common),
    object(composed.value.common),
    object(input.theme.overrides[key]),
    object(composed.value[key]),
  );
  const { series } = prepareRangeSeriesOptions({
    family: input.family,
    baseline: input.baseline,
    generated: input.generated,
    theme: input.theme,
    seriesIds: [],
  });
  const tooltip = object(effective.tooltip);
  const zoom = object(effective.zoom);
  const auto = object(zoom.autoScaling);
  const zoomEnabled = zoom.enabled === undefined ? false : bool(zoom.enabled);
  const axes = zoom.axes ?? "x";
  if (!["x", "y", "xy"].includes(String(axes))) throw Error("Invalid Range zoom axes.");
  const horizontal = series.direction === "horizontal";
  const autoEnabled = auto.enabled === undefined ? axes === "x" : bool(auto.enabled);
  return Object.freeze({
    pagination: tooltip.pagination === undefined ? false : bool(tooltip.pagination),
    showInMiniChart:
      series.showInMiniChart === undefined ? true : bool(series.showInMiniChart),
    seriesTooltipEnabled:
      object(series.tooltip).enabled === undefined
        ? true
        : bool(object(series.tooltip).enabled),
    outsideMinor:
      series.pickOutsideVisibleMinorAxis === undefined
        ? false
        : bool(series.pickOutsideVisibleMinorAxis),
    hoverRange: pickRange(object(series.tooltip).range ?? tooltip.range, "nearest"),
    clickRange: pickRange(
      series.nodeClickRange,
      input.family === "rangeArea" ? "nearest" : "exact",
    ),
    zoom: Object.freeze({
      enabled: zoomEnabled,
      scaleX: axes === "xy" || axes === (horizontal ? "y" : "x"),
      scaleY: axes === "xy" || axes === (horizontal ? "x" : "y"),
      scrolling: zoom.enableScrolling === undefined ? true : bool(zoom.enableScrolling),
      panning: zoom.enablePanning === undefined ? true : bool(zoom.enablePanning),
    }),
    autoScale: Object.freeze({
      enabled: zoomEnabled && autoEnabled,
      padding: auto.padding === undefined ? 0.05 : number(auto.padding, 0, 1),
      minVisibleItems:
        zoom.minVisibleItems === undefined ? 2 : number(zoom.minVisibleItems, 0),
    }),
  });
}
