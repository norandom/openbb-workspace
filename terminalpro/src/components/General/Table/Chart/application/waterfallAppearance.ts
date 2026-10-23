import { color } from "echarts";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  ApplicationAxisRuntime,
  ApplicationConcreteAxis,
} from "./axisStructureTypes";
import { resolveCommonAppearance } from "./effectiveAppearance";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import {
  at,
  bool,
  dash,
  font,
  number,
  object,
  text,
} from "./effectiveAppearanceValues";
import { rangeAxisLabelPolicy } from "./rangeAxisAppearance";
import { prepareWaterfallAppearance } from "./waterfallAppearanceOptions";
import type {
  WaterfallAppearanceInput,
  WaterfallAppearanceResult,
  WaterfallItemStyle,
  WaterfallResolvedAppearance,
  WaterfallSeriesStyle,
} from "./waterfallTypes";

class UnsupportedWaterfallPaint extends Error {}
function paint(value: unknown): string {
  if (value !== null && typeof value === "object")
    throw new UnsupportedWaterfallPaint(
      "Waterfall paint requires a supported string color",
    );
  const result = text(value);
  if (!color.parse(result)) throw Error("Invalid Waterfall paint");
  return result;
}
function label(value: unknown): WaterfallItemStyle["label"] {
  const source = object(value);
  const placement = text(source.placement);
  if (
    ![
      "inside-center",
      "inside-start",
      "inside-end",
      "outside-start",
      "outside-end",
    ].includes(placement)
  )
    throw Error("Invalid Waterfall label placement");
  paint(source.color);
  return {
    ...font((key) => source[key]),
    enabled: bool(source.enabled),
    placement,
    spacing: number(source.spacing),
  };
}
function item(value: unknown): WaterfallItemStyle {
  const source = object(value);
  return {
    name: text(source.name),
    fill: paint(source.fill),
    stroke: paint(source.stroke),
    strokeWidth: number(source.strokeWidth),
    strokeOpacity: number(source.strokeOpacity, 0, 1),
    fillOpacity: number(source.fillOpacity, 0, 1),
    lineDash: dash(source.lineDash),
    lineDashOffset: number(source.lineDashOffset, Number.NEGATIVE_INFINITY),
    label: label(source.label),
  };
}
function seriesStyle(source: RuntimeOptions): WaterfallSeriesStyle {
  if (source.direction !== "horizontal" && source.direction !== "vertical")
    throw Error("Invalid Waterfall direction");
  const line = object(source.line);
  const items = object(source.item);
  return {
    direction: source.direction,
    visible: bool(source.visible),
    tooltipEnabled: bool(at(source, "tooltip.enabled")),
    item: {
      positive: item(items.positive),
      negative: item(items.negative),
      total: item(items.total),
    },
    line: {
      enabled: bool(line.enabled),
      stroke: paint(line.stroke),
      strokeWidth: number(line.strokeWidth),
      strokeOpacity: number(line.strokeOpacity, 0, 1),
      lineDash: dash(line.lineDash),
      lineDashOffset: number(line.lineDashOffset, Number.NEGATIVE_INFINITY),
    },
  };
}
function validateInput(input: WaterfallAppearanceInput) {
  number(input.precision, 0, 20);
  if (!Number.isInteger(input.precision))
    throw Error("Waterfall precision must be an integer");
  if (
    !Array.isArray(input.seriesIds) ||
    input.seriesIds.some((id) => typeof id !== "string" || !id) ||
    new Set(input.seriesIds).size !== input.seriesIds.length
  )
    throw Error("Invalid Waterfall series IDs");
  if (!input.theme.name || !["light", "dark"].includes(input.theme.mode))
    throw Error("Missing Waterfall theme");
  for (const sign of ["positive", "negative", "total"] as const) {
    paint(input.paint[sign].fill);
    paint(input.paint[sign].stroke);
  }
  paint(input.paint.connectorStroke);
  if (input.axisRuntime.axes.length !== 2)
    throw Error("Missing Waterfall concrete axes");
}
function concreteAxes(
  runtime: ApplicationAxisRuntime,
  horizontal: boolean,
  layers: RuntimeOptions[],
): ApplicationAxisRuntime {
  const axes = (["category", "number"] as const).map((id): ApplicationConcreteAxis => {
    const previous = runtime.axes.find((axis) => axis.id === id);
    if (!previous) throw Error("Missing Waterfall concrete axis");
    const direction = (id === "category") !== horizontal ? "x" : "y";
    const options = { ...previous.options };
    if (previous.direction !== direction) delete options.position;
    const fallback =
      previous.direction === direction
        ? previous.position
        : direction === "x"
          ? "bottom"
          : "left";
    let saved: unknown;
    for (const layer of layers) {
      const root = at(layer, `axes.${previous.type}`);
      const inherited = at(root, "position");
      if (inherited !== undefined) saved = inherited;
      for (const position of direction === "x" ? ["bottom", "top"] : ["left", "right"])
        if (at(root, `${position}.position`) !== undefined) {
          saved = at(root, `${position}.position`);
          break;
        }
    }
    const position = options.position ?? saved ?? fallback;
    if (
      !(direction === "x" ? ["bottom", "top"] : ["left", "right"]).includes(
        text(position),
      )
    )
      throw Error("Waterfall axis position conflicts with direction");
    return {
      ...previous,
      direction,
      position: position as ApplicationConcreteAxis["position"],
      options,
    };
  });
  return { ...runtime, axes };
}
export function resolveWaterfallAppearance(
  input: WaterfallAppearanceInput,
): WaterfallAppearanceResult {
  try {
    const prepared = prepareWaterfallAppearance(input);
    validateInput(prepared.input);
    const series = seriesStyle(prepared.series);
    const axisRuntime = concreteAxes(
      prepared.input.axisRuntime,
      series.direction === "horizontal",
      prepared.layers,
    );
    const common = resolveCommonAppearance(
      { ...prepared.input, family: "waterfall", axisRuntime },
      prepared.layers,
    );
    const axes = Object.fromEntries(
      axisRuntime.axes.map((axis) => [
        axis.id,
        rangeAxisLabelPolicy(
          prepared.layers,
          axis,
          resolveAppearanceAxis(
            [
              ...prepared.layers,
              { axes: { [axis.type]: { [axis.position]: axis.options } } },
            ],
            axis,
          ),
        ),
      ]),
    ) as WaterfallResolvedAppearance["application"]["axes"];
    return {
      status: "resolved",
      value: {
        axisRuntime,
        series,
        application: {
          ...common,
          axes,
          legend: {
            ...common.legend,
            enabled: prepared.input.legendEnabled ?? common.legend.enabled,
          },
        },
      },
    };
  } catch (error) {
    return {
      status: error instanceof UnsupportedWaterfallPaint ? "unsupported" : "invalid",
      diagnostics: [
        {
          code: "waterfall-appearance",
          path: [],
          message:
            error instanceof Error ? error.message : "Invalid Waterfall appearance",
        },
      ],
    };
  }
}
