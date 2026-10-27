import type {
  ChartCoordinateConversion,
  ChartKeyboardRect,
  GroupedBarGeometry,
  GroupedBarKeyboardPlan,
} from "./chartKeyboardTypes";

function validate(geometry: GroupedBarGeometry): void {
  if (
    !Number.isFinite(geometry.barWidth) ||
    geometry.barWidth <= 0 ||
    !Number.isFinite(geometry.barGap) ||
    geometry.barGap < 0
  )
    throw new Error(
      "Grouped-bar geometry requires a positive width and nonnegative gap",
    );
}

/** Pin width constraints so native layout and keyboard offsets use the same contract. */
export function groupedBarSeriesGeometry(geometry: GroupedBarGeometry) {
  validate(geometry);
  return {
    barWidth: geometry.barWidth,
    barMinWidth: geometry.barWidth,
    barMaxWidth: geometry.barWidth,
    barGap: `${geometry.barGap * 100}%`,
  };
}

export function groupedBarBounds(
  plan: GroupedBarKeyboardPlan,
  selected: Readonly<Record<string, boolean>>,
  seriesId: string,
  index: number,
  convert: ChartCoordinateConversion,
): ChartKeyboardRect | undefined {
  validate(plan.geometry);
  const visible = plan.series.filter(
    (series) => selected[series.name] !== false,
  );
  const ordinal = visible.findIndex((series) => series.id === seriesId);
  const value = visible[ordinal]?.values[index];
  if (
    ordinal < 0 ||
    index < 0 ||
    index >= plan.categories.length ||
    !Number.isFinite(value)
  )
    return;
  const x = convert(
    { gridId: plan.gridId, xAxisId: plan.xAxisId },
    plan.categories[index],
  );
  const baseline = convert({ gridId: plan.gridId, yAxisId: plan.yAxisId }, 0);
  const y = convert({ gridId: plan.gridId, yAxisId: plan.yAxisId }, value);
  if (![x, y, baseline].every(Number.isFinite))
    throw new Error("Chart keyboard coordinates are unavailable");
  const { barWidth: width, barGap: gap } = plan.geometry;
  const groupWidth =
    visible.length * width + (visible.length - 1) * width * gap;
  return {
    x: x - groupWidth / 2 + ordinal * width * (1 + gap),
    y: Math.min(y, baseline),
    width,
    height: Math.abs(baseline - y),
  };
}
