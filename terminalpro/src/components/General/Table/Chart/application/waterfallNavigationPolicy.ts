import merge from "lodash.merge";
import { bool, number, object } from "./effectiveAppearanceValues";
import { prepareWaterfallAppearance } from "./waterfallAppearanceOptions";
import type {
  WaterfallAppearanceInput,
  WaterfallNavigationPolicy,
} from "./waterfallTypes";

function range(value: unknown, fallback: "exact" | "nearest") {
  return value === undefined
    ? fallback
    : value === "exact" || value === "nearest"
      ? value
      : number(value, 0);
}

export function waterfallNavigationPolicy(
  input: WaterfallAppearanceInput,
): WaterfallNavigationPolicy {
  const prepared = prepareWaterfallAppearance(input);
  const effective = merge({}, ...prepared.layers);
  const series = prepared.series;
  const tooltip = object(effective.tooltip);
  const zoom = object(effective.zoom);
  const auto = object(zoom.autoScaling);
  const enabled = zoom.enabled === undefined ? false : bool(zoom.enabled);
  const axes = zoom.axes ?? "x";
  if (!["x", "y", "xy"].includes(String(axes)))
    throw Error("Invalid Waterfall zoom axes");
  const horizontal = series.direction === "horizontal";
  return {
    pagination: tooltip.pagination === undefined ? false : bool(tooltip.pagination),
    showInMiniChart:
      series.showInMiniChart === undefined ? true : bool(series.showInMiniChart),
    outsideMinor:
      series.pickOutsideVisibleMinorAxis === undefined
        ? false
        : bool(series.pickOutsideVisibleMinorAxis),
    hoverRange: range(object(series.tooltip).range ?? tooltip.range, "nearest"),
    clickRange: range(series.nodeClickRange, "exact"),
    zoom: {
      enabled,
      scaleX: axes === "xy" || axes === (horizontal ? "y" : "x"),
      scaleY: axes === "xy" || axes === (horizontal ? "x" : "y"),
      scrolling: zoom.enableScrolling === undefined ? true : bool(zoom.enableScrolling),
      panning: zoom.enablePanning === undefined ? true : bool(zoom.enablePanning),
    },
    autoScale: {
      enabled:
        enabled && (auto.enabled === undefined ? axes === "x" : bool(auto.enabled)),
      padding: auto.padding === undefined ? 0.05 : number(auto.padding, 0, 1),
      minVisibleItems:
        zoom.minVisibleItems === undefined ? 2 : number(zoom.minVisibleItems, 0),
    },
  };
}
