import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import type { ResolvedApplicationAxis } from "../application/appearanceModel";
import { boxDisplayText } from "./boxPlotAdmission";
import type { BoxValueScale } from "./boxPlotDomain";
import type { BoxPlotMappingInput, BoxPlotProjection } from "./boxPlotTypes";
import type { BoxValueAxisPlan } from "./boxPlotValueAxis";
import { fontStyle } from "./cartesianDisplay";
import { alternatingGrid } from "./cartesianGrid";
import { measureText } from "./cartesianLayout";

function rotation(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  usableSpan?: number,
): number {
  const a = input.style.axes.category;
  if (a.labels.rotation !== undefined) return -a.labels.rotation;
  if (!a.labels.autoRotate) return 0;
  const horizontal = input.style.direction === "vertical";
  const span =
    usableSpan ??
    (horizontal ? input.context.viewport.width : input.context.viewport.height);
  const overlap = projection.groups.some((g) => {
    const size = measureText(
      boxDisplayText(input.context.display.category(g.category)),
      a.labels,
    );
    return (
      (horizontal ? size.width : size.height) + 10 >
      span / Math.max(1, projection.groups.length)
    );
  });
  return overlap ? 25 : 0;
}
function appearance(a: ResolvedApplicationAxis) {
  return {
    type: "value" as const,
    scale: true,
    position: a.fields.position as "top" | "bottom",
    name: a.title.enabled ? a.title.text : "",
    nameLocation: "middle" as const,
    nameGap: a.title.spacing,
    nameMoveOverlap: true,
    nameTextStyle: fontStyle(a.title),
    axisLine: {
      show: a.lineEnabled,
      onZero: false,
      lineStyle: { color: a.fields.color, width: a.fields.thickness },
    },
    axisTick: {
      show: a.ticks.enabled,
      length: a.ticks.length,
      lineStyle: { color: a.ticks.color, width: a.ticks.width },
    },
    axisLabel: {
      ...fontStyle(a.labels),
      margin: a.labels.padding,
      rotate: -(a.labels.rotation ?? 0),
    },
    splitLine: {
      show: a.grid.enabled && !alternatingGrid(a),
      lineStyle: {
        color: a.gridStyles.map((s) => s.stroke),
        width: a.grid.thickness,
        type: [...a.gridStyles[0].lineDash],
      },
    },
  };
}
function categoryAxis(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  usableSpan?: number,
): XAXisComponentOption {
  const a = input.style.axes.category;
  const base = appearance(a);
  const count = projection.groups.length;
  const slots = projection.groups.map((g) => g.slot);
  const b = input.style.band;
  const c = b.paddingOuter + (1 - b.paddingInner) / 2;
  const category = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v)
      ? projection.groups[v]?.category
      : undefined;
  return {
    ...base,
    min: count > 1 ? -c : -0.5,
    max: count > 1 ? count - 1 + c : 0.5,
    inverse: input.style.direction === "horizontal",
    axisLabel: {
      ...base.axisLabel,
      customValues: slots,
      rotate: rotation(input, projection, usableSpan),
      formatter: (v: number) => {
        const raw = category(v);
        return raw === undefined
          ? ""
          : boxDisplayText(input.context.display.category(raw));
      },
    },
    axisTick: { ...base.axisTick, customValues: [...slots] },
    axisPointer: {
      snap: true,
      label: {
        show: count > 0,
        formatter: (p) => {
          const raw = category(p.value);
          return raw === undefined
            ? ""
            : boxDisplayText(input.context.display.crosshair(raw));
        },
      },
    },
  };
}
function valueAxis(
  input: BoxPlotMappingInput,
  scale: BoxValueScale,
  empty: boolean,
): XAXisComponentOption {
  const base = appearance(input.style.axes.number.appearance);
  const raw = (v: unknown): number => {
    if (scale.constant !== undefined) return scale.constant;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    throw Error("Invalid Box Plot numeric axis coordinate.");
  };
  return {
    ...base,
    min: scale.min,
    max: scale.max,
    ...(scale.interval === undefined ? {} : { interval: scale.interval }),
    axisLabel: {
      ...base.axisLabel,
      ...(scale.ticks ? { customValues: [...scale.ticks] } : {}),
      formatter: (v: number) =>
        empty ? "" : boxDisplayText(input.context.display.numericAxis(raw(v))),
    },
    axisTick: {
      ...base.axisTick,
      ...(scale.ticks ? { customValues: [...scale.ticks] } : {}),
    },
    splitLine: { ...base.splitLine, show: !empty && base.splitLine?.show },
    axisPointer: {
      label: {
        show: !empty,
        formatter: (p) =>
          empty ? "" : boxDisplayText(input.context.display.crosshair(raw(p.value))),
      },
    },
  };
}
function edgeLabels(
  input: BoxPlotMappingInput,
  plan: BoxValueAxisPlan,
  rotation: number,
) {
  if (
    input.style.direction !== "horizontal" ||
    plan.rawTicks.length <= 2 ||
    !plan.visibleExtent.length
  )
    return new Set<number>();
  const extent = plan.visibleExtent;
  const hidden = new Set<number>();
  const radians = (rotation * Math.PI) / 180;
  const full = extent[0] === plan.fullExtent[0] && extent[1] === plan.fullExtent[1];
  for (const [index, value] of plan.rawTicks.entries()) {
    if (index !== plan.rawTicks.length - 1 && !(index === 0 && full)) continue;
    const size = measureText(
      boxDisplayText(input.context.display.numericAxis(value)),
      input.style.axes.number.appearance.labels,
    );
    const half =
      (Math.abs(size.width * Math.cos(radians)) +
        Math.abs(size.height * Math.sin(radians))) /
      2;
    const position = ((value - extent[0]) / (extent[1] - extent[0])) * plan.span;
    if (position - half < 0 || position + half > plan.span) hidden.add(value);
  }
  return hidden;
}
export function boxPlotAxes(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  scale: BoxValueScale,
  empty: boolean,
  plan?: BoxValueAxisPlan,
  categorySpan?: number,
  numericRotation?: number,
) {
  const vertical = input.style.direction === "vertical";
  const c = categoryAxis(input, projection, categorySpan);
  const n = valueAxis(input, scale, empty);
  if (plan) {
    const hidden = edgeLabels(input, plan, numericRotation ?? 0);
    n.axisLabel = {
      ...n.axisLabel,
      rotate: -(
        numericRotation ??
        input.style.axes.number.appearance.labels.rotation ??
        0
      ),
      formatter: (v: number) =>
        hidden.has(v)
          ? ""
          : boxDisplayText(input.context.display.numericAxis(scale.constant ?? v)),
      customValues: [...(plan.transport.ticks ?? [])],
    };
    n.axisTick = { ...n.axisTick, customValues: [...(plan.transport.ticks ?? [])] };
  }
  const axes = (
    [
      ["category", input.style.axes.category],
      ["number", input.style.axes.number.appearance],
    ] as const
  ).flatMap(([id, a]) =>
    a.grid.enabled && alternatingGrid(a) && !(id === "number" && empty)
      ? [
          {
            axis: (id === "category") === vertical ? "xAxis" : "yAxis",
            width: a.grid.thickness,
            styles: a.gridStyles,
          },
        ]
      : [],
  );
  return {
    xAxis: vertical ? c : n,
    yAxis: (vertical ? n : c) as YAXisComponentOption,
    ...(axes.length ? { qopenbbGrid: { axes } } : {}),
  };
}
