import merge from "lodash.merge";
import type { ApplicationThemeInput } from "../application/appearanceModel";
import type { RuntimeOptions, RuntimeOptionValue } from "../compatibility/legacyTypes";
import { waterfallThemePaint } from "./waterfallThemePaint";

const fills = [
  "#5090dc",
  "#ffa03a",
  "#459d55",
  "#34bfe1",
  "#e1cc00",
  "#9669cb",
  "#b5b5b5",
  "#bd5aa7",
  "#8a6224",
  "#ef5452",
];
const lightStrokes = [
  "#2b5c95",
  "#cc6f10",
  "#1e652e",
  "#18859e",
  "#a69400",
  "#603c88",
  "#575757",
  "#7d2f6d",
  "#4f3508",
  "#a82529",
];
const darkStrokes = [
  "#74a8e6",
  "#ffbe70",
  "#6cb176",
  "#75d4ef",
  "#f6e559",
  "#aa86d8",
  "#a1a1a1",
  "#ce7ab9",
  "#997b52",
  "#ff7872",
];

/** Callback behavior belongs to display policy and quick actions, never RuntimeOptions. */
export function dataOnlyOptions(value: unknown): RuntimeOptionValue {
  if (value === null || ["string", "boolean", "undefined"].includes(typeof value))
    return value as RuntimeOptionValue;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(dataOnlyOptions);
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const admitted = dataOnlyOptions(item);
      return admitted === undefined ? [] : [[key, admitted]];
    }),
  );
}
function typography(params: Record<string, any>) {
  return Object.fromEntries(
    [
      ["fontFamily", params.fontFamily],
      ["fontSize", params.fontSize],
      ["fontWeight", params.fontWeight],
      ["color", params.textColor],
    ].filter(([, value]) => value !== undefined),
  );
}
function parameterOptions(params: Record<string, any>): RuntimeOptions {
  const font = typography(params);
  const { color: _color, ...retainedFont } = font;
  const scaledSize = (ratio: number) =>
    params.fontSize === undefined
      ? {}
      : { fontSize: Math.round(params.fontSize * ratio) };
  const axisFont = { ...font, ...scaledSize(13 / 12) };
  const padding = params.chartPadding ?? params.padding;
  const axis = {
    title: axisFont,
    label: font,
    ...(params.axisColor === undefined
      ? {}
      : { line: { stroke: params.axisColor }, tick: { stroke: params.axisColor } }),
    ...(params.gridLineColor === undefined
      ? {}
      : { gridLine: { style: [{ stroke: params.gridLineColor }] } }),
  };
  return {
    common: {
      title: { ...font, ...scaledSize(17 / 12) },
      subtitle: {
        ...retainedFont,
        ...scaledSize(13 / 12),
        ...(params.subtleTextColor === undefined
          ? {}
          : { color: params.subtleTextColor }),
      },
      legend: { item: { label: font } },
      series: { label: retainedFont, calloutLabel: font, sectorLabel: retainedFont },
      axes: Object.fromEntries(
        [
          "category",
          "number",
          "time",
          "grouped-category",
          "angle-category",
          "radius-number",
        ].map((type) => [type, axis]),
      ),
      ...(padding === undefined
        ? {}
        : {
            padding: Object.fromEntries(
              ["top", "right", "bottom", "left"].map((side) => [side, padding]),
            ),
          }),
      ...(params.backgroundColor === undefined
        ? {}
        : { background: { fill: params.backgroundColor } }),
    },
  };
}
/** Only selected parameter effects and explicit overrides enter appearance composition. */
export function projectCallerTheme(
  mode: "dark" | "light",
  names: readonly string[],
  themes: Record<string, any>,
  chartFamily?: string,
): ApplicationThemeInput {
  const name = names[0] ?? `openbb-${mode}`;
  const selected = themes[name] ?? {};
  const params = selected.params ?? {};
  const dark = selected.baseTheme
    ? selected.baseTheme === "ag-default-dark"
    : mode === "dark";
  const foreground = params.foregroundColor ?? (dark ? "#FFFFFF" : "#181d1f");
  const overrides = merge(
    {},
    // Retain integrated zoom defaults below explicit theme overrides.
    chartFamily === "rangeBar" ||
      chartFamily === "rangeArea" ||
      chartFamily === "waterfall"
      ? {
          common: {
            zoom: {
              enabled: true,
              anchorPointX: "pointer",
              anchorPointY: "pointer",
              minVisibleItems: 4,
              autoScaling: { enabled: true },
            },
          },
        }
      : {},
    parameterOptions(params),
    dataOnlyOptions(selected.overrides),
  ) as RuntimeOptions;
  // Resolve common versus family before merging, so a family parameter cannot mask explicit common input.
  for (const family of [
    "bar",
    "line",
    "scatter",
    "bubble",
    "histogram",
    "box-plot",
    "pie",
    "donut",
    "radar-line",
    "radar-area",
    "nightingale",
    "waterfall",
  ]) {
    overrides[family] = merge(
      {},
      parameterOptions(params).common as RuntimeOptions,
      family === "waterfall"
        ? {
            series: {
              item: Object.fromEntries(
                ["positive", "negative", "total"].map((sign) => [
                  sign,
                  { label: typography(params) },
                ]),
              ),
            },
          }
        : {},
      (dataOnlyOptions(selected.overrides) as RuntimeOptions | undefined)?.common,
      (dataOnlyOptions(selected.overrides) as RuntimeOptions | undefined)?.[family],
    );
  }
  return {
    name,
    mode,
    ...(chartFamily === "waterfall"
      ? { waterfallPaint: waterfallThemePaint(selected.palette, dark) }
      : {}),
    ...(params.borderColor === undefined
      ? {}
      : { navigatorBorderColor: params.borderColor }),
    navigatorFont: {
      fontFamily: params.fontFamily ?? "Verdana, sans-serif",
      fontSize: Math.round(((params.fontSize ?? 12) * 10) / 12),
      fontWeight: params.fontWeight ?? 400,
    },
    overrides,
    colors: {
      base: dark ? "ag-default-dark" : "ag-default",
      foregroundColor: foreground,
      textColor: params.textColor ?? foreground,
      backgroundColor: params.backgroundColor ?? (dark ? "#151518" : "#FFFFFF"),
      chartBackgroundColor: params.backgroundColor ?? (dark ? "#151518" : "#FFFFFF"),
    },
    palette: {
      fills: selected.palette?.fills?.length ? selected.palette.fills : fills,
      strokes: selected.palette?.strokes?.length
        ? selected.palette.strokes
        : chartFamily === "nightingale" && !selected.palette
          ? [params.backgroundColor ?? (dark ? "#151518" : "#FFFFFF")]
          : dark
            ? darkStrokes
            : lightStrokes,
    },
  };
}
