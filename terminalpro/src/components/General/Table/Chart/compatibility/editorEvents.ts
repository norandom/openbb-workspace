import type { RuntimeOptions, ValidationResult } from "./legacyTypes";
import type { MapColumnEditorEvent } from "./optionStateTypes";

function dataFields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  if (
    names.length !== keys.length ||
    !names.every((key) => typeof key === "string" && keys.includes(key))
  )
    return undefined;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined;
    result[key] = descriptor.value;
  }
  return result;
}

function mapEvent(event: Record<string, unknown>): ValidationResult<RuntimeOptions> {
  const { kind, value } = event;
  switch (kind) {
    case "title-text":
      if (typeof value === "string")
        return { valid: true, value: { bar: { title: { text: value } } } };
      return { valid: false, error: "event.value for title-text must be a string" };
    case "title-enabled":
      if (typeof value === "boolean")
        return { valid: true, value: { bar: { title: { enabled: value } } } };
      return { valid: false, error: "event.value for title-enabled must be boolean" };
    case "legend-position":
      if (
        value === "top" ||
        value === "bottom" ||
        value === "left" ||
        value === "right"
      ) {
        return { valid: true, value: { bar: { legend: { position: value } } } };
      }
      return {
        valid: false,
        error: "event.value for legend-position must be top, bottom, left or right",
      };
    case "stroke-width":
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return { valid: true, value: { bar: { series: { strokeWidth: value } } } };
      }
      return {
        valid: false,
        error: "event.value for stroke-width must be finite and nonnegative",
      };
    default:
      return { valid: false, error: "event.kind is unsupported" };
  }
}

/** Inspect descriptors before reading values so editor boundary validation cannot invoke getters. */
export const mapColumnEditorEvent: MapColumnEditorEvent = (input) => {
  try {
    const fields = dataFields(input, ["chartType", "event"]);
    if (!fields)
      return {
        valid: false,
        error: "input must contain chartType and event data fields",
      };
    if (fields.chartType !== "groupedColumn" && fields.chartType !== "stackedColumn") {
      return {
        valid: false,
        error: "chartType is unsupported; expected groupedColumn or stackedColumn",
      };
    }
    const event = dataFields(fields.event, ["kind", "value"]);
    if (!event)
      return { valid: false, error: "event must contain kind and value data fields" };
    if (event.kind === "tooltip-mode") {
      if (fields.chartType !== "groupedColumn")
        return { valid: false, error: "tooltip-mode is unresolved for stackedColumn" };
      const { value } = event;
      if (value === "single" || value === "shared" || value === "compact")
        return { valid: true, value: { bar: { tooltip: { mode: value } } } };
      return {
        valid: false,
        error: "event.value for tooltip-mode must be single, shared or compact",
      };
    }
    return mapEvent(event);
  } catch {
    return { valid: false, error: "input or event could not be safely inspected" };
  }
};
