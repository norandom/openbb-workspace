import type { EChartsOption, LegendComponentOption } from "echarts";
import type {
  WaterfallRenderInput,
  WaterfallRenderResult,
  WaterfallSign,
} from "../application/waterfallTypes";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import {
  projectWaterfallTotals,
  type WaterfallPoint,
} from "../compatibility/waterfallTotals";
import {
  contextDiagnostics,
  sourceDiagnostics,
  unitDiagnostics,
} from "./cartesianAdmission";
import { applicationAxes, niceNumberExtent } from "./cartesianAxes";
import { cartesianGrid } from "./cartesianGrid";
import { applicationLayout } from "./cartesianLayout";
import { waterfallAxisLabels } from "./waterfallAxisLabels";
import {
  cropWaterfall,
  waterfallCategoryWindow,
  waterfallContinuous,
} from "./waterfallCategory";
import { waterfallPointer } from "./waterfallInteraction";
import { retainWaterfallMetadata, waterfallMetadata } from "./waterfallMetadata";
import {
  type WaterfallWindow,
  waterfallNavigator,
  waterfallPlot,
  waterfallWindow,
} from "./waterfallNavigator";
import { type WaterfallGeometry, waterfallSeries } from "./waterfallSeries";

function immutableCopy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const copied = Array.isArray(value)
    ? value.map(immutableCopy)
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, immutableCopy(item)]),
      );
  return Object.freeze(copied) as T;
}

