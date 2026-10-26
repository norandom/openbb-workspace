import { color } from "echarts/core";
import merge from "lodash.merge";
import {
  type FunnelFamily,
  isFunnelFamily,
  nativeFunnelType,
} from "../compatibility/funnelContracts";
import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import { composeAppearanceOptions } from "./appearanceComposition";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import {
  at,
  bool,
  child,
  dash,
  font,
  number,
  object,
  type ReadAppearance,
  text,
} from "./effectiveAppearanceValues";
import type { FunnelAppearanceInput } from "./funnelAppearanceTypes";
import type { FunnelStroke, ResolvedFunnelStyle } from "./funnelRenderTypes";
import { choice, freezeHierarchy } from "./hierarchyAppearanceValues";

function paint(value: unknown): string {
  const result = text(value);
  if (!color.parse(result)) throw Error("Invalid Funnel paint");
  return result;
}
function paints(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw Error("Empty Funnel paint");
  return value.map(paint);
}
function stroke(read: ReadAppearance): FunnelStroke {
  return {
    strokeWidth: number(read("strokeWidth")),
    strokeOpacity: number(read("strokeOpacity"), 0, 1),
    fillOpacity: number(read("fillOpacity"), 0, 1),
    lineDash: dash(read("lineDash")),
  };
}
function defaults(input: FunnelAppearanceInput, family: FunnelFamily): RuntimeOptions {
  const typography = {
    fontFamily: "Verdana, sans-serif",
    fontSize: 12,
    fontWeight: 400,
  };
  return merge({}, appearanceDefaults({ ...input, family, seriesIds: [] }), {
    seriesArea: {
      padding: {
        top: family === "coneFunnel" ? 20 : 0,
        right: 0,
        bottom: family === "coneFunnel" ? 20 : 0,
        left: 0,
      },
    },
    series: {
      direction: "vertical",
      fills: input.themePaint.fills,
      strokes: input.themePaint.strokes,
      label: {
        ...typography,
        // Ordinary createDefaultSeries (38dffc3) disables numeric labels for all
        // variants; generated and saved explicit choices still compose above it.
        enabled: false,
        color: input.themePaint.numericLabelColor,
        placement: family === "coneFunnel" ? "before" : "center",
        spacing: family === "coneFunnel" ? 4 : 0,
      },
      stageLabel: {
        ...typography,
        enabled: true,
        color: input.themePaint.stageLabelColor,
        ...(family === "pyramid" ? { spacing: 12 } : {}),
      },
      spacingRatio: 0.25,
      spacing: 2,
      reverse: false,
      dropOff: {
        enabled: true,
        fill: input.themePaint.dropOffFill,
        stroke: input.themePaint.dropOffStroke,
        strokeWidth: 0,
        lineDash: [0],
        strokeOpacity: 1,
        fillOpacity: 0.2,
      },
    },
  });
}
function layers(input: FunnelAppearanceInput, family: FunnelFamily): RuntimeOptions[] {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error("Invalid Funnel options");
  const theme = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: "theme",
    previous: { ...input.baseline, options: input.theme.overrides },
  });
  if (!theme.valid) throw Error("Invalid Funnel theme");
  const native = nativeFunnelType(family);
  return [
    defaults(input, family),
    object(theme.value.options.common),
    object(theme.value.options[native]),
    object(composed.value.common),
    object(composed.value[native]),
    object(input.baseline.options[native]),
  ];
}
function arrayLeaf(source: RuntimeOptions[], path: string): unknown {
  let result: unknown;
  for (const layer of source)
    if (at(layer, path) !== undefined) result = at(layer, path);
  return result;
}
function nativeStrokeWidth(
  source: RuntimeOptions[],
  prefix: string,
  paintKey: string,
): number {
  const explicit = source.slice(1);
  if (explicit.some((layer) => at(layer, `${prefix}.strokeWidth`) !== undefined))
    return number(arrayLeaf(source, `${prefix}.strokeWidth`));
  return explicit.some((layer) => at(layer, `${prefix}.${paintKey}`) !== undefined)
    ? 2
    : 0;
}
function shadow(read: ReadAppearance) {
  return {
    enabled: bool(read("enabled")),
    color: paint(read("color")),
    blur: number(read("blur")),
    xOffset: number(read("xOffset"), Number.NEGATIVE_INFINITY),
    yOffset: number(read("yOffset"), Number.NEGATIVE_INFINITY),
  };
}
export function resolveFunnelAppearance(
  input: FunnelAppearanceInput,
  family: FunnelFamily,
): ValidationResult<ResolvedFunnelStyle> {
  try {
    if (!isFunnelFamily(family) || input.themePaint.family !== family)
      throw Error("Invalid Funnel family");
    number(input.precision, 0, 20);
    if (!Number.isInteger(input.precision)) throw Error("Invalid precision");
    const source = layers(input, family);
    const effective = merge({}, ...source);
    const read: ReadAppearance = (path) => at(effective, path);
    const direction = choice(read("series.direction"), ["vertical", "horizontal"]);
    const chrome = resolveAppearanceChrome(source, input.theme.palette, 0);
    const axis = resolveAppearanceAxis(source, {
      id: "category",
      type: "category",
      direction: direction === "vertical" ? "y" : "x",
      position: direction === "vertical" ? "left" : "bottom",
      options: {},
    });
    const label = child(read, "series.label");
    const stage = child(read, "series.stageLabel");
    const common = {
      application: {
        title: { ...chrome.title, color: paint(chrome.title.color) },
        subtitle: { ...chrome.subtitle, color: paint(chrome.subtitle.color) },
        padding: chrome.padding,
        background: { ...chrome.background, fill: paint(chrome.background.fill) },
        tooltip: {
          ...chrome.tooltip,
          mode: choice(chrome.tooltip.mode, ["single", "shared", "compact"]),
        },
        palette: chrome.palette,
      },
      direction,
      label: {
        ...font(label),
        color: paint(label("color")),
        enabled: bool(label("enabled")),
        placement: choice(label("placement"), ["center", "before", "after"]),
        spacing: number(label("spacing")),
      },
      stageLabel: {
        ...font(stage),
        color: paint(stage("color")),
        enabled: bool(stage("enabled")),
        placement: choice(
          stage("placement") ??
            (direction === "horizontal" && family !== "pyramid" ? "after" : "before"),
          ["before", "after"],
        ),
        spacing: number(
          family === "pyramid"
            ? stage("spacing")
            : (stage("padding") ?? axis.labels.padding),
        ),
      },
      series: {
        ...stroke(child(read, "series")),
        strokeWidth: nativeStrokeWidth(source, "series", "strokes"),
        lineDash: dash(arrayLeaf(source, "series.lineDash")),
      },
      paint: {
        ...input.themePaint,
        fills: paints(arrayLeaf(source, "series.fills")),
        strokes: paints(arrayLeaf(source, "series.strokes")),
        numericLabelColor: paint(input.themePaint.numericLabelColor),
        stageLabelColor: paint(input.themePaint.stageLabelColor),
        dropOffFill: paint(input.themePaint.dropOffFill),
        dropOffStroke: paint(input.themePaint.dropOffStroke),
      },
      seriesAreaPadding: Object.fromEntries(
        ["top", "right", "bottom", "left"].map((side) => [
          side,
          number(read(`seriesArea.padding.${side}`)),
        ]),
      ) as { top: number; right: number; bottom: number; left: number },
    };
    if (family === "coneFunnel")
      return { valid: true, value: freezeHierarchy({ ...common, family }) };
    const resolvedShadow = shadow(child(read, "series.shadow"));
    if (family === "pyramid")
      return {
        valid: true,
        value: freezeHierarchy({
          ...common,
          family,
          shadow: resolvedShadow,
          reverse: bool(read("series.reverse")),
          spacing: number(read("series.spacing")),
          ...(read("series.aspectRatio") === undefined
            ? {}
            : { aspectRatio: number(read("series.aspectRatio"), Number.MIN_VALUE) }),
        }),
      };
    const drop = child(read, "series.dropOff");
    return {
      valid: true,
      value: freezeHierarchy({
        ...common,
        family,
        shadow: resolvedShadow,
        spacingRatio: number(read("series.spacingRatio"), 0, 1),
        dropOff: {
          ...stroke(drop),
          strokeWidth: nativeStrokeWidth(source, "series.dropOff", "stroke"),
          lineDash: dash(arrayLeaf(source, "series.dropOff.lineDash")),
          enabled: bool(drop("enabled")),
          fill: paint(drop("fill")),
          stroke: paint(drop("stroke")),
        },
      }),
    };
  } catch {
    return { valid: false, error: "Invalid Funnel appearance" };
  }
}
