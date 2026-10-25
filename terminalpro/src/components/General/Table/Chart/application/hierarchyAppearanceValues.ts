import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  HierarchyAutoLabel,
  HierarchyFill,
  HierarchyGroupLabel,
  HierarchyLabelBox,
} from "./hierarchyPaintTypes";
import {
  at,
  bool,
  child,
  font,
  number,
  object,
  text,
  type ReadAppearance,
} from "./effectiveAppearanceValues";

export function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw Error("Invalid hierarchy choice");
  return value as T;
}
export function freezeHierarchy<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeHierarchy);
    Object.freeze(value);
  }
  return value;
}
function optionalFields(
  value: RuntimeOptions,
  numeric: readonly string[],
  strings: readonly string[],
  opacity: readonly string[] = [],
) {
  for (const key of numeric)
    if (value[key] !== undefined)
      number(value[key], key === "rotation" ? Number.NEGATIVE_INFINITY : 0);
  for (const key of strings) if (value[key] !== undefined) text(value[key]);
  for (const key of opacity) if (value[key] !== undefined) number(value[key], 0, 1);
}
function gradient(value: RuntimeOptions) {
  optionalFields(value, ["rotation"], []);
  if (value.gradient !== undefined)
    choice(value.gradient, ["linear", "radial", "conic"]);
  if (value.bounds !== undefined) choice(value.bounds, ["axis", "item", "series"]);
  if (value.reverse !== undefined) bool(value.reverse);
  if (value.colorStops !== undefined) {
    if (!Array.isArray(value.colorStops) || value.colorStops.length < 2)
      throw Error("Invalid hierarchy gradient stops");
    let previous = Number.NEGATIVE_INFINITY;
    for (const stop of value.colorStops) {
      const data = object(stop);
      if (data.color !== undefined) text(data.color);
      if (data.stop !== undefined) {
        const position = number(data.stop, 0, 1);
        if (position < previous) throw Error("Unordered hierarchy gradient stops");
        previous = position;
      }
    }
  }
}
function pattern(value: RuntimeOptions) {
  optionalFields(
    value,
    ["width", "height", "rotation", "scale", "strokeWidth", "padding"],
    ["path", "fill", "backgroundFill", "stroke"],
    ["fillOpacity", "backgroundFillOpacity", "strokeOpacity"],
  );
  if (value.path !== undefined && text(value.path).length < 2)
    throw Error("Invalid hierarchy pattern path");
  if (value.pattern !== undefined)
    choice(value.pattern, [
      "vertical-lines",
      "horizontal-lines",
      "forward-slanted-lines",
      "backward-slanted-lines",
      "circles",
      "squares",
      "triangles",
      "diamonds",
      "stars",
      "hearts",
      "crosses",
    ]);
}
function image(value: RuntimeOptions) {
  text(value.url);
  optionalFields(
    value,
    ["width", "height", "rotation"],
    ["backgroundFill"],
    ["backgroundFillOpacity"],
  );
  if (value.fit !== undefined)
    choice(value.fit, ["stretch", "contain", "cover", "none"]);
  if (value.repeat !== undefined)
    choice(value.repeat, ["repeat", "repeat-x", "repeat-y", "no-repeat"]);
}
/** Retained advanced fills remain data; renderer admission is a separate compatibility gate. */
export function hierarchyFill(value: unknown): HierarchyFill {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) throw Error("Missing hierarchy fill");
  const data = object(value);
  if (data.type === "gradient") gradient(data);
  else if (data.type === "pattern") pattern(data);
  else if (data.type === "image") image(data);
  else throw Error("Invalid hierarchy fill type");
  return structuredClone(data) as unknown as HierarchyFill;
}
export function hierarchyArray<T>(value: unknown, resolve: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw Error("Invalid hierarchy palette");
  return value.map(resolve);
}
function boxing(read: ReadAppearance): HierarchyLabelBox {
  const result: Record<string, unknown> = {};
  if (read("fill") !== undefined) result.fill = hierarchyFill(read("fill"));
  if (read("fillOpacity") !== undefined)
    result.fillOpacity = number(read("fillOpacity"), 0, 1);
  if (read("cornerRadius") !== undefined)
    result.cornerRadius = number(read("cornerRadius"));
  const padding = read("padding");
  if (padding !== undefined)
    result.padding =
      typeof padding === "number"
        ? number(padding)
        : Object.fromEntries(
            Object.entries(object(padding)).map(([key, value]) => [
              choice(key, ["top", "right", "bottom", "left"]),
              number(value),
            ]),
          );
  if (read("border") !== undefined) {
    const border = object(read("border"));
    const outline: Record<string, unknown> = {};
    for (const key of ["enabled", "stroke", "strokeWidth", "strokeOpacity"]) {
      if (border[key] !== undefined)
        outline[key] =
          key === "enabled"
            ? bool(border[key])
            : key === "stroke"
              ? text(border[key])
              : number(
                  border[key],
                  0,
                  key === "strokeOpacity" ? 1 : Number.POSITIVE_INFINITY,
                );
    }
    result.border = outline;
  }
  return result;
}
export function hierarchyLabel(read: ReadAppearance): HierarchyGroupLabel {
  return {
    ...font(read),
    ...boxing(read),
    enabled: bool(read("enabled")),
    spacing: number(read("spacing")),
  };
}
export function hierarchyAutoLabel(read: ReadAppearance): HierarchyAutoLabel {
  return {
    ...hierarchyLabel(read),
    minimumFontSize: number(read("minimumFontSize")),
    ...(read("lineHeight") === undefined
      ? {}
      : { lineHeight: number(read("lineHeight")) }),
    wrapping: choice(read("wrapping"), ["never", "always", "hyphenate", "on-space"]),
    overflowStrategy: choice(read("overflowStrategy"), ["ellipsis", "hide"]),
  };
}
export function hierarchyPaint(read: ReadAppearance) {
  return {
    ...(read("fill") === undefined ? {} : { fill: hierarchyFill(read("fill")) }),
    ...(read("stroke") === undefined ? {} : { stroke: text(read("stroke")) }),
    fillOpacity: number(read("fillOpacity"), 0, 1),
    strokeOpacity: number(read("strokeOpacity"), 0, 1),
    strokeWidth: number(read("strokeWidth")),
    cornerRadius: number(read("cornerRadius")),
    textAlign: choice(read("textAlign"), ["left", "center", "right"]),
    padding: number(read("padding")),
    gap: number(read("gap")),
  };
}
export function hierarchyGradient(read: ReadAppearance) {
  return {
    enabled: bool(read("enabled")),
    position: choice(read("position"), ["top", "right", "bottom", "left"]),
    reverseOrder: bool(read("reverseOrder")),
    spacing: number(read("spacing")),
    gradient: {
      thickness: number(read("gradient.thickness")),
      preferredLength: number(read("gradient.preferredLength")),
    },
    label: font(child(read, "scale.label")),
  };
}
export function hierarchyPalette(effective: RuntimeOptions) {
  const read = (path: string) => at(effective, `series.${path}`);
  return {
    fills: hierarchyArray(read("fills"), hierarchyFill),
    strokes: hierarchyArray(read("strokes"), text),
    hierarchyColors: hierarchyArray(read("undocumentedGroupFills"), text),
    secondHierarchyColors: hierarchyArray(read("undocumentedGroupStrokes"), text),
    colorRange: hierarchyArray(read("colorRange"), text),
  };
}
export function validateHierarchyPalettes(layers: readonly RuntimeOptions[]) {
  for (const layer of layers) {
    for (const key of [
      "fills",
      "strokes",
      "undocumentedGroupFills",
      "undocumentedGroupStrokes",
      "colorRange",
    ]) {
      const value = at(layer, `series.${key}`);
      if (value !== undefined && !Array.isArray(value))
        throw Error("Hierarchy palette must be an array");
    }
  }
}
