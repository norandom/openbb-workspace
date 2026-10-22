import { validateSnapshot } from "../compatibility/snapshot";
import type {
  RangeAreaAxisPaint,
  RangeAreaMappingInput,
  RangeAreaTranslationResult,
} from "./rangeAreaTypes";
import { copyRangeData } from "./rangeBarAdmission";
import { admitCategoryStyle } from "./rangeCategoryAdmission";

type Failure = Exclude<RangeAreaTranslationResult, { status: "supported" }>;
export const rangeRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const size = (v: unknown): v is number => finite(v) && v >= 0;
const ratio = (v: unknown): v is number => size(v) && v <= 1;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const choice = (v: unknown, values: readonly string[]): boolean =>
  typeof v === "string" && values.includes(v);
export function rangeFailure(
  message: string,
  status: "invalid" | "unsupported" = "invalid",
): Failure {
  return { status, diagnostics: [{ code: `${status}-range-area`, path: [], message }] };
}
function font(v: unknown): boolean {
  if (!rangeRecord(v)) return false;
  return (
    text(v.font) &&
    text(v.color) &&
    size(v.size) &&
    choice(v.weight, ["normal", "bold", "italic", "boldItalic", "predefined"]) &&
    (v.fontWeight === undefined || text(v.fontWeight) || finite(v.fontWeight)) &&
    (v.fontStyle === undefined || choice(v.fontStyle, ["normal", "italic", "oblique"]))
  );
}
function axis(v: unknown): v is RangeAreaAxisPaint {
  if (
    !rangeRecord(v) ||
    !rangeRecord(v.fields) ||
    !rangeRecord(v.labels) ||
    !rangeRecord(v.ticks)
  )
    return false;
  const { fields: f, labels: l, ticks: t } = v;
  return (
    text(f.type) &&
    typeof f.timeFormat === "string" &&
    choice(f.position, ["top", "bottom", "left", "right"]) &&
    text(f.color) &&
    size(f.thickness) &&
    font(l) &&
    size(l.padding) &&
    typeof l.autoRotate === "boolean" &&
    (l.rotation === undefined || finite(l.rotation)) &&
    typeof t.enabled === "boolean" &&
    text(t.color) &&
    size(t.width) &&
    size(t.length) &&
    typeof v.lineEnabled === "boolean"
  );
}
function areaField(v: Record<string, unknown>): boolean {
  const m = v.marker;
  const h = v.shadow;
  const i = v.interpolation;
  if (!rangeRecord(m) || !rangeRecord(h) || !rangeRecord(i)) return false;
  return (
    typeof v.connectMissingData === "boolean" &&
    typeof m.enabled === "boolean" &&
    choice(m.shape, [
      "square",
      "circle",
      "cross",
      "diamond",
      "plus",
      "triangle",
      "heart",
    ]) &&
    size(m.size) &&
    size(m.strokeWidth) &&
    text(m.fill) &&
    text(m.stroke) &&
    ratio(m.fillOpacity) &&
    ratio(m.strokeOpacity) &&
    typeof h.enabled === "boolean" &&
    text(h.color) &&
    size(h.blur) &&
    finite(h.xOffset) &&
    finite(h.yOffset) &&
    (i.type === "linear" ||
      (i.type === "smooth" && ratio(i.tension)) ||
      (i.type === "step" && choice(i.position, ["start", "middle", "end"])))
  );
}
function field(v: unknown): boolean {
  if (!rangeRecord(v) || !rangeRecord(v.label)) return false;
  const l = v.label;
  return (
    text(v.fill) &&
    ratio(v.fillOpacity) &&
    text(v.stroke) &&
    size(v.strokeWidth) &&
    ratio(v.strokeOpacity) &&
    Array.isArray(v.lineDash) &&
    v.lineDash.every(size) &&
    finite(v.lineDashOffset) &&
    areaField(v) &&
    font(l) &&
    typeof l.enabled === "boolean" &&
    choice(l.placement, ["inside", "outside"]) &&
    size(l.spacing) &&
    size(l.padding)
  );
}
function scaleValid(v: unknown): boolean {
  if (v === null) return true;
  if (
    !rangeRecord(v) ||
    !finite(v.min) ||
    !finite(v.max) ||
    v.min > v.max ||
    !Array.isArray(v.ticks) ||
    (v.reverse !== undefined && typeof v.reverse !== "boolean")
  )
    return false;
  const { min, max } = v;
  return (
    (min === max || (Number.isFinite(max - min) && max - min > 0)) &&
    v.ticks.every(
      (t: unknown, i: number, ticks: unknown[]) =>
        finite(t) && t >= min && t <= max && (i === 0 || t > (ticks[i - 1] as number)),
    )
  );
}
function styleValid(s: RangeAreaMappingInput["style"]): boolean {
  if (
    !rangeRecord(s) ||
    !rangeRecord(s.band) ||
    !rangeRecord(s.fields) ||
    !rangeRecord(s.tooltip)
  )
    return false;
  const b = s.band;
  return (
    !Object.hasOwn(s, "direction") &&
    axis(s.categoryAxis) &&
    axis(s.numberAxis) &&
    scaleValid(s.valueScale) &&
    ratio(b.paddingInner) &&
    b.paddingInner < 1 &&
    ratio(b.paddingOuter) &&
    b.paddingOuter <= 0.5 &&
    !Object.hasOwn(b, "groupPaddingInner") &&
    Object.values(s.fields).every(field) &&
    typeof s.tooltip.enabled === "boolean" &&
    ["single", "shared", "compact"].includes(s.tooltip.mode)
  );
}
export function rangeLegendValid(v: unknown, ids: readonly string[]): boolean {
  return (
    v === undefined ||
    (rangeRecord(v) &&
      Object.entries(v).every(
        ([id, enabled]) => ids.includes(id) && typeof enabled === "boolean",
      ))
  );
}
function contextValid(
  c: RangeAreaMappingInput["context"],
  ids: readonly string[],
): boolean {
  if (
    !rangeRecord(c) ||
    !rangeRecord(c.viewport) ||
    !rangeRecord(c.plot) ||
    !rangeRecord(c.display)
  )
    return false;
  const v = c.viewport;
  const p = c.plot;
  return (
    finite(v.width) &&
    v.width > 0 &&
    finite(v.height) &&
    v.height > 0 &&
    size(p.left) &&
    size(p.top) &&
    finite(p.width) &&
    p.width >= 0 &&
    finite(p.height) &&
    p.height >= 0 &&
    p.left + p.width <= v.width &&
    p.top + p.height <= v.height &&
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
    rangeLegendValid(c.legendSelection, ids)
  );
}
export function rangeDisplayText(value: unknown): string {
  if (typeof value === "string" || finite(value)) return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return String(value);
  throw Error("Range Area display callback returned invalid text.");
}
export function admitRangeArea(
  value: RangeAreaMappingInput,
): { readonly input: RangeAreaMappingInput } | Failure {
  const input = copyRangeData(value) as RangeAreaMappingInput;
  if (!rangeRecord(input)) return rangeFailure("Expected Range Area input.");
  const snapshot = validateSnapshot(input.snapshot, "xy-coordinates");
  if (!snapshot.valid) return { status: "invalid", diagnostics: snapshot.diagnostics };
  const mode = input.style?.tooltip?.mode;
  if (typeof mode === "string" && !["single", "shared", "compact"].includes(mode))
    return rangeFailure("Unsupported Range Area tooltip mode.", "unsupported");
  if (
    rangeRecord(input.style?.fields) &&
    Object.values(input.style.fields).some(
      (v) =>
        rangeRecord(v) &&
        ((rangeRecord(v.marker) &&
          !choice(v.marker.shape, [
            "square",
            "circle",
            "cross",
            "diamond",
            "plus",
            "triangle",
            "heart",
          ])) ||
          (rangeRecord(v.interpolation) &&
            (!choice(v.interpolation.type, ["linear", "smooth", "step"]) ||
              (v.interpolation.type === "step" &&
                !choice(v.interpolation.position, ["start", "middle", "end"]))))),
    )
  )
    return rangeFailure(
      "Unsupported Range Area marker or interpolation.",
      "unsupported",
    );
  const ids = snapshot.snapshot.selectedColumnIds.filter(
    (id) => id !== snapshot.snapshot.categoryColumnId,
  );
  if (
    !styleValid(input.style) ||
    !contextValid(input.context, ids) ||
    Object.keys(input.style.fields).length !== ids.length ||
    ids.some((id) => !Object.hasOwn(input.style.fields, id))
  )
    return rangeFailure("Malformed Range Area paint, scale, geometry or identities.");
  const { categoryAxis: c, numberAxis: n } = input.style;
  admitCategoryStyle(input.style);
  if (
    n.fields.type !== "number" ||
    !["top", "bottom"].includes(c.fields.position) ||
    !["left", "right"].includes(n.fields.position) ||
    [c, n].some((a) => a.labels.autoRotate && a.labels.rotation === undefined)
  )
    return rangeFailure(
      "Range Area requires resolved category/number axes and rotation.",
      "unsupported",
    );
  return { input: { ...input, snapshot: snapshot.snapshot } };
}
