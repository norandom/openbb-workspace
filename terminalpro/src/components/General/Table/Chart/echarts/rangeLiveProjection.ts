import type { EChartsOption } from "echarts";
import { RangeAxisUnsupported } from "../application/rangeAxisAppearance";
import { copyRangeData } from "./rangeBarAdmission";
import { composeRangeApplication } from "./rangeApplication";
import type { RangeApplicationInput, Window } from "./rangeApplicationTypes";
import {
  rangeLiveMetadata,
  retainRangeMetadata,
  type RangeLiveMetadata,
  type RangeLiveOptions,
} from "./rangeLiveMetadata";
import type {
  RangeComposed,
  RangeLiveResult,
  RangeLiveSettings,
} from "./rangeLiveTypes";
import {
  rangeNavigationAutoscale,
  rangeHorizontalAutoscale,
} from "./rangeNavigationAutoscale";
import { rangeNavigationPolicy } from "./rangeNavigationPolicy";
import { readRangeWindow } from "./rangeNavigationWindow";
import { rangeNavigator, rangeNavigatorInset } from "./rangeNavigator";
import { createRangePointerPlan } from "./rangePointerPlan";

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function required(input: RangeApplicationInput): RangeComposed {
  const result = composeRangeApplication(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result.diagnostics));
  return freeze(result);
}
function options(
  metadata: RangeLiveMetadata,
  settings: RangeLiveSettings,
  window: Window,
  yWindow: Window = [0, 1],
): RangeLiveOptions {
  const policy = rangeNavigationPolicy(metadata.input);
  const result = rangeNavigator(
    metadata.input,
    metadata.composed,
    metadata.full,
    metadata.miniature,
    settings,
    window,
    yWindow,
    policy.showInMiniChart,
  );
  return {
    ...result,
    tooltip: {
      ...(!Array.isArray(result.tooltip) ? result.tooltip : {}),
      show: false,
      triggerOn: "none",
    },
    openbbRange: retainRangeMetadata(metadata),
  };
}
function cropped(metadata: RangeLiveMetadata, window: Window, previousY: Window) {
  const full = metadata.full;
  const horizontal =
    "direction" in full.mapping.style && full.mapping.style.direction === "horizontal";
  const policy = rangeNavigationPolicy(metadata.input);
  const valueDataExtent = rangeNavigationAutoscale(
    metadata.input,
    full,
    window,
    policy,
  );
  const reset = window[0] === 0 && window[1] === 1;
  const fullValue = full.valueAxis.fullExtent;
  const autoValue =
    valueDataExtent?.length && fullValue.length && fullValue[0] !== fullValue[1]
      ? ([
          (valueDataExtent[0] - fullValue[0]) / (fullValue[1] - fullValue[0]),
          (valueDataExtent[1] - fullValue[0]) / (fullValue[1] - fullValue[0]),
        ] as const)
      : undefined;
  const autoCategory = horizontal
    ? rangeHorizontalAutoscale(metadata.input, full, window, policy)
    : undefined;
  const yWindow = policy.autoScale.enabled
    ? reset
      ? ([0, 1] as const)
      : ((horizontal ? autoCategory : autoValue) ?? previousY)
    : previousY;
  const input = {
    ...metadata.input,
    categoryFullExtent: full.category.fullExtent,
    visibleRange: horizontal ? yWindow : window,
    valueVisibleRange: horizontal ? window : yWindow,
    valueFullExtent: full.valueAxis.fullExtent,
    ...(valueDataExtent === undefined ? {} : { valueDataExtent }),
  };
  return { metadata: { ...metadata, composed: required(input) }, yWindow };
}
function callbacks(settings: RangeLiveSettings, initial: RangeLiveMetadata) {
  const selectionKey = (selected: Readonly<Record<string, boolean>> | undefined) =>
    JSON.stringify(
      initial.full.projection.fields.map((f) => selected?.[f.descriptor.id] ?? true),
    );
  const fullPlans = new Map([[selectionKey(initial.input.legendSelection), initial]]);
  return {
    projectLegendSelection: (selected: Readonly<Record<string, boolean>>) => {
      const key = selectionKey(selected);
      const cached = fullPlans.get(key);
      if (cached) return options(cached, settings, [0, 1]);
      const input = freeze({
        ...initial.input,
        legendSelection: { ...selected },
        categoryFullExtent: initial.full.category.fullExtent,
        valueFullExtent: undefined,
        valueDataExtent: undefined,
        visibleRange: [0, 1] as const,
        valueVisibleRange: [0, 1] as const,
      });
      const full = required(input);
      const metadata = Object.freeze({ ...initial, input, full, composed: full });
      fullPlans.set(key, metadata);
      return options(metadata, settings, [0, 1]);
    },
    projectNavigationWindow: (projected: EChartsOption, current: EChartsOption) => {
      const metadata = rangeLiveMetadata(projected);
      const window = readRangeWindow(current);
      const crop = cropped(metadata, window, readRangeWindow(current, "y"));
      return options(crop.metadata, settings, window, crop.yWindow);
    },
    projectPointer: (applied: EChartsOption) => {
      const metadata = rangeLiveMetadata(applied);
      return createRangePointerPlan(
        metadata.composed,
        rangeNavigationPolicy(metadata.input),
        metadata.input.theme,
      );
    },
  };
}
export function projectRangeLiveApplication(
  source: RangeApplicationInput,
  settings: RangeLiveSettings,
): RangeLiveResult {
  try {
    const copied = copyRangeData(source) as RangeApplicationInput;
    const input = freeze({
      ...copied,
      plotBottomInset:
        (copied.plotBottomInset ?? 0) + rangeNavigatorInset(copied, settings),
    });
    const result = composeRangeApplication({
      ...input,
      visibleRange: [0, 1],
      valueVisibleRange: [0, 1],
    });
    if (result.status !== "supported") return result;
    const full = freeze(result);
    const miniature = input.legendSelection
      ? required({ ...input, legendSelection: undefined })
      : full;
    const metadata = Object.freeze({
      family: input.family,
      input,
      full,
      composed: full,
      miniature,
    });
    return {
      status: "supported",
      composed: full,
      options: options(metadata, settings, [0, 1]),
      ...callbacks(settings, metadata),
    };
  } catch (error) {
    const status = error instanceof RangeAxisUnsupported ? "unsupported" : "invalid";
    return {
      status,
      diagnostics: [
        {
          code: `range-live-${status}`,
          path: [],
          message:
            error instanceof Error ? error.message : "Unable to compose live Range.",
        },
      ],
    };
  }
}
