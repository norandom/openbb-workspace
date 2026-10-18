import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { ResolvedCaption, ResolvedFontStyle } from "./appearanceModel";

export type ReadAppearance = (path: string) => unknown;

export function at(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function object(value: unknown): RuntimeOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Appearance branch must be an object");
  }
  return value as RuntimeOptions;
}

export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Appearance text must be a string");
  return value;
}

export function number(value: unknown, minimum = 0, maximum = Number.POSITIVE_INFINITY): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error("Appearance number is outside its finite range");
  }
  return value;
}

export function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Appearance flag must be boolean");
  return value;
}

export function dash(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("Appearance dash must be an array");
  return value.map((entry) => number(entry));
}

export function font(
  read: ReadAppearance,
): ResolvedFontStyle & { font: string; weight: string; size: number; color: string } {
  const fontWeight = read("fontWeight");
  const fontStyle = read("fontStyle");
  if (
    fontWeight !== undefined &&
    typeof fontWeight !== "string" &&
    typeof fontWeight !== "number"
  )
    throw new Error("Invalid font weight");
  if (typeof fontWeight === "number") number(fontWeight);
  if (fontStyle !== undefined) text(fontStyle);
  const normal = fontWeight === undefined || fontWeight === "normal";
  const bold = fontWeight === "bold";
  const italic = fontStyle === "italic";
  const plain = fontStyle === undefined || fontStyle === "normal";
  const weight =
    normal && plain
      ? "normal"
      : bold && plain
        ? "bold"
        : normal && italic
          ? "italic"
          : bold && italic
            ? "boldItalic"
            : "predefined";
  return {
    font: text(read("fontFamily")),
    size: number(read("fontSize")),
    color: text(read("color")),
    weight,
    fontWeight,
    fontStyle: fontStyle as string | undefined,
  };
}

export function caption(read: ReadAppearance): ResolvedCaption {
  return {
    ...font(read),
    enabled: bool(read("enabled")),
    text: text(read("text")),
    spacing: number(read("spacing")),
  };
}

export function child(read: ReadAppearance, prefix: string): ReadAppearance {
  return (path) => read(`${prefix}.${path}`);
}