function signs(points: readonly WaterfallPoint[]): WaterfallSign[] {
  // AG 12.1.1 validates both sign domains with >= 0; retain its empty negative-only legend.
  if (!points.some((p) => p.delta !== null && p.delta >= 0)) return [];
  return ["positive", "negative"];
}
function legendColumns(
  input: WaterfallRenderInput,
  points: readonly WaterfallPoint[],
): SnapshotColumn[] {
  return signs(points).map((sign) => ({
    id: sign,
    label: input.appearance.series.item[sign].name,
    role: "number",
  }));
}
function cumulativeExtent(
  input: WaterfallRenderInput,
  points: readonly WaterfallPoint[],
  full: WaterfallWindow,
  window: WaterfallWindow,
  numeric: WaterfallWindow,
): WaterfallWindow {
  if (numeric[0] !== 0 || numeric[1] !== 1)
    return [
      full[0] + numeric[0] * (full[1] - full[0]),
      full[0] + numeric[1] * (full[1] - full[0]),
    ];
  const policy = input.navigation.autoScale;
  if (
    !policy.enabled ||
    points.length < policy.minVisibleItems ||
    (window[0] === 0 && window[1] === 1)
  )
    return full;
  const endpoints = points
    .filter((p) => p.kind !== "missing")
    .flatMap((p) => [p.start, p.end]);
  if (!endpoints.length) return full;
  const min = endpoints.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  const max = endpoints.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
  const padding = (max - min || Math.abs(max) || 1) * policy.padding;
  return [min - padding, max + padding];
}
function compose(
  input: WaterfallRenderInput,
  points: readonly WaterfallPoint[],
  full: readonly WaterfallPoint[],
  extent: WaterfallWindow,
  geometry?: WaterfallGeometry,
  window: WaterfallWindow = [0, 1],
): EChartsOption {
  const a = input.appearance.application;
  const columns = legendColumns(input, full);
  const layout = applicationLayout(
    a,
    columns,
    input.context.display,
    "waterfall",
    input.context.viewport,
  );
  const snapshot = {
    ...input.snapshot,
    rows: points.map((p) => input.snapshot.rows[p.index]),
  };
  const horizontal = input.appearance.series.direction === "horizontal";
  const numericExtent = niceNumberExtent(
    extent[0],
    extent[1],
    input.context.viewport[horizontal ? "width" : "height"],
  );
  const legends = layout.legend as LegendComponentOption;
  const legend = {
    ...legends,
    selectedMode: false as const,
    data: columns.map((c) => ({
      name: c.id,
      icon: "rect",
      itemStyle: {
        color: input.appearance.series.item[c.id as WaterfallSign].fill,
        borderColor: input.appearance.series.item[c.id as WaterfallSign].stroke,
      },
    })),
  };
  const axes = applicationAxes(
    a.axes.category,
    a.axes.number,
    snapshot,
    input.context.display,
    input.context.viewport,
    "waterfall",
    numericExtent,
  );
  if (waterfallContinuous(input)) {
    const categoryExtent = waterfallCategoryWindow(input, window);
    const extent = { min: categoryExtent[0], max: categoryExtent[1] };
    if (horizontal) axes.yAxis = { ...axes.yAxis, ...extent };
    else axes.xAxis = { ...axes.xAxis, ...extent };
  }
  return {
    ...cartesianGrid(a),
    ...layout,
    legend,
    ...axes,
    animation: false,
    tooltip: { show: false, triggerOn: "none" },
    series: [
      waterfallSeries(input, points, geometry),
      ...columns.map((c) => ({
        id: `openbb-waterfall-legend-${c.id}`,
        name: c.id,
        type: "custom" as const,
        data: [],
        renderItem: () => undefined,
        itemStyle: { color: input.appearance.series.item[c.id as WaterfallSign].fill },
      })),
    ],
  };
}
function project(
  input: WaterfallRenderInput,
  full: readonly WaterfallPoint[],
  extent: WaterfallWindow,
): WaterfallRenderResult {
  const overview = waterfallAxisLabels(
    compose(input, full, full, extent),
    input,
    input.snapshot,
  );
  const options = (
    window: WaterfallWindow,
    numeric: WaterfallWindow,
  ): EChartsOption => {
    const points = cropWaterfall(input, full, window);
    const geometry: WaterfallGeometry = { candidates: [] };
    const visibleExtent = cumulativeExtent(input, points, extent, window, numeric);
    const main = compose(input, points, full, visibleExtent, geometry, window);
    const result = waterfallAxisLabels(
      waterfallNavigator(input, main, overview, extent, window, numeric),
      input,
      { rows: points.map((point) => input.snapshot.rows[point.index]) },
    );
    geometry.plot = waterfallPlot(result, input);
    return retainWaterfallMetadata(result, geometry);
  };
  return {
    status: "supported",
    options: options([0, 1], [0, 1]),
    projectNavigationWindow: (_projected, current) =>
      options(waterfallWindow(current), waterfallWindow(current, true)),
    projectPointer: (applied) => {
      const geometry = waterfallMetadata(applied);
      return geometry ? waterfallPointer(input, geometry) : undefined;
    },
  };
}
function admitted(input: WaterfallRenderInput): WaterfallRenderResult {
  const fields = input.snapshot.columns.filter(
    (c) => c.role === "number" && input.snapshot.selectedColumnIds.includes(c.id),
  );
  const empty = fields.length === 0 && input.fieldId === undefined;
  if (!empty && (fields.length !== 1 || fields[0].id !== input.fieldId))
    return {
      status: "unsupported",
      diagnostics: [
        {
          code: "waterfall-field",
          path: ["fieldId"],
          message: "Waterfall requires its sole effective numerical field.",
        },
      ],
    };
  const diagnostics = [
    ...contextDiagnostics(input.context),
    ...sourceDiagnostics(input.snapshot, input.context),
    ...unitDiagnostics(
      fields,
      input.snapshot.columns,
      input.context.observations.kind === "raw-observations",
    ),
  ];
  if (diagnostics.length)
    return {
      status: diagnostics.some((d) => d.code === "unsupported-source")
        ? "unsupported"
        : "invalid",
      diagnostics,
    };
  const a = input.appearance.application.axes;
  const horizontal = input.appearance.series.direction === "horizontal";
  if (
    !["category", "number", "time"].includes(a.category.fields.type) ||
    a.number.fields.type !== "number" ||
    horizontal !== ["left", "right"].includes(a.category.fields.position) ||
    horizontal !== ["top", "bottom"].includes(a.number.fields.position)
  )
    return {
      status: "unsupported",
      diagnostics: [
        {
          code: "waterfall-axes",
          path: ["appearance", "application", "axes"],
          message:
            "Waterfall requires supported categories and direction-mapped numerical axes.",
        },
      ],
    };
  if (empty)
    return {
      status: "supported",
      options: {
        ...waterfallAxisLabels(compose(input, [], [], [0, 0]), input, { rows: [] }),
        series: [],
      },
    };
  const fieldId = fields[0].id;
  const totals = projectWaterfallTotals(
    input.snapshot.rows.map((row) => row.values[fieldId]),
  );
  if (totals.status !== "resolved") return totals;
  return project(input, totals.points, totals.extent);
}
export function projectWaterfall(input: WaterfallRenderInput): WaterfallRenderResult {
  try {
    return admitted(immutableCopy(input));
  } catch (error) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "waterfall-render",
          path: [],
          message:
            error instanceof Error ? error.message : "Unable to project Waterfall.",
        },
      ],
    };
  }
}
