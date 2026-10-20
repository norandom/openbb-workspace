import { xyApplicationDiagnostics, xyAxisCheck } from "./xyAppearanceValidation";
import type { HistogramMappingInput } from "./histogramTypes";

type Check = (v: unknown) => boolean;
export const histogramRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const size: Check = v => finite(v) && v >= 0;
const text: Check = v => typeof v === "string";
const bool: Check = v => typeof v === "boolean";
const opacity: Check = v => finite(v) && v >= 0 && v <= 1;
const dense = (v: unknown, check: Check): boolean => Array.isArray(v) && Array.from(v).every(check);
const optional = (check: Check): Check => v => v === undefined || check(v);
const object = (schema: Record<string, Check>): Check => v =>
  histogramRecord(v) && Object.entries(schema).every(([k, check]) => check(v[k]));
const font = {
  font: text, weight: text, color: text, size,
  fontWeight: optional(v => text(v) || finite(v)),
  fontStyle: optional(v => typeof v === "string" && ["normal", "italic", "oblique"].includes(v)),
};
const series = object({
  strokeWidth: size, strokeOpacity: opacity, fillOpacity: opacity,
  fill: optional(text), stroke: optional(text),
  lineDash: v => dense(v, size),
  shadow: object({ enabled: bool, color: text, blur: size, xOffset: finite, yOffset: finite }),
  labels: object({ ...font, enabled: bool }),
});
const common = object({
  textColor: text, fontFamily: text, fontSize: size,
  precision: v => finite(v) && Number.isInteger(v) && v >= 0 && v <= 20,
});
function axis(value: unknown, positions: readonly string[]): boolean {
  if (!histogramRecord(value) || !xyAxisCheck(value.appearance)) return false;
  const a = value.appearance;
  if (!histogramRecord(a) || !histogramRecord(a.fields)) return false;
  return dense(a.gridStyles, style => histogramRecord(style) && dense(style.lineDash, size)) &&
    positions.includes(String(a.fields.position)) &&
    (value.min === undefined || finite(value.min)) &&
    (value.max === undefined || finite(value.max)) &&
    !(finite(value.min) && finite(value.max) && value.min >= value.max);
}
export function histogramStyleValid(input: HistogramMappingInput): boolean {
  const s = input.style;
  return histogramRecord(s) && common(s.common) && histogramRecord(s.application) &&
    xyApplicationDiagnostics(s.application).length === 0 && series(s.series) &&
    dense(s.application.palette.fills, text) && dense(s.application.palette.strokes, text) &&
    histogramRecord(s.axes) && axis(s.axes.x, ["bottom", "top"]) && axis(s.axes.y, ["left", "right"]);
}
export function histogramContextValid(value: unknown): boolean {
  if (!histogramRecord(value) || !histogramRecord(value.viewport) || !histogramRecord(value.display)) return false;
  const display = value.display;
  return size(value.viewport.width) && size(value.viewport.height) &&
    ["category", "numericAxis", "crosshair", "legend", "seriesLabel", "tooltipNumber"]
      .every(k => typeof display[k] === "function") &&
    (value.legendSelection === undefined || (histogramRecord(value.legendSelection) &&
      Object.values(value.legendSelection).every(bool)));
}
