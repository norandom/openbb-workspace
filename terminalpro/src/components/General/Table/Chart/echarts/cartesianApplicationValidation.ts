import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";

type Check = (value: unknown) => boolean;
type Schema = Readonly<Record<string, Check>>;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text: Check = (v) => typeof v === "string";
const bool: Check = (v) => typeof v === "boolean";
const finite: Check = (v) => typeof v === "number" && Number.isFinite(v);
const size: Check = (v) => finite(v) && (v as number) >= 0;
const opacity: Check = (v) => size(v) && (v as number) <= 1;
const dash: Check = (v) => Array.isArray(v) && v.every(size);
const choice =
  (values: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v);
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
const array =
  (check: Check): Check =>
  (v) =>
    Array.isArray(v) && v.length > 0 && v.every(check);
const object =
  (schema: Schema): Check =>
  (value) =>
    record(value) &&
    Object.keys(value).every((key) => key in schema) &&
    Object.entries(schema).every(([key, check]) => check(value[key]));
const font = {
  font: text,
  weight: text,
  color: text,
  size,
  fontWeight: optional((v) => text(v) || finite(v)),
  fontStyle: optional(choice(["normal", "italic", "oblique"])),
};
const caption = object({ ...font, enabled: bool, text, spacing: size });
const axis = object({
  fields: object({
    type: choice(["category", "grouped-category", "number", "time"]),
    timeFormat: text,
    position: choice(["top", "bottom", "left", "right"]),
    color: text,
    thickness: size,
  }),
  title: caption,
  labels: object({
    ...font,
    padding: size,
    autoRotate: bool,
    rotation: optional(finite),
  }),
  grid: object({ enabled: bool, color: text, thickness: size, lineDash: size }),
  gridStyles: array(object({ stroke: text, lineDash: dash })),
  ticks: object({ enabled: bool, color: text, width: size, length: size }),
  lineEnabled: bool,
});
const schema: Schema = {
  title: caption,
  subtitle: caption,
  legend: object({
    ...font,
    enabled: bool,
    position: choice(["top", "bottom", "left", "right"]),
    spacing: size,
    markerSize: size,
    markerStroke: size,
    itemSpacing: size,
    horizontalSpacing: size,
    verticalSpacing: size,
  }),
  legendMarkerStrokeWidth: size,
  padding: object({ top: size, right: size, bottom: size, left: size }),
  background: object({ visible: bool, fill: text }),
  tooltip: object({ enabled: bool, mode: choice(["single", "shared", "compact"]) }),
  axes: object({ category: axis, number: axis }),
  series: object({
    strokeWidth: size,
    strokeOpacity: opacity,
    fillOpacity: opacity,
    lineDash: dash,
    shadow: object({
      enabled: bool,
      color: text,
      blur: size,
      xOffset: finite,
      yOffset: finite,
    }),
    labels: object({ ...font, enabled: bool }),
    markers: object({
      enabled: bool,
      shape: choice([
        "square",
        "circle",
        "cross",
        "diamond",
        "plus",
        "triangle",
        "heart",
      ]),
      size,
      strokeWidth: size,
    }),
    connectMissingData: bool,
  }),
  palette: object({ fills: array(text), strokes: array(text) }),
};
export function applicationDiagnostics(value: unknown): SnapshotDiagnostic[] {
  if (value === undefined) return [];
  if (!record(value)) return [issue([])];
  const unknown = Object.keys(value).filter((key) => !(key in schema));
  const invalid = Object.entries(schema)
    .filter(([key, check]) => !check(value[key]))
    .map(([key]) => key);
  return [...unknown, ...invalid].map((key) => issue([key]));
}
function issue(path: string[]): SnapshotDiagnostic {
  return {
    code: "invalid-style",
    path: ["style", "application", ...path],
    message:
      "Application appearance must contain every finite validated rendering field.",
  };
}
