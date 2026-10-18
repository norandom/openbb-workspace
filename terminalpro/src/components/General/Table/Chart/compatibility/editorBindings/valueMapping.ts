import type { RuntimeOptions } from "../legacyTypes";
import type { AxisBinding, FontEditContext } from "./types";

export const fontPairs = {
  normal: { fontWeight: "normal", fontStyle: "normal" },
  bold: { fontWeight: "bold", fontStyle: "normal" },
  italic: { fontWeight: "normal", fontStyle: "italic" },
  boldItalic: { fontWeight: "bold", fontStyle: "italic" },
} as const;

export function fontLeaf(
  field: string,
  value: string | number | boolean | undefined,
  context: FontEditContext,
): RuntimeOptions {
  if (field === "weight")
    return value === "predefined"
      ? { ...context.predefined }
      : { ...fontPairs[value as keyof typeof fontPairs] };
  const name = field === "font" ? "fontFamily" : field === "size" ? "fontSize" : field;
  return { [name]: value };
}

/** Every style write targets both original positions in the source order. */
export function axisLeaf(binding: AxisBinding, leaf: RuntimeOptions): RuntimeOptions {
  const positions = binding.direction === "x" ? ["bottom", "top"] : ["left", "right"];
  return {
    axes: {
      [binding.optionType]: {
        [positions[0]]: leaf,
        [positions[1]]: structuredClone(leaf),
      },
    },
  };
}

export function legendLeaf(
  field: string,
  value: string | number | boolean,
  font: FontEditContext,
): RuntimeOptions {
  if (["font", "weight", "size", "color"].includes(field))
    return { item: { label: fontLeaf(field, value, font) } };
  const markerKeys: Record<string, string> = {
    markerSize: "size",
    markerStroke: "strokeWidth",
    itemSpacing: "padding",
  };
  if (markerKeys[field]) return { item: { marker: { [markerKeys[field]]: value } } };
  if (field === "horizontalSpacing" || field === "verticalSpacing")
    return {
      item: { [field === "horizontalSpacing" ? "paddingX" : "paddingY"]: value },
    };
  return { [field]: value };
}
