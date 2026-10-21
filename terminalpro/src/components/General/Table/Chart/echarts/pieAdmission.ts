import { resolvePieAssignments } from "../compatibility/pieAssignments";
import { validateSnapshot } from "../compatibility/snapshot";
import type { CartesianTranslationResult } from "./cartesianTypes";
import type { PieMappingInput } from "./pieTypes";
import { xyApplicationDiagnostics } from "./xyAppearanceValidation";

type Check = (v: unknown) => boolean;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text: Check = (v) => typeof v === "string";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const size: Check = (v) => finite(v) && v >= 0;
const ratio: Check = (v) => size(v) && (v as number) <= 1;
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
const dense = (v: unknown, check: Check): boolean =>
  Array.isArray(v) &&
  Array.from(
    { length: v.length },
    (_, i) => Object.hasOwn(v, i) && check(v[i]),
  ).every(Boolean);
const palette: Check = (v) => dense(v, text) && (v as unknown[]).length > 0;
const object =
  (schema: Record<string, Check>): Check =>
  (v) =>
    record(v) && Object.entries(schema).every(([k, check]) => check(v[k]));
const font = object({
  enabled: (v) => typeof v === "boolean",
  font: text,
  size,
  color: text,
  weight: text,
  fontWeight: optional((v) => text(v) || finite(v)),
  fontStyle: optional((v) =>
    ["normal", "italic", "oblique"].includes(v as string),
  ),
});
const shadow = object({
  enabled: (v) => typeof v === "boolean",
  color: text,
  blur: size,
  xOffset: finite,
  yOffset: finite,
});
const paint = object({
  strokeWidth: size,
  strokeOpacity: ratio,
  fillOpacity: ratio,
  lineDash: (v) => dense(v, size),
  shadow,
  fill: optional(text),
  stroke: optional(text),
});

export function pieFailure(message: string): CartesianTranslationResult {
  return {
    status: "invalid",
    diagnostics: [{ code: "invalid-pie", path: [], message }],
  };
}
function validStyle(s: PieMappingInput["style"]): boolean {
  if (!record(s) || !record(s.common) || !record(s.series)) return false;
  const c = s.common;
  const p = s.series;
  return (
    text(c.textColor) &&
    text(c.fontFamily) &&
    size(c.fontSize) &&
    Number.isInteger(c.precision) &&
    c.precision >= 0 &&
    c.precision <= 20 &&
    xyApplicationDiagnostics(s.application).length === 0 &&
    palette(s.application.palette.fills) &&
    palette(s.application.palette.strokes) &&
    object({ maxHeight: optional(size), maxWidth: optional(size), markerShape: text })(s.legendLayout) &&
    paint(p.paint) &&
    font(p.title) &&
    size(p.title.spacing) &&
    finite(p.rotation) &&
    ratio(p.outerRadiusRatio) &&
    optional(ratio)(p.innerRadiusRatio) &&
    font(p.calloutLabel) &&
    size(p.calloutLabel.offset) &&
    size(p.calloutLabel.minAngle) &&
    p.calloutLabel.minAngle <= 360 &&
    object({ length: size, strokeWidth: size, colors: optional(palette) })(
      p.calloutLine,
    ) &&
    font(p.sectorLabel) &&
    ratio(p.sectorLabel.positionRatio) &&
    finite(p.sectorLabel.positionOffset)
  );
}
function validContext(c: PieMappingInput["context"]): boolean {
  return (
    record(c) &&
    record(c.observations) &&
    c.observations.kind === "raw-observations" &&
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
    (c.aggFunc === undefined ||
      ["sum", "first", "last", "min", "max", "count", "avg"].includes(
        c.aggFunc,
      )) &&
    (c.legendSelection === undefined ||
      (record(c.legendSelection) &&
        Object.values(c.legendSelection).every((v) => typeof v === "boolean")))
  );
}
function canonicalAssignment(input: PieMappingInput) {
  if (!record(input.assignment) || input.assignment.status !== "resolved")
    throw Error("Missing resolved assignment");
  const numeric = new Set(
    input.snapshot.columns.filter((c) => c.role === "number").map((c) => c.id),
  );
  const resolved = resolvePieAssignments({
    chartType: input.assignment.chartType,
    valueColumns: input.snapshot.selectedColumnIds
      .filter((id) => numeric.has(id))
      .map((colId) => ({ colId, selected: true })),
  });
  if (
    resolved.status !== "resolved" ||
    input.assignment.seriesType !== resolved.seriesType ||
    !dense(input.assignment.assignments, record) ||
    input.assignment.assignments.length !== resolved.assignments.length ||
    !dense(input.assignment.diagnostics, () => false)
  )
    throw Error("Malformed assignment");
  resolved.assignments.forEach((a, i) => {
    const supplied = input.assignment.assignments[i];
    if (
      a.colId !== supplied.colId ||
      (a.ring === undefined
        ? supplied.ring !== undefined
        : !record(supplied.ring) ||
          a.ring.outerRadiusOffset !== supplied.ring.outerRadiusOffset ||
          a.ring.innerRadiusOffset !== supplied.ring.innerRadiusOffset ||
          a.ring.titleInLegend !== supplied.ring.titleInLegend)
    )
      throw Error("Assignment disagrees with snapshot");
  });
  return resolved;
}
/** Copy caller-owned data before projection; callbacks are consumed eagerly by pieData. */
export function admitPie(
  input: PieMappingInput,
): PieMappingInput | CartesianTranslationResult {
  if (!record(input)) return pieFailure("Expected a resolved pie input.");
  const snapshot = validateSnapshot(input.snapshot, "pie-observations");
  if (!snapshot.valid)
    return { status: "invalid", diagnostics: snapshot.diagnostics };
  if (!validStyle(input.style) || !validContext(input.context))
    return pieFailure("Malformed pie appearance or rendering context.");
  const admitted = { ...input, snapshot: snapshot.snapshot };
  const assignment = canonicalAssignment(admitted);
  return {
    snapshot: snapshot.snapshot,
    assignment,
    style: structuredClone(input.style),
    context: {
      observations: { kind: "raw-observations" },
      display: { ...input.context.display },
      viewport: { ...input.context.viewport },
      aggFunc: input.context.aggFunc,
      legendSelection: input.context.legendSelection
        ? { ...input.context.legendSelection }
        : undefined,
    },
  };
}
