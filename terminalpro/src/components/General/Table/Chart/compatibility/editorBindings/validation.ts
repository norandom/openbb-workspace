import { color } from "echarts/core";
import { fontPairs } from "./valueMapping";

type Data = Record<string, unknown>;
export function record(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an editor data object");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new Error("Expected a plain editor data object");
  const result: Data = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      ["__proto__", "prototype", "constructor"].includes(key) ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    )
      throw new Error("Expected enumerable editor data properties");
    result[key] = descriptor.value;
  }
  return result;
}
export function keys(
  value: Data,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  if (
    !required.every((key) => Object.hasOwn(value, key)) ||
    !Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  )
    throw new Error("Unexpected editor fields");
}
export function binding(value: unknown) {
  const data = record(value);
  keys(data, ["axis", "optionType", "direction"]);
  if (
    typeof data.axis !== "string" ||
    !["category", "number"].includes(data.axis) ||
    typeof data.optionType !== "string" ||
    !["category", "number", "time", "grouped-category"].includes(data.optionType) ||
    typeof data.direction !== "string" ||
    !["x", "y"].includes(data.direction)
  )
    throw new Error("Invalid axis binding");
}
export function fontContext(value: unknown) {
  const data = record(value);
  keys(data, ["predefined"]);
  const pair = record(data.predefined);
  keys(pair, ["fontWeight", "fontStyle"]);
  if (
    pair.fontWeight !== undefined &&
    typeof pair.fontWeight !== "string" &&
    !(typeof pair.fontWeight === "number" && Number.isFinite(pair.fontWeight))
  )
    throw new Error("Invalid font weight context");
  if (pair.fontStyle !== undefined && typeof pair.fontStyle !== "string")
    throw new Error("Invalid font style context");
}
type Rule =
  | "boolean"
  | "text"
  | "font"
  | "weight"
  | "color"
  | "nonnegative"
  | "opacity"
  | "offset"
  | "rotation"
  | readonly string[];
const typography = {
  font: "font",
  weight: "weight",
  color: "color",
  size: "nonnegative",
} as const;
const rules: Record<string, Record<string, Rule>> = {
  titles: { ...typography, enabled: "boolean", text: "text", spacing: "nonnegative" },
  legend: {
    ...typography,
    enabled: "boolean",
    position: ["top", "bottom", "left", "right"],
    spacing: "nonnegative",
    markerSize: "nonnegative",
    markerStroke: "nonnegative",
    itemSpacing: "nonnegative",
    horizontalSpacing: "nonnegative",
    verticalSpacing: "nonnegative",
  },
  padding: {
    top: "nonnegative",
    right: "nonnegative",
    bottom: "nonnegative",
    left: "nonnegative",
  },
  background: { visible: "boolean", fill: "color" },
  tooltips: { enabled: "boolean", mode: ["single", "shared", "compact"] },
  series: {
    strokeWidth: "nonnegative",
    lineDash: "nonnegative",
    strokeOpacity: "opacity",
    fillOpacity: "opacity",
  },
  shadow: {
    enabled: "boolean",
    color: "color",
    blur: "nonnegative",
    xOffset: "offset",
    yOffset: "offset",
  },
  labels: { ...typography, enabled: "boolean" },
  markers: {
    enabled: "boolean",
    shape: ["square", "circle", "cross", "diamond", "plus", "triangle", "heart"],
    size: "nonnegative",
    strokeWidth: "nonnegative",
  },
  axis: { color: "color", thickness: "nonnegative" },
  axisLabels: {
    ...typography,
    padding: "nonnegative",
    autoRotate: "boolean",
    rotation: "rotation",
  },
  grid: {
    enabled: "boolean",
    color: "color",
    thickness: "nonnegative",
    lineDash: "nonnegative",
  },
  ticks: {
    enabled: "boolean",
    color: "color",
    width: "nonnegative",
    length: "nonnegative",
  },
};
function validValue(rule: Rule | undefined, value: unknown): boolean {
  if (!rule) return false;
  if (Array.isArray(rule)) return typeof value === "string" && rule.includes(value);
  if (rule === "boolean") return typeof value === "boolean";
  if (rule === "text") return typeof value === "string";
  if (rule === "font") return typeof value === "string" && value.trim().length > 0;
  if (rule === "weight")
    return (
      value === "predefined" ||
      (typeof value === "string" && Object.hasOwn(fontPairs, value))
    );
  if (rule === "color") return typeof value === "string" && !!color.parse(value);
  if (rule === "rotation" && value === undefined) return true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (rule === "opacity") return value >= 0 && value <= 1;
  if (rule === "rotation")
    return Number.isInteger(value) && value >= -180 && value < 180;
  if (rule === "offset") return value >= -10;
  return value >= 0;
}
export function validateEdit(panel: string, value: unknown) {
  const data = record(value);
  keys(
    data,
    panel === "titles"
      ? ["caption", "field", "value"]
      : panel === "padding"
        ? ["side", "value"]
        : ["field", "value"],
  );
  if (
    panel === "titles" &&
    (typeof data.caption !== "string" ||
      !["title", "subtitle", "horizontalAxisTitle", "verticalAxisTitle"].includes(
        data.caption,
      ))
  )
    throw new Error("Unknown caption");
  const field = panel === "padding" ? data.side : data.field;
  if (
    typeof field !== "string" ||
    !Object.hasOwn(rules, panel) ||
    !Object.hasOwn(rules[panel], field) ||
    !validValue(rules[panel][field], data.value)
  )
    throw new Error("Invalid editor field or value");
}
export function styleContext(value: unknown) {
  const data = record(value);
  keys(data, ["stroke", "lineDash"]);
  if (!validValue("color", data.stroke) || !numericArray(data.lineDash))
    throw new Error("Invalid first grid style");
}
function numericArray(value: unknown) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => {
    if (key === "length") return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === "string" &&
      /^(0|[1-9]\d*)$/.test(key) &&
      !!descriptor?.enumerable &&
      "value" in descriptor &&
      validValue("nonnegative", descriptor.value)
    );
  });
}
