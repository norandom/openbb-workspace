import { boxDisplayText } from "./boxPlotAdmission";
import { planBoxCategoryLabels } from "./boxPlotCategoryPlan";
import { boxTickDensity } from "./boxPlotTicks";
import type {
  BoxNavigatorGeometry,
  BoxPlotDomain,
  BoxPlotMappingInput,
  BoxPlotProjection,
  BoxResolvedAxis,
} from "./boxPlotTypes";
import { type BoxValueAxisPlan, planBoxValueAxis } from "./boxPlotValueAxis";
import { measureText } from "./cartesianLayout";

type Grid = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  containLabel?: boolean;
  outerBoundsMode?: "none";
};
function footprint(
  a: BoxResolvedAxis,
  labels: readonly string[],
  horizontal: boolean,
  degrees = a.labels.rotation ?? 0,
): number {
  const rotation = (degrees * Math.PI) / 180;
  const label =
    a.labels.enabled === false || !labels.length
      ? 0
      : Math.max(
          0,
          ...labels.map((value) => {
            const size = measureText(value, a.labels);
            return horizontal
              ? Math.abs(size.height * Math.cos(rotation)) +
                  Math.abs(size.width * Math.sin(rotation))
              : Math.abs(size.width * Math.cos(rotation)) +
                  Math.abs(size.height * Math.sin(rotation));
          }),
        ) + a.labels.padding;
  return label + axisDecoration(a);
}
function axisDecoration(a: BoxResolvedAxis): number {
  return (
    (a.ticks.enabled ? a.ticks.length : 0) +
    (a.title.enabled ? measureText(a.title.text, a.title).height + a.title.spacing : 0)
  );
}
function fits(
  input: BoxPlotMappingInput,
  plan: BoxValueAxisPlan,
  rotationDegrees: number,
): boolean {
  const a = input.style.axes.number.appearance;
  if (
    a.labels.enabled === false ||
    a.labels.avoidCollisions === false ||
    plan.rawTicks.length < 2
  )
    return true;
  const horizontal = input.style.direction === "horizontal";
  const rotation = (rotationDegrees * Math.PI) / 180;
  let end = Number.NEGATIVE_INFINITY;
  return plan.rawTicks.every((value) => {
    const size = measureText(
      boxDisplayText(input.context.display.numericAxis(value)),
      a.labels,
    );
    const extent = horizontal
      ? Math.abs(size.width * Math.cos(rotation)) +
        Math.abs(size.height * Math.sin(rotation))
      : Math.abs(size.height * Math.cos(rotation)) +
        Math.abs(size.width * Math.sin(rotation));
    const domain = plan.visibleExtent;
    const pos =
      domain.length && domain[1] !== domain[0]
        ? ((value - domain[0]) / (domain[1] - domain[0])) * plan.span
        : plan.span / 2;
    const valid = pos - extent / 2 >= end;
    end = pos + extent / 2 + (a.labels.minSpacing ?? (rotation ? 0 : 10));
    return valid;
  });
}
function numericPlan(input: BoxPlotMappingInput, domain: BoxPlotDomain, span: number) {
  const labels = input.style.axes.number.appearance.labels;
  let rotation = labels.rotation ?? 0;
  const density = boxTickDensity(span);
  let plan = planBoxValueAxis(domain, span, density);
  let previous = "";
  for (
    let count = density.tickCount;
    count >= density.minTickCount && count > 0;
    count--
  ) {
    const candidate = planBoxValueAxis(domain, span, {
      ...density,
      tickCount: count,
    });
    const key = JSON.stringify(candidate.rawTicks);
    if (key === previous) continue;
    previous = key;
    plan = candidate;
    if (fits(input, plan, rotation)) break;
    if (labels.autoRotate && labels.rotation === undefined && fits(input, plan, 25)) {
      rotation = 25;
      break;
    }
  }
  return { plan, rotation };
}
function mainGrid(
  input: BoxPlotMappingInput,
  chrome: Grid,
  category: number,
  numeric: number,
  reservation: number,
): Grid {
  // The Box label plan already reserves axis space; ECharts must retain that plot.
  const grid: Grid = { ...chrome, containLabel: false, outerBoundsMode: "none" };
  grid[
    input.style.axes.category.fields.position as "left" | "right" | "top" | "bottom"
  ] += category;
  grid[
    input.style.axes.number.appearance.fields.position as
      | "left"
      | "right"
      | "top"
      | "bottom"
  ] += numeric;
  const horizontalScale = Math.min(
    1,
    Math.max(0, input.context.viewport.width - 1) / Math.max(1, grid.left + grid.right),
  );
  const verticalScale = Math.min(
    1,
    Math.max(0, input.context.viewport.height - reservation - 1) /
      Math.max(1, grid.top + grid.bottom),
  );
  grid.left *= horizontalScale;
  grid.right *= horizontalScale;
  grid.top *= verticalScale;
  grid.bottom = grid.bottom * verticalScale + reservation;
  return grid;
}
function spans(input: BoxPlotMappingInput, grid: Grid) {
  const width = Math.max(0, input.context.viewport.width - grid.left - grid.right);
  const height = Math.max(0, input.context.viewport.height - grid.top - grid.bottom);
  return input.style.direction === "vertical"
    ? { category: width, numeric: height }
    : { category: height, numeric: width };
}
export function boxPlotAxisLayout(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  domain: BoxPlotDomain,
  chrome: Grid,
) {
  const nav = input.context.navigation;
  const labelSpace = nav?.mini
    ? Math.ceil((nav.theme.navigatorFont?.fontSize ?? 10) * 1.2) + 5
    : 0;
  const reservation = nav && (nav.enabled || nav.mini) ? 18 + labelSpace + 10 : 0;
  let grid = mainGrid(input, chrome, 0, 0, reservation);
  let categoryFootprint = 0;
  let numericFootprint = 0;
  // Monotone reservations bound the wrap/tick feedback without oscillating at a band threshold.
  for (let pass = 0; pass < 6; pass++) {
    const span = spans(input, grid);
    const category = planBoxCategoryLabels(input, projection, span.category);
    const numeric = numericPlan(input, domain, span.numeric);
    categoryFootprint = Math.max(
      categoryFootprint,
      Math.min(
        category.sizeLimit,
        category.footprint + axisDecoration(input.style.axes.category),
      ),
    );
    numericFootprint = Math.max(
      numericFootprint,
      footprint(
        input.style.axes.number.appearance,
        numeric.plan.rawTicks.map((value) =>
          boxDisplayText(input.context.display.numericAxis(value)),
        ),
        input.style.direction === "horizontal",
        numeric.rotation,
      ),
    );
    const next = mainGrid(
      input,
      chrome,
      categoryFootprint,
      numericFootprint,
      reservation,
    );
    if (JSON.stringify(grid) === JSON.stringify(next)) break;
    grid = next;
  }
  const span = spans(input, grid);
  const categoryPlan = planBoxCategoryLabels(input, projection, span.category);
  const numeric = numericPlan(input, domain, span.numeric);
  const navigatorGeometry: BoxNavigatorGeometry | undefined = reservation
    ? {
        left: grid.left,
        right: grid.right,
        bottom: chrome.bottom + labelSpace,
        height: 18,
        labelSpace,
      }
    : undefined;
  return {
    grid,
    plan: numeric.plan,
    numericRotation: numeric.rotation,
    categorySpan: span.category,
    categoryPlan,
    navigatorGeometry,
  };
}
