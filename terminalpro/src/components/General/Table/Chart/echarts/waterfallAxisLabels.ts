import type {
  EChartsOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import type { RangeResolvedAxis } from "../application/rangeAxisAppearance";
import type { ChartDisplayPolicy } from "../application/types";
import type {
  WaterfallDirection,
  WaterfallRenderInput,
} from "../application/waterfallTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { rangeAxisFootprint, rangeLabelsFit, rangeWrapLabel } from "./rangeLabelLayout";

export interface WaterfallCategoryLabelInput {
  readonly axis: RangeResolvedAxis;
  readonly snapshot: Pick<ChartSnapshot, "rows">;
  readonly display: Pick<ChartDisplayPolicy, "category">;
  /** Actual category-axis plot length after ordinary padding and opposite-axis layout. */
  readonly plotSpan: number;
  readonly crossSize: number;
  readonly direction: WaterfallDirection;
}
export interface WaterfallCategoryLabelPlan {
  readonly labels: readonly string[];
  /** ECharts degrees: saved manual angles have the opposite sign. */
  readonly rotation: number;
}

export function planWaterfallCategoryLabels(
  input: WaterfallCategoryLabelInput,
): WaterfallCategoryLabelPlan {
  const { axis, snapshot, display, plotSpan, crossSize, direction } = input;
  if (![plotSpan, crossSize].every((size) => Number.isFinite(size) && size >= 0))
    throw Error("Waterfall category labels require finite nonnegative plot sizes.");
  const horizontalAxis = direction === "vertical";
  const category = axis.fields.type === "category";
  const band = (plotSpan / Math.max(1, snapshot.rows.length)) * 0.7;
  const sizeLimit = crossSize * 0.3;
  const labels = snapshot.rows.map((row) => {
    const text = String(display.category(row.category));
    return category
      ? rangeWrapLabel(
          text,
          horizontalAxis ? band : sizeLimit,
          horizontalAxis ? sizeLimit : band,
          axis.labels,
        )
      : text;
  });
  let rotation = -(axis.labels.rotation ?? 0);
  if (
    category &&
    axis.labels.enabled &&
    axis.labels.avoidCollisions &&
    axis.labels.autoRotate &&
    axis.labels.rotation === undefined &&
    !rangeLabelsFit(
      labels.map((label, coordinate) => ({ label, coordinate })),
      labels.length ? [-0.5, labels.length - 0.5] : [],
      plotSpan,
      axis,
      horizontalAxis,
      0,
    )
  )
    rotation = 25;
  return { labels, rotation: rotation === 0 ? 0 : rotation };
}

function numericLabels(
  axis: XAXisComponentOption | YAXisComponentOption,
  display: ChartDisplayPolicy,
) {
  if (axis.type !== "value")
    throw Error("Waterfall financial labels require a numeric axis.");
  const min = typeof axis.min === "number" ? axis.min : 0;
  const max = typeof axis.max === "number" ? axis.max : 1;
  const step = typeof axis.interval === "number" ? axis.interval : max - min || 1;
  const count = Math.floor((max - min) / step + 1e-10);
  if (!Number.isFinite(count) || count < 0 || count > 10000)
    throw Error("Unsupported Waterfall numeric label extent.");
  return Array.from({ length: count + 1 }, (_, index) =>
    String(display.numericAxis(min + index * step)),
  );
}

export function waterfallAxisLabels(
  options: EChartsOption,
  input: WaterfallRenderInput,
  snapshot: Pick<ChartSnapshot, "rows">,
): EChartsOption {
  const xs = navigatorAxes(options.xAxis);
  const ys = navigatorAxes(options.yAxis);
  const grid = navigatorAxes(options.grid)[0];
  const horizontal = input.appearance.series.direction === "horizontal";
  const category = horizontal ? ys[0] : xs[0];
  const number = horizontal ? xs[0] : ys[0];
  if (!grid || !category || !number)
    throw Error("Missing Waterfall label layout axes.");
  const axes = input.appearance.application.axes;
  const numericSpace = rangeAxisFootprint(
    axes.number,
    numericLabels(number, input.context.display),
    horizontal,
    axes.number.labels.rotation ?? 0,
  );
  const viewport = input.context.viewport;
  const plotSpan = Math.max(
    0,
    horizontal
      ? viewport.height - Number(grid.top) - Number(grid.bottom) - numericSpace
      : viewport.width - Number(grid.left) - Number(grid.right) - numericSpace,
  );
  const plan =
    axes.category.fields.type === "category"
      ? planWaterfallCategoryLabels({
          axis: axes.category,
          snapshot,
          display: input.context.display,
          plotSpan,
          crossSize: horizontal ? viewport.width : viewport.height,
          direction: input.appearance.series.direction,
        })
      : undefined;
  const categoryLabel = {
    ...category.axisLabel,
    show: axes.category.labels.enabled,
    ...(plan
      ? {
          rotate: plan.rotation,
          formatter: (value: string | number) => plan.labels[Number(value)] ?? "",
        }
      : {}),
  };
  const numberLabel = { ...number.axisLabel, show: axes.number.labels.enabled };
  return {
    ...options,
    xAxis: xs.map((axis, index) =>
      index === 0
        ? { ...axis, axisLabel: horizontal ? numberLabel : categoryLabel }
        : axis,
    ),
    yAxis: ys.map((axis, index) =>
      index === 0
        ? { ...axis, axisLabel: horizontal ? categoryLabel : numberLabel }
        : axis,
    ),
  };
}
