import type {
  EChartsOption,
  GridComponentOption,
  LegendComponentOption,
} from "echarts";
import { resolveRangeAppearance } from "../application/rangeAppearance";
import { RangeAxisUnsupported } from "../application/rangeAxisAppearance";
import { resolveRangeSeriesAppearance } from "../application/rangeSeriesAppearance";
import type { ChartDisplayValue } from "../application/types";
import {
  rangeCategoryModelOverride,
  resolveRangeCategoryKind,
} from "../compatibility/rangeCategoryProvenance";
import { applicationLayout } from "./cartesianLayout";
import { rangeApplicationAxes } from "./rangeApplicationAxes";
import type {
  RangeApplicationInput,
  RangeApplicationResult,
} from "./rangeApplicationTypes";
import { translateRangeArea } from "./rangeArea";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import { rangeAxisLayout } from "./rangeAxisLayout";
import { translateRangeBar } from "./rangeBar";
import { copyRangeData, rangeDisplayText } from "./rangeBarAdmission";
import { projectRangeBar } from "./rangeBarProjection";
import type { RangeBarMappingInput } from "./rangeBarTypes";

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
function hasEveryCallback(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(Object.getOwnPropertyDescriptors(value)).some(
    ([key, descriptor]) => {
      if (!("value" in descriptor)) return false;
      return (
        (key === "every" && typeof descriptor.value === "function") ||
        hasEveryCallback(descriptor.value, seen)
      );
    },
  );
}
function displayFor(input: RangeApplicationInput, ids: readonly string[]) {
  const columns = input.snapshot.columns.filter((c) => ids.includes(c.id));
  const counts =
    columns.length > 0 && columns.every((c) => c.unit === "observation-count");
  return counts
    ? {
        ...input.display,
        numericAxis: (v: ChartDisplayValue) => String(v),
        seriesLabel: (v: ChartDisplayValue) => String(v),
        tooltipNumber: (v: number) => String(v),
      }
    : { ...input.display };
}
function compose(input: RangeApplicationInput): RangeApplicationResult {
  if (hasEveryCallback(input))
    throw new RangeAxisUnsupported(
      "Range interval.every callbacks are outside saved JSON options",
    );
  if (input.family !== "rangeBar" && input.family !== "rangeArea")
    throw Error("Invalid Range family");
  if (
    ![input.viewport.width, input.viewport.height].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    throw Error("Invalid Range viewport");
  const snapshot = copyRangeData(input.snapshot) as RangeApplicationInput["snapshot"];
  const initial = projectRangeBar(snapshot, input.legendSelection);
  if (initial.status !== "resolved") return initial;
  if (!snapshot.rangeCategory)
    throw new RangeAxisUnsupported(
      "Range application requires category capture provenance",
    );
  const kind = resolveRangeCategoryKind(
    snapshot.rangeCategory,
    rangeCategoryModelOverride(input.baseline.model),
  );
  if (!kind.valid) return { status: "invalid", diagnostics: [kind.diagnostic] };
  const ids = initial.projection.fields.map((f) => f.descriptor.id);
  const series = resolveRangeSeriesAppearance({
    family: input.family,
    baseline: input.baseline,
    generated: input.generated,
    theme: input.theme,
    seriesIds: ids,
  });
  if (series.status !== "resolved") return series;
  const horizontal = series.family === "rangeBar" && series.direction === "horizontal";
  const appearance = resolveRangeAppearance(input, ids, kind.kind, horizontal);
  const selection = Object.fromEntries(
    initial.projection.fields.map((f) => [
      f.descriptor.id,
      series.configuredVisible && f.enabled,
    ]),
  );
  const projected = projectRangeBar(snapshot, selection);
  if (projected.status !== "resolved") return projected;
  const effective = { ...input, snapshot, display: displayFor(input, ids) };
  const columns = projected.projection.fields.map((f) => f.descriptor);
  const chrome = applicationLayout(
    appearance.application,
    columns,
    effective.display,
    input.family,
    input.viewport,
  );
  const layout = rangeAxisLayout(
    {
      input: effective,
      appearance,
      projection: projected.projection,
      kind: kind.kind,
      horizontal,
    },
    chrome.grid as { left: number; right: number; top: number; bottom: number },
  );
  return render(effective, series, appearance, selection, chrome, layout, horizontal);
}
function render(
  input: RangeApplicationInput,
  series: Exclude<
    ReturnType<typeof resolveRangeSeriesAppearance>,
    { status: "invalid" | "unsupported" }
  >,
  appearance: ReturnType<typeof resolveRangeAppearance>,
  selection: Record<string, boolean>,
  chrome: EChartsOption,
  layout: ReturnType<typeof rangeAxisLayout>,
  horizontal: boolean,
): RangeApplicationResult {
  const style = {
    categoryAxis: {
      ...appearance.application.axes.category,
      labels: {
        ...appearance.application.axes.category.labels,
        rotation: layout.category.rotation,
      },
    },
    numberAxis: {
      ...appearance.application.axes.number,
      labels: {
        ...appearance.application.axes.number.labels,
        rotation: layout.numeric.rotation,
      },
    },
    categoryCoordinates: layout.category.coordinates,
    valueScale: layout.numeric.plan.valueScale,
    band: appearance.band,
    fields: series.fields,
    tooltip: appearance.application.tooltip,
  };
  const context = {
    display: input.display,
    viewport: { ...input.viewport },
    plot: layout.plot,
    legendSelection: selection,
  };
  const mapping = freeze(
    series.family === "rangeBar"
      ? ({
          snapshot: input.snapshot,
          style: { ...style, direction: series.direction },
          context,
        } as RangeBarMappingInput)
      : ({
          snapshot: input.snapshot,
          style: {
            ...style,
            band: {
              paddingInner: style.band.paddingInner,
              paddingOuter: style.band.paddingOuter,
            },
          },
          context,
        } as RangeAreaMappingInput),
  );
  const core =
    series.family === "rangeBar"
      ? translateRangeBar(mapping as RangeBarMappingInput)
      : translateRangeArea(mapping as RangeAreaMappingInput);
  if (core.status !== "supported") return core;
  const valueLabels = layout.numeric.plan.rawTicks.map((v) =>
    rangeDisplayText(input.display.numericAxis(v)),
  );
  const decorated = rangeApplicationAxes(
    core.options,
    appearance,
    layout,
    horizontal,
    valueLabels,
  );
  const legend = {
    ...(chrome.legend as LegendComponentOption),
    selected: { ...selection },
  };
  return {
    status: "supported",
    options: {
      ...chrome,
      ...decorated,
      grid: { ...(core.options.grid as GridComponentOption), outerBoundsMode: "none" },
      legend,
    },
    projection: core.projection,
    appearance: appearance.application,
    axisRuntime: appearance.axisRuntime,
    category: layout.category.plan,
    valueAxis: layout.numeric.plan,
    plot: layout.plot,
    mapping,
  };
}
export function composeRangeApplication(
  input: RangeApplicationInput,
): RangeApplicationResult {
  try {
    return compose(input);
  } catch (error) {
    const status = error instanceof RangeAxisUnsupported ? "unsupported" : "invalid";
    return {
      status,
      diagnostics: [
        {
          code: `range-application-${status}`,
          path: [],
          message:
            error instanceof Error
              ? error.message
              : "Range application could not be composed",
        },
      ],
    };
  }
}
