import { validateSnapshot } from "../compatibility/snapshot";
import type { CartesianTranslationResult } from "./cartesianTypes";
import {
  xyApplicationDiagnostics,
  xyAxisCheck,
  xySeriesCheck,
} from "./xyAppearanceValidation";
import type { XyMappingInput } from "./xyTypes";
export const xyShapes = [
  "circle",
  "square",
  "cross",
  "diamond",
  "plus",
  "triangle",
  "heart",
];
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const size = (v: unknown): boolean => finite(v) && v >= 0;
export function xyFailure(
  message: string,
  status: "invalid" | "unsupported" = "invalid",
): CartesianTranslationResult {
  return { status, diagnostics: [{ code: `${status}-xy`, path: [], message }] };
}
function validOverrides(value: unknown): boolean {
  if (!record(value)) return false;
  return Object.values(value).every(
    (o) =>
      record(o) &&
      ["color", "fill", "stroke", "markerFill", "markerStroke"].every(
        (k) => o[k] === undefined || typeof o[k] === "string",
      ) &&
      ["strokeWidth", "markerStrokeWidth", "lineWidth"].every(
        (k) => o[k] === undefined || size(o[k]),
      ),
  );
}
function validContext(input: XyMappingInput): boolean {
  const c = input.context;
  return (
    record(c) &&
    record(c.observations) &&
    c.observations.kind === "raw-observations" &&
    ["category", "y"].includes(c.labels) &&
    record(c.viewport) &&
    size(c.viewport.width) &&
    size(c.viewport.height) &&
    record(c.display) &&
    [
      "category",
      "numericAxis",
      "crosshair",
      "legend",
      "seriesLabel",
      "tooltipNumber",
    ].every((k) => typeof (c.display as any)[k] === "function") &&
    (c.legendSelection === undefined ||
      (record(c.legendSelection) &&
        Object.values(c.legendSelection).every((v) => typeof v === "boolean")))
  );
}
function validStyle(input: XyMappingInput): boolean {
  const s = input.style;
  if (
    !record(s) ||
    !record(s.common) ||
    !record(s.axes) ||
    !record(s.application)
  )
    return false;
  const c = s.common;
  if (
    typeof c.textColor !== "string" ||
    typeof c.fontFamily !== "string" ||
    !size(c.fontSize) ||
    !Number.isInteger(c.precision) ||
    c.precision < 0 ||
    c.precision > 20 ||
    !size(s.maxSize)
  )
    return false;
  return (
    xyApplicationDiagnostics(s.application).length === 0 &&
    xySeriesCheck(s.series) &&
    validOverrides(s.overrides) &&
    ["x", "y"].every((id) => validAxis(s.axes[id as "x" | "y"]))
  );
}
function validAxis(a: unknown): boolean {
  if (!record(a) || !xyAxisCheck(a.appearance)) return false;
  return (
    (a.min === undefined || finite(a.min)) &&
    (a.max === undefined || finite(a.max)) &&
    !(finite(a.min) && finite(a.max) && a.min >= a.max)
  );
}
function validAssignments(input: XyMappingInput): boolean {
  if (!Array.isArray(input.assignments)) return false;
  const selected = new Set(input.snapshot.selectedColumnIds);
  const numeric = new Set(
    input.snapshot.columns
      .filter((c) => c.role === "number" && selected.has(c.id))
      .map((c) => c.id),
  );
  const ys = new Set<string>();
  return input.assignments.every((a) => {
    if (
      !record(a) ||
      typeof a.xColId !== "string" ||
      typeof a.yColId !== "string" ||
      ys.has(a.yColId)
    )
      return false;
    const ids = [a.xColId, a.yColId];
    if (input.chartType === "bubble") {
      if (typeof a.sizeColId !== "string") return false;
      ids.push(a.sizeColId);
    } else if (a.sizeColId !== undefined) return false;
    ys.add(a.yColId);
    return (
      new Set(ids).size === ids.length && ids.every((id) => numeric.has(id))
    );
  });
}
function unsafeBounds(input: XyMappingInput): boolean {
  return (["x", "y"] as const).some((id) => {
    const spec = input.style.axes[id];
    let low = Infinity,
      high = -Infinity;
    for (const a of input.assignments) {
      if (input.context.legendSelection?.[a.yColId] === false) continue;
      for (const row of input.snapshot.rows) {
        if (
          typeof row.values[a.xColId] !== "number" ||
          typeof row.values[a.yColId] !== "number"
        )
          continue;
        const value = row.values[id === "x" ? a.xColId : a.yColId] as number;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
    if (low === Infinity) return false;
    // ECharts reverses its interval when a lone bound excludes every datum.
    return (
      (spec.min !== undefined && spec.max === undefined && spec.min >= high) ||
      (spec.max !== undefined && spec.min === undefined && spec.max <= low) ||
      !Number.isFinite((spec.max ?? high) - (spec.min ?? low))
    );
  });
}
export function admitXy(
  input: XyMappingInput,
): CartesianTranslationResult | undefined {
  if (!record(input)) return xyFailure("Expected an XY input.");
  const snapshot = validateSnapshot(input.snapshot);
  if (!snapshot.valid)
    return { status: "invalid", diagnostics: snapshot.diagnostics };
  if (
    !["bubble", "scatter"].includes(input.chartType) ||
    !validContext(input) ||
    !validStyle(input) ||
    !validAssignments(input)
  )
    return xyFailure("Malformed XY appearance, context or assignments.");
  if (
    !xyShapes.includes(input.style.series.markers.shape) ||
    ["x", "y"].some(
      (id) =>
        input.style.axes[id as "x" | "y"].appearance.fields.type !== "number",
    )
  )
    return xyFailure(
      "XY requires a supported marker and linear numeric axes.",
      "unsupported",
    );
  if (unsafeBounds(input))
    return xyFailure(
      "Numeric bounds cannot establish a finite nondegenerate automatic extent.",
    );
}
