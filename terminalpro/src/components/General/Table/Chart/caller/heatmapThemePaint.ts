import { color } from "echarts/core";
import type { HeatmapThemePaint } from "../application/heatmapTypes";
import { record } from "../compatibility/editorBindings/validation";

function paint(value: unknown): string {
  if (typeof value !== "string" || !color.parse(value))
    throw Error("Invalid Heatmap theme paint");
  return value;
}
function paletteArray(
  value: unknown,
  fallback: readonly unknown[],
): readonly unknown[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || !value.length)
    throw Error("Invalid Heatmap theme palette");
  return value;
}
/** Pass the original selected palette and resolved theme background, before saved chart overrides. */
export function heatmapThemePaint(
  value: unknown,
  dark: boolean,
  chartBackgroundColor = dark ? "#192232" : "#ffffff",
): HeatmapThemePaint {
  const palette = value === undefined ? {} : record(value);
  const custom = ["fills", "strokes", "up", "down", "neutral"].some(
    (key) => palette[key] !== undefined,
  );
  const fills = paletteArray(palette.fills, ["#5090dc", "#ffa03a"]);
  const strokes = paletteArray(palette.strokes, [dark ? "#74a8e6" : "#2b5c95"]);
  const advanced = typeof fills[0] !== "string";
  const range = custom
    ? advanced
      ? ["#5090dc", "#5090dc"]
      : [fills[0], fills[1 % fills.length]]
    : paletteArray(palette.divergingColors, ["#ffa03a", "#e1cc00", "#459d55"]);
  return {
    colorRange: range.map(paint),
    stroke: paint(custom ? strokes[0] : chartBackgroundColor),
    strokeWidth: 0,
  };
}
