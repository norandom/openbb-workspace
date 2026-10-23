import type { EChartsOption, GridComponentOption } from "echarts";
import type { RangeResolvedAxis } from "../application/rangeAxisAppearance";
import type { RangeApplicationInput, Window } from "./rangeApplicationTypes";
import { rangeDisplayText } from "./rangeBarAdmission";
import { cartesianNavigator } from "./cartesianNavigator";
import { rangedNavigatorMask } from "./cartesianNavigatorMask";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import type { RangeComposed, RangeLiveSettings } from "./rangeLiveTypes";
import { rangeAxisFootprint } from "./rangeLabelLayout";
import { rangeNavigatorOverview } from "./rangeNavigatorOverview";
import { rangeNavigationPolicy } from "./rangeNavigationPolicy";

export function rangeNavigatorInset(
  input: RangeApplicationInput,
  settings: RangeLiveSettings,
): number {
  if (!settings.navigatorEnabled && !settings.miniChartEnabled) return 0;
  return settings.miniChartEnabled
    ? 50 + Math.ceil((input.theme.navigatorFont?.fontSize ?? 10) * 1.2) + 5
    : 28;
}
function bottomAxisFootprint(composed: RangeComposed) {
  const style = composed.mapping.style;
  // Range composition retains these resolved label flags before exposing the
  // shared application appearance type; mapping axes retain final rotations.
  const category = composed.appearance.axes.category as RangeResolvedAxis;
  const numeric = composed.appearance.axes.number as RangeResolvedAxis;
  const display = composed.mapping.context.display;
  return (
    (category.fields.position === "bottom"
      ? rangeAxisFootprint(
          category,
          composed.category.ticks.map((tick) => tick.label),
          true,
          style.categoryAxis.labels.rotation ?? 0,
        )
      : 0) +
    (numeric.fields.position === "bottom"
      ? rangeAxisFootprint(
          numeric,
          composed.valueAxis.rawTicks.map((value) =>
            rangeDisplayText(display.numericAxis(value)),
          ),
          true,
          style.numberAxis.labels.rotation ?? 0,
        )
      : 0)
  );
}
function geometry(
  input: RangeApplicationInput,
  composed: RangeComposed,
  settings: RangeLiveSettings,
): GridComponentOption {
  const p = composed.plot;
  const label = settings.miniChartEnabled
    ? Math.ceil((input.theme.navigatorFont?.fontSize ?? 10) * 1.2) + 5
    : 0;
  const style = composed.mapping.style;
  const horizontal = "direction" in style && style.direction === "horizontal";
  const miniAxis = horizontal ? style.numberAxis : style.categoryAxis;
  const labelTop = miniAxis.fields.position === "top" ? label : 0;
  // The main plot already excludes navigation and measured axes. Place the
  // navigator after the actual bottom axis, without shrinking that plot again.
  const top = p.top + p.height + bottomAxisFootprint(composed) + 10 + labelTop;
  const height = settings.miniChartEnabled ? 40 : 18;
  return {
    left: p.left,
    right: Math.max(0, input.viewport.width - p.left - p.width),
    bottom: input.viewport.height - top - height,
    height,
    containLabel: false,
    outerBoundsMode: "none",
  };
}
function carrier(composed: RangeComposed, axis: "x" | "y") {
  const horizontal =
    "direction" in composed.mapping.style &&
    composed.mapping.style.direction === "horizontal";
  const valueAxis = horizontal === (axis === "x");
  const full = valueAxis ? composed.valueAxis.fullExtent : composed.category.fullExtent;
  const extent = full.length && full[0] !== full[1] ? full : [0, 1];
  return {
    id: axis === "x" ? "openbb-range-carrier" : "openbb-range-y-carrier",
    type: "value" as const,
    gridIndex: 0,
    min: extent[0],
    max: extent[1],
    show: false,
    silent: true,
    scale: true,
    axisPointer: { show: false },
    inverse:
      axis === "x"
        ? valueAxis
          ? composed.valueAxis.valueScale?.reverse
          : composed.category.reverse
        : valueAxis
          ? !composed.valueAxis.valueScale?.reverse
          : !composed.category.reverse,
  };
}
export function rangeNavigator(
  input: RangeApplicationInput,
  composed: RangeComposed,
  full: RangeComposed,
  fullMini: RangeComposed,
  settings: RangeLiveSettings,
  window: Window,
  yWindow: Window,
  showMini: boolean,
): EChartsOption {
  const policy = rangeNavigationPolicy(input);
  if (!settings.navigatorEnabled && !settings.miniChartEnabled && !policy.zoom.enabled)
    return composed.options;
  const nav = geometry(input, composed, settings);
  // Hidden navigators reserve no viewport space. Only a visible miniature needs
  // translated overview geometry; zoom carriers still use the full main domain.
  const overview = settings.miniChartEnabled
    ? rangeNavigatorOverview(fullMini, nav, input.viewport)
    : composed.options;
  const mainGrid = composed.options.grid;
  const synthetic = {
    ...composed.options,
    grid: {
      ...(mainGrid as GridComponentOption),
      left: nav.left,
      right: nav.right,
      bottom: Number(nav.bottom),
    },
  };
  const result = cartesianNavigator(
    synthetic,
    settings.navigatorEnabled,
    settings.miniChartEnabled,
    input.theme,
    input.viewport,
    showMini ? overview : { ...overview, series: [] },
    {
      miniHeight: Number(nav.height),
      left: Number(nav.left),
      right: Number(nav.right),
      overviewOuterBoundsMode: "none",
    },
  );
  const xs = navigatorAxes(result.xAxis);
  const ys = navigatorAxes(result.yAxis);
  const carrierIndex = xs.length;
  const slider = navigatorAxes(result.dataZoom)[0] ?? {
    id: "openbb-navigator",
    type: "slider" as const,
    show: false,
  };
  const range = { start: window[0] * 100, end: window[1] * 100 };
  return {
    ...result,
    grid: settings.miniChartEnabled ? [navigatorAxes(mainGrid)[0], nav] : mainGrid,
    xAxis: [...xs, carrier(full, "x")],
    yAxis: [...ys, carrier(full, "y")],
    graphic: rangedNavigatorMask(result.graphic, range.start, range.end),
    dataZoom: [
      {
        ...slider,
        show: settings.navigatorEnabled || settings.miniChartEnabled,
        left: nav.left,
        right: nav.right,
        bottom: nav.bottom,
        height: nav.height,
        xAxisIndex: [carrierIndex],
        filterMode: "none",
        ...range,
      },
      {
        id: "openbb-range-x-inside",
        type: "inside",
        xAxisIndex: [carrierIndex],
        filterMode: "none",
        minSpan: 0.1,
        ...range,
        zoomOnMouseWheel:
          policy.zoom.enabled && policy.zoom.scrolling && policy.zoom.scaleX,
        moveOnMouseMove: policy.zoom.enabled && policy.zoom.panning,
        moveOnMouseWheel: false,
      },
      {
        id: "openbb-range-inside",
        type: "inside",
        yAxisIndex: [ys.length],
        filterMode: "none",
        minSpan: 0.1,
        start: yWindow[0] * 100,
        end: yWindow[1] * 100,
        zoomOnMouseWheel:
          policy.zoom.enabled && policy.zoom.scrolling && policy.zoom.scaleY,
        moveOnMouseMove: policy.zoom.enabled && policy.zoom.panning,
        moveOnMouseWheel: false,
      },
    ],
  };
}
