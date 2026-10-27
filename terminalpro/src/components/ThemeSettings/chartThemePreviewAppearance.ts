import { color } from "echarts";
import type { ChartThemeState, ThemeMode } from "./chartThemeState";

export function previewColor(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new Error(`${label}: unsupported palette paint. Choose a plain color.`);
  if (!color.parse(value)) throw new Error(`${label}: invalid color '${value}'.`);
  return value;
}

function mix(foreground: string, background: string, ratio: number): string {
  const a = color.parse(foreground)!;
  const b = color.parse(background)!;
  const rgb = a.slice(0, 3).map((v, i) => Math.round(v * ratio + b[i] * (1 - ratio)));
  return `rgba(${rgb.join(",")},${a[3] * ratio + b[3] * (1 - ratio)})`;
}

function numeric(value: unknown, fallback: number, label: string, zero = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (zero ? value < 0 : value <= 0)
  )
    throw new Error(
      `${label} must be a finite ${zero ? "nonnegative" : "positive"} number.`,
    );
  return value;
}

function weight(
  value: string | null | undefined,
  fallback: number | "normal" | "bold",
) {
  if (!value) return fallback;
  if (value === "normal" || value === "bold") return value;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 1000)
    throw new Error("Font Weight must be normal, bold, or a number from 1 to 1000.");
  return number;
}

export function resolvePreviewAppearance(state: ChartThemeState, mode: ThemeMode) {
  const dark = state.selectedBaseTheme?.endsWith("-dark") ?? mode === "dark";
  const paint = (key: keyof ChartThemeState, fallback: string) =>
    state[key] === undefined || state[key] === null || state[key] === ""
      ? fallback
      : previewColor(state[key], String(key));
  const foreground = paint("foregroundColor", dark ? "#fff" : "#181d1f");
  const background = paint("backgroundColor", dark ? "#192232" : "white");
  const text = paint("textColor", foreground);
  const chromeText = paint("chromeTextColor", foreground);
  const fontFamily = state.fontFamily || "Verdana, sans-serif";
  const fontSize = numeric(state.fontSize, 12, "Font Size");
  const fontWeight = weight(state.fontWeight, 400);
  const chrome = {
    color: chromeText,
    backgroundColor: paint(
      "chromeBackgroundColor",
      mix(foreground, background, dark ? 0.07 : 0.02),
    ),
    subtleColor: paint("chromeSubtleTextColor", mix(chromeText, background, 0.62)),
    fontFamily: state.chromeFontFamily || fontFamily,
    fontSize: numeric(state.chromeFontSize, fontSize, "Chrome Font Size"),
    fontWeight: weight(state.chromeFontWeight, fontWeight),
  };
  const financial = state.selectedBaseTheme?.startsWith("ag-financial");
  return {
    fontFamily,
    fontSize,
    fontWeight,
    color: text,
    foregroundColor: foreground,
    chrome,
    popupShadow: `0 0 16px rgba(0,0,0,${dark ? 0.33 : 0.15})`,
    padding: numeric(state.padding, 20, "Padding", true),
    backgroundColor:
      mode === "dark" && !state.backgroundColor ? "transparent" : background,
    accentColor: paint("accentColor", "#2196f3"),
    borderColor: paint(
      "borderColor",
      dark ? mix(foreground, background, 0.216) : color.modifyAlpha(foreground, 0.15),
    ),
    subtleTextColor: paint(
      "subtleTextColor",
      mix(text, background, dark ? 0.43 : 0.62),
    ),
    axisColor: paint("axisColor", mix(foreground, background, dark ? 0.737 : 0.325)),
    gridLineColor: paint(
      "gridLineColor",
      mix(
        foreground,
        background,
        financial ? (dark ? 0.12 : 0.06) : dark ? 0.257 : 0.1,
      ),
    ),
    fills: state.fills.map((value, i) => previewColor(value, `Fill ${i + 1}`)),
    strokes: state.strokes.map((value, i) => previewColor(value, `Stroke ${i + 1}`)),
  };
}

export type PreviewAppearance = ReturnType<typeof resolvePreviewAppearance>;
