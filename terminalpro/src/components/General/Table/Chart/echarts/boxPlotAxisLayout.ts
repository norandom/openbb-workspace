import type { ResolvedApplicationAxis } from "../application/appearanceModel";
import { boxDisplayText } from "./boxPlotAdmission";
import { boxTickDensity } from "./boxPlotTicks";
import type {
  BoxPlotDomain,
  BoxPlotMappingInput,
  BoxPlotProjection,
} from "./boxPlotTypes";
import { type BoxValueAxisPlan, planBoxValueAxis } from "./boxPlotValueAxis";
import { measureText } from "./cartesianLayout";

type Grid = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  containLabel?: boolean;
};
function footprint(
  a: ResolvedApplicationAxis,
  labels: readonly string[],
  horizontal: boolean,
): number {
  const rotation = ((a.labels.rotation ?? 0) * Math.PI) / 180;
  const sizes = labels.map((v) => measureText(v, a.labels));
  const label =
    (a.labels as { enabled?: boolean }).enabled === false
      ? 0
      : Math.max(
          0,
          ...sizes.map((s) =>
            horizontal
              ? Math.abs(s.height * Math.cos(rotation)) +
                Math.abs(s.width * Math.sin(rotation))
              : Math.abs(s.width * Math.cos(rotation)) +
                Math.abs(s.height * Math.sin(rotation)),
          ),
        ) + a.labels.padding;
  return (
    label +
    (a.ticks.enabled ? a.ticks.length : 0) +
    (a.title.enabled ? measureText(a.title.text, a.title).height + a.title.spacing : 0)
  );
}
function fits(
  input: BoxPlotMappingInput,
  plan: BoxValueAxisPlan,
  rotationDegrees = input.style.axes.number.appearance.labels.rotation ?? 0,
): boolean {
  const a = input.style.axes.number.appearance;
  const ticks = plan.rawTicks;
  if (
    (a.labels as { enabled?: boolean }).enabled === false ||
    (a.labels as { avoidCollisions?: boolean }).avoidCollisions === false ||
    ticks.length < 2
  )
    return true;
  const horizontal = input.style.direction === "horizontal";
  const rotation = (rotationDegrees * Math.PI) / 180;
  let end = Number.NEGATIVE_INFINITY;
  return ticks.every((v) => {
    const size = measureText(
      boxDisplayText(input.context.display.numericAxis(v)),
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
        ? ((v - domain[0]) / (domain[1] - domain[0])) * plan.span
        : plan.span / 2;
    const valid = pos - extent / 2 >= end;
    end = pos + extent / 2 + (rotation ? 0 : 10);
    return valid;
  });
}
export function boxPlotAxisLayout(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  domain: BoxPlotDomain,
  chrome: Grid,
) {
  const vertical = input.style.direction === "vertical";
  const nav = input.context.navigation;
  const reservation =
    nav && (nav.enabled || nav.mini)
      ? (nav.mini
          ? 40 + Math.ceil((nav.theme.navigatorFont?.fontSize ?? 10) * 1.2) + 5
          : 18) + 10
      : 0;
  let grid = { ...chrome, containLabel: false };
  let span = 0;
  let plan = planBoxValueAxis(domain, 0, boxTickDensity(0));
  for (let pass = 0; pass < 2; pass++) {
    const category = footprint(
      input.style.axes.category,
      projection.groups.map((g) =>
        boxDisplayText(input.context.display.category(g.category)),
      ),
      vertical,
    );
    const numeric = footprint(
      input.style.axes.number.appearance,
      plan.rawTicks.map((v) => boxDisplayText(input.context.display.numericAxis(v))),
      !vertical,
    );
    grid = { ...chrome, containLabel: false };
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
      Math.max(0, input.context.viewport.width - 1) /
        Math.max(1, grid.left + grid.right),
    );
    const verticalScale = Math.min(
      1,
      Math.max(0, input.context.viewport.height - reservation - 1) /
        Math.max(1, grid.top + grid.bottom),
    );
    grid.left *= horizontalScale;
    grid.right *= horizontalScale;
    grid.top *= verticalScale;
    grid.bottom *= verticalScale;
    span = Math.max(
      0,
      vertical
        ? input.context.viewport.height - grid.top - grid.bottom - reservation
        : input.context.viewport.width - grid.left - grid.right,
    );
    plan = planBoxValueAxis(domain, span, boxTickDensity(span));
  }
  let numericRotation = input.style.axes.number.appearance.labels.rotation ?? 0;
  let previous = "";
  for (
    let count = plan.density.tickCount;
    count >= plan.density.minTickCount && count > 0;
    count--
  ) {
    const candidate = planBoxValueAxis(domain, span, {
      ...plan.density,
      tickCount: count,
    });
    const key = JSON.stringify(candidate.rawTicks);
    if (key === previous) continue;
    previous = key;
    plan = candidate;
    if (fits(input, plan, numericRotation)) break;
    if (
      input.style.axes.number.appearance.labels.autoRotate &&
      input.style.axes.number.appearance.labels.rotation === undefined &&
      fits(input, plan, 25)
    ) {
      numericRotation = 25;
      break;
    }
  }
  return {
    grid,
    plan,
    numericRotation,
    categorySpan: Math.max(
      0,
      vertical
        ? input.context.viewport.width - grid.left - grid.right
        : input.context.viewport.height - grid.top - grid.bottom - reservation,
    ),
  };
}
