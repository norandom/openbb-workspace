import { color } from "echarts/core";
import type { FunnelThemePaint } from "../application/funnelRenderTypes";
import type { FunnelFamily } from "../compatibility/funnelContracts";
import type { ValidationResult } from "../compatibility/legacyTypes";
import { projectCallerTheme } from "./themeInputs";

// AG Charts 12.1.1 native second sequential tokens; light uses retained OKLCH output.
const lightSecond = [
  "#5090dc",
  "#629be0",
  "#74a7e4",
  "#85b2e8",
  "#97bdeb",
  "#a8c8ef",
  "#b9d3f2",
  "#cbdef5",
];
const darkSecond = [
  "#5090dc",
  "#4882c6",
  "#4073b0",
  "#38659a",
  "#305684",
  "#28486e",
  "#203a58",
  "#182b42",
];
const invalid = "Invalid Funnel theme palette or color.";
const advanced =
  "Advanced Funnel image, gradient and pattern palettes are unsupported. Saved configuration is preserved.";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(invalid);
  return value as Record<string, unknown>;
}
function paint(value: unknown): string {
  if (typeof value !== "string" || !color.parse(value)) throw Error(invalid);
  return value;
}
function paints(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw Error(invalid);
  return value.map(paint);
}
function hasAdvanced(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasAdvanced);
  const entry = value as Record<string, unknown>;
  return (
    ["image", "gradient", "linear-gradient", "radial-gradient", "pattern"].includes(
      String(entry.type),
    ) || Object.values(entry).some(hasAdvanced)
  );
}
function paletteOf(selected: Record<string, unknown>): Record<string, unknown> {
  const palette = selected.palette === undefined ? {} : object(selected.palette);
  if (hasAdvanced(palette)) throw Error(advanced);
  for (const key of ["fills", "strokes", "secondSequentialColors"]) {
    if (palette[key] !== undefined) paints(palette[key]);
  }
  for (const key of ["up", "down", "neutral"]) {
    if (palette[key] !== undefined) {
      const named = object(palette[key]);
      for (const leaf of ["fill", "stroke"]) {
        if (named[leaf] !== undefined) paint(named[leaf]);
      }
    }
  }
  return palette;
}
function project(
  mode: "light" | "dark",
  names: readonly string[],
  themes: Readonly<Record<string, unknown>>,
  family: FunnelFamily,
): FunnelThemePaint {
  if (!["funnel", "coneFunnel", "pyramid"].includes(family)) throw Error(invalid);
  const raw = object(themes)[names[0] ?? `openbb-${mode}`];
  const selected = raw === undefined ? {} : object(raw);
  if (selected.params !== undefined) object(selected.params);
  const palette = paletteOf(selected);
  const common = projectCallerTheme(mode, names, themes);
  const fills = paints(common.palette.fills);
  const strokes = paints(common.palette.strokes);
  const text = paint(common.colors.textColor);
  const background = paint(common.colors.chartBackgroundColor);
  const custom = ["up", "down", "neutral", "fills", "strokes"].some(
    (key) => palette[key] !== undefined,
  );
  const dark = common.colors.base === "ag-default-dark";
  const cone = custom
    ? [fills[0], fills[1 % fills.length]]
    : paints(palette.secondSequentialColors ?? (dark ? darkSecond : lightSecond));
  return {
    family,
    fills:
      family === "coneFunnel" ? [...cone] : family === "funnel" ? [fills[0]] : fills,
    strokes:
      family === "coneFunnel"
        ? [...cone]
        : family === "funnel"
          ? [strokes[0]]
          : strokes,
    numericLabelColor: family === "coneFunnel" ? text : background,
    stageLabelColor: text,
    dropOffFill: fills[0],
    dropOffStroke: strokes[0],
  };
}
/** Reject unsupported paint without changing persisted theme data or exposing asset URLs. */
export function projectFunnelThemePaint(
  mode: "light" | "dark",
  names: readonly string[],
  themes: Readonly<Record<string, unknown>>,
  family: FunnelFamily,
): ValidationResult<FunnelThemePaint> {
  try {
    return { valid: true, value: project(mode, names, themes, family) };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error && error.message === advanced ? advanced : invalid,
    };
  }
}
