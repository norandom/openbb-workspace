import type {
  ResolvedApplicationAppearance,
  ResolvedFontStyle,
} from "../../application/appearanceModel";
import type { AxisBinding, EditorMetadata } from "./types";
import { fontPairs } from "./valueMapping";

const originalFonts = [
  "Arial, sans-serif",
  "Aria Black, sans-serif",
  "Book Antiqua,  serif",
  "Charcoal, sans-serif",
  "Comic Sans MS, cursive",
  "Courier, monospace",
  "Courier New, monospace",
  "Gadget, sans-serif",
  "Geneva, sans-serif",
  "Helvetica, sans-serif",
  "Impact, sans-serif",
  "Lucida Console, monospace",
  "Lucida Grande, sans-serif",
  "Lucida Sans Unicode,  sans-serif",
  "Monaco, monospace",
  "Palatino Linotype, serif",
  "Palatino, serif",
  "Times New Roman, serif",
  "Times, serif",
  "Verdana, sans-serif",
];
const choice = <T extends string | number>(value: T) => ({
  value,
  label: String(value),
});
export function fontChoices(...current: string[]) {
  const families = [...originalFonts];
  for (const font of current)
    if (!families.some((value) => value.toLowerCase() === font.toLowerCase()))
      families.push(font);
  return families.sort().map(choice);
}
export function displayFont(current: string) {
  return (
    originalFonts.find((font) => font.toLowerCase() === current.toLowerCase()) ??
    current
  );
}
const namedChoice = (value: string) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
});
export function fontWeightKey(font: ResolvedFontStyle) {
  return (
    Object.entries(fontPairs).find(
      ([, pair]) =>
        pair.fontWeight === (font.fontWeight ?? "normal") &&
        pair.fontStyle === (font.fontStyle ?? "normal"),
    )?.[0] ?? "predefined"
  );
}
type Typography = ResolvedFontStyle & { readonly font: string; readonly size: number };
export function typographyMetadata(...values: Typography[]) {
  const sizes = [
    ...new Set([
      8,
      10,
      12,
      14,
      16,
      18,
      20,
      22,
      24,
      26,
      28,
      30,
      32,
      34,
      36,
      ...values.map((value) => value.size),
    ]),
  ].sort((a, b) => a - b);
  const weightKeys = values.some((value) => fontWeightKey(value) === "predefined")
    ? ["predefined", ...Object.keys(fontPairs)]
    : Object.keys(fontPairs);
  const labels: Record<string, string> = {
    predefined: "Predefined",
    normal: "Normal",
    bold: "Bold",
    italic: "Italic",
    boldItalic: "Bold Italic",
  };
  return {
    fonts: fontChoices(...values.map((value) => value.font)),
    sizes: sizes.map(choice),
    weights: weightKeys.map((value) => ({ value, label: labels[value] })),
  };
}
const bounds = (max: number) => ({ min: 0, max, step: 1 });
function captionOptions(value: Typography & { readonly spacing: number }) {
  return {
    ...typographyMetadata(value),
    spacingBounds: bounds(Math.max(value.spacing, 100)),
  };
}
export const axisTimeFormats = [
  ["%d/%m/%Y", "DD/MM/YYYY"],
  ["%m/%d/%Y", "MM/DD/YYYY"],
  ["%d/%m/%y", "DD/MM/YY"],
  ["%m/%d/%y", "MM/DD/YY"],
  ["%d.%e.%y", "DD.M.YY"],
  ["%e.%d.%y", "M.DD.YY"],
  ["%Y-%m-%d", "YYYY-MM-DD"],
  ["%d %B %Y", "DD MMMM YYYY"],
  ["%H:%M:%S", "HH:MM:SS"],
  ["%I:%M:%S %p", "HH:MM:SS AM/PM"],
].map(([value, label]) => ({ value, label }));
function axisMetadata(
  style: ResolvedApplicationAppearance,
  bindings: Readonly<Record<"category" | "number", AxisBinding>>,
  axis: "category" | "number",
) {
  return {
    fields: {
      types: ["category", "number", "time"].map(namedChoice),
      timeFormats: axisTimeFormats,
      positions: (bindings[axis].direction === "x"
        ? ["top", "bottom"]
        : ["left", "right"]
      ).map(namedChoice),
    },
    labels: { ...typographyMetadata(style.axes[axis].labels), showAutoRotate: true },
    ticks: { showLength: true },
  };
}
/** Resolve production menus from retained typography, including values outside the stock list. */
export function createEditorMetadata(
  style: ResolvedApplicationAppearance,
  bindings: Readonly<Record<"category" | "number", AxisBinding>>,
): EditorMetadata {
  return {
    titles: {
      ...typographyMetadata(
        style.title,
        style.subtitle,
        style.axes.category.title,
        style.axes.number.title,
      ),
      spacingBounds: bounds(100),
      optionsByCaption: {
        title: captionOptions(style.title),
        subtitle: captionOptions(style.subtitle),
        horizontalAxisTitle: captionOptions(style.axes.category.title),
        verticalAxisTitle: captionOptions(style.axes.number.title),
      },
    },
    legend: {
      ...typographyMetadata(style.legend),
      positions: ["top", "right", "bottom", "left"].map(namedChoice),
      bounds: {
        spacing: bounds(200),
        markerSize: bounds(40),
        markerStroke: bounds(10),
        itemSpacing: bounds(20),
        horizontalSpacing: bounds(50),
        verticalSpacing: bounds(50),
      },
    },
    padding: { bounds: bounds(200) },
    tooltips: {
      modes: [
        { value: "single", label: "Single" },
        { value: "shared", label: "Multiple" },
        { value: "compact", label: "Compact" },
      ],
    },
    labels: typographyMetadata(style.series.labels),
    markers: {
      shapes: ["square", "circle", "cross", "diamond", "plus", "triangle", "heart"].map(
        namedChoice,
      ),
    },
    axes: {
      category: axisMetadata(style, bindings, "category"),
      number: axisMetadata(style, bindings, "number"),
    },
  };
}
