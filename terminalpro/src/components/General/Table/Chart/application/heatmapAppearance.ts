import { color } from "echarts/core";
import merge from "lodash.merge";
import { selectOptionBaseline } from "../compatibility/optionState";
import { composeAppearanceOptions } from "./appearanceComposition";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { at, bool, child, number, object, text } from "./effectiveAppearanceValues";
import type { HeatmapAppearanceInput, ResolveHeatmapAppearance } from "./heatmapTypes";
import {
  choice,
  freezeHierarchy,
  hierarchyAutoLabel,
  hierarchyGradient,
} from "./hierarchyAppearanceValues";

function paint(value: unknown): string {
  const result = text(value);
  if (!color.parse(result)) throw Error("Invalid Heatmap paint");
  return result;
}

function defaults(input: HeatmapAppearanceInput) {
  const typography = {
    fontFamily: "Verdana, sans-serif",
    fontSize: 12,
    fontWeight: 400,
    color: input.theme.colors.textColor,
  };
  return merge({}, appearanceDefaults({ ...input, family: "heatmap", seriesIds: [] }), {
    padding: { bottom: 10 },
    gradientLegend: {
      enabled: true,
      position: "right",
      reverseOrder: false,
      spacing: 20,
      gradient: { thickness: 16, preferredLength: 200 },
      scale: { label: typography },
    },
    series: {
      stroke: input.themePaint.stroke,
      strokeWidth: input.themePaint.strokeWidth,
      strokeOpacity: 1,
      itemPadding: 3,
      textAlign: "center",
      verticalAlign: "middle",
      label: {
        ...typography,
        enabled: true,
        wrapping: "on-space",
        overflowStrategy: "ellipsis",
        spacing: 0,
      },
    },
  });
}
function layers(input: HeatmapAppearanceInput) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error("Invalid option composition");
  const theme = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: "theme",
    previous: { ...input.baseline, options: input.theme.overrides },
  });
  if (!theme.valid) throw Error("Invalid theme");
  return [
    defaults(input),
    object(theme.value.options.common),
    object(theme.value.options.heatmap),
    object(composed.value.common),
    object(composed.value.heatmap),
  ];
}
export const resolveHeatmapAppearance: ResolveHeatmapAppearance = (input) => {
  try {
    number(input.precision, 0, 20);
    if (!Number.isInteger(input.precision)) throw Error("Invalid precision");
    const source = layers(input);
    const effective = merge({}, ...source);
    const read = (path: string) => at(effective, path);
    let range: unknown = input.themePaint.colorRange;
    for (const layer of source)
      if (at(layer, "series.colorRange") !== undefined)
        range = at(layer, "series.colorRange");
    if (!Array.isArray(range) || range.length < 2)
      throw Error("Invalid Heatmap color range");
    const axes = (direction: "x" | "y") =>
      resolveAppearanceAxis(source, {
        id: "category",
        type: "category",
        direction,
        position: direction === "x" ? "bottom" : "left",
        options: {},
      });
    const chrome = resolveAppearanceChrome(source, input.theme.palette, 0);
    const labelRead = child(read, "series.label");
    const label = hierarchyAutoLabel((path) =>
      path === "minimumFontSize"
        ? (labelRead(path) ?? labelRead("fontSize"))
        : labelRead(path),
    );
    const explicitStroke = source
      .slice(1)
      .some((layer) => at(layer, "series.stroke") !== undefined);
    const explicitWidth = source
      .slice(1)
      .some((layer) => at(layer, "series.strokeWidth") !== undefined);
    return {
      valid: true,
      value: freezeHierarchy({
        family: "heatmap",
        application: {
          title: chrome.title,
          subtitle: chrome.subtitle,
          padding: chrome.padding,
          background: chrome.background,
          tooltip: chrome.tooltip,
        },
        axes: { x: axes("x"), y: axes("y") },
        colorRange: range.map(paint),
        gradientLegend: hierarchyGradient(child(read, "gradientLegend")),
        series: {
          stroke: paint(read("series.stroke")),
          strokeWidth:
            explicitStroke && !explicitWidth ? 2 : number(read("series.strokeWidth")),
          strokeOpacity: number(read("series.strokeOpacity"), 0, 1),
          itemPadding: number(read("series.itemPadding")),
          textAlign: choice(read("series.textAlign"), ["left", "center", "right"]),
          verticalAlign: choice(read("series.verticalAlign"), [
            "top",
            "middle",
            "bottom",
          ]),
          label: { ...label, enabled: bool(read("series.label.enabled")) },
        },
      }),
    };
  } catch {
    return { valid: false, error: "Invalid Heatmap appearance" };
  }
};
