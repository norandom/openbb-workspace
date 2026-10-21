import { validateSnapshot } from "../compatibility/snapshot";
import type {
  BoxPlotMappingInput,
  BoxPlotTranslationResult,
  ResolvedBoxFieldStyle,
} from "./boxPlotTypes";
import { xyApplicationDiagnostics, xyAxisCheck } from "./xyAppearanceValidation";

type Failure = Exclude<BoxPlotTranslationResult, { status: "supported" }>;
export function boxFailure(
  message: string,
  status: "invalid" | "unsupported" = "invalid",
): Failure {
  return { status, diagnostics: [{ code: `${status}-box-plot`, path: [], message }] };
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const size = (v: unknown): v is number => finite(v) && v >= 0;
const ratio = (v: unknown): v is number => size(v) && v <= 1;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Inspect descriptors before reading: callbacks are capabilities, accessors are not data. */
function copyData(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw Error("Nonfinite input.");
    if (typeof value === "symbol" || typeof value === "bigint")
      throw Error("Expected plain data.");
    return value;
  }
  if (ancestors.has(value)) throw Error("Cyclic input.");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null)
    throw Error("Expected plain record.");
  if (Object.getOwnPropertySymbols(value).length)
    throw Error("Unexpected symbol property.");
  const next = new Set(ancestors).add(value);
  const result: Record<string, unknown> | unknown[] = array ? [] : Object.create(null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (array)
    for (let n = 0; n < value.length; n++)
      if (!Object.hasOwn(descriptors, n)) throw Error("Sparse array.");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!Object.hasOwn(descriptor, "value")) throw Error("Accessor input.");
    if (array && key === "length") continue;
    Object.defineProperty(result, key, {
      value: copyData(descriptor.value, next),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
function stroke(v: unknown): boolean {
  return (
    record(v) &&
    text(v.stroke) &&
    size(v.strokeWidth) &&
    ratio(v.strokeOpacity) &&
    Array.isArray(v.lineDash) &&
    v.lineDash.every(size) &&
    finite(v.lineDashOffset)
  );
}
function field(v: unknown): v is ResolvedBoxFieldStyle {
  return (
    record(v) &&
    stroke(v) &&
    (v.visible === undefined || typeof v.visible === "boolean") &&
    (v.showInMiniChart === undefined || typeof v.showInMiniChart === "boolean") &&
    text(v.fill) &&
    ratio(v.fillOpacity) &&
    stroke(v.whisker) &&
    record(v.cap) &&
    ratio(v.cap.lengthRatio)
  );
}
function styleValid(s: BoxPlotMappingInput["style"]): boolean {
  if (
    !record(s) ||
    !record(s.common) ||
    !record(s.axes) ||
    !record(s.axes.number) ||
    !record(s.band)
  )
    return false;
  const c = s.common;
  const b = s.band;
  const n = s.axes.number;
  return (
    text(c.textColor) &&
    text(c.fontFamily) &&
    size(c.fontSize) &&
    Number.isInteger(c.precision) &&
    c.precision >= 0 &&
    c.precision <= 20 &&
    xyApplicationDiagnostics(s.application).length === 0 &&
    xyAxisCheck(s.axes.category) &&
    xyAxisCheck(n.appearance) &&
    (n.min === undefined || finite(n.min)) &&
    (n.max === undefined || finite(n.max)) &&
    !(n.min !== undefined && n.max !== undefined && n.min > n.max) &&
    ratio(b.paddingInner) &&
    b.paddingInner < 1 &&
    ratio(b.paddingOuter) &&
    b.paddingOuter <= 0.5 &&
    ratio(b.groupPaddingInner) &&
    record(s.fields) &&
    Object.values(s.fields).every(field) &&
    ["vertical", "horizontal"].includes(s.direction)
  );
}
function contextValid(
  c: BoxPlotMappingInput["context"],
  ids: readonly string[],
): boolean {
  if (!record(c) || !record(c.viewport) || !record(c.display)) return false;
  return (
    navigationValid(c.navigation) &&
    size(c.viewport.width) &&
    c.viewport.width > 0 &&
    size(c.viewport.height) &&
    c.viewport.height > 0 &&
    (
      [
        "category",
        "numericAxis",
        "crosshair",
        "legend",
        "seriesLabel",
        "tooltipNumber",
      ] as const
    ).every((k) => typeof c.display[k] === "function") &&
    (c.legendSelection === undefined ||
      (record(c.legendSelection) &&
        Object.entries(c.legendSelection).every(
          ([id, enabled]) => ids.includes(id) && typeof enabled === "boolean",
        )))
  );
}
function navigationValid(n: BoxPlotMappingInput["context"]["navigation"]): boolean {
  if (n === undefined) return true;
  return (
    record(n) &&
    typeof n.enabled === "boolean" &&
    typeof n.mini === "boolean" &&
    record(n.theme) &&
    record(n.theme.colors) &&
    (n.window === undefined ||
      (record(n.window) &&
        finite(n.window.start) &&
        finite(n.window.end) &&
        n.window.start >= 0 &&
        n.window.end <= 100 &&
        n.window.start <= n.window.end))
  );
}
export function boxDisplayText(value: unknown): string {
  if (typeof value === "string" || finite(value)) return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return String(value);
  throw Error("Box display callback returned an invalid value.");
}
export function admitBoxPlot(
  value: BoxPlotMappingInput,
): { readonly input: BoxPlotMappingInput } | Failure {
  const input = copyData(value) as BoxPlotMappingInput;
  if (!record(input)) return boxFailure("Expected a Box Plot input.");
  const snapshot = validateSnapshot(input.snapshot, "xy-coordinates");
  if (!snapshot.valid) return { status: "invalid", diagnostics: snapshot.diagnostics };
  const tooltip = input.style?.application?.tooltip;
  if (
    tooltip &&
    typeof tooltip.mode === "string" &&
    !["single", "shared", "compact"].includes(tooltip.mode)
  )
    return boxFailure("Unsupported Box Plot tooltip mode.", "unsupported");
  const ids = snapshot.snapshot.selectedColumnIds.filter(
    (id) => id !== snapshot.snapshot.categoryColumnId,
  );
  if (
    !styleValid(input.style) ||
    !contextValid(input.context, ids) ||
    Object.keys(input.style.fields).length !== ids.length ||
    ids.some((id) => !Object.hasOwn(input.style.fields, id))
  )
    return boxFailure("Malformed Box Plot appearance, field identity or context.");
  const { category, number } = input.style.axes;
  const vertical = input.style.direction === "vertical";
  if (
    category.fields.type !== "category" ||
    number.appearance.fields.type !== "number" ||
    !(vertical ? ["bottom", "top"] : ["left", "right"]).includes(
      category.fields.position,
    ) ||
    !(vertical ? ["left", "right"] : ["bottom", "top"]).includes(
      number.appearance.fields.position,
    )
  )
    return boxFailure(
      "Box Plot requires compatible category and numeric axis positions.",
      "unsupported",
    );
  return { input: { ...input, snapshot: snapshot.snapshot } };
}
