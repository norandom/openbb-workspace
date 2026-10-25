import { PRIORITY, registerLayout } from "echarts";
import type {
  HierarchyAutoLabel,
  HierarchyGroupLabel,
} from "../application/hierarchyPaintTypes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { HierarchyPaintAdapterRequired, hierarchyOpacity } from "./hierarchyColor";

type Label = HierarchyGroupLabel | HierarchyAutoLabel;
interface Descriptor {
  readonly label: Label;
  readonly text: string;
  readonly horizontalPadding: number;
  readonly verticalPadding: number;
}
const descriptors = new WeakMap<object, Descriptor>();
function box(label: Label) {
  if (label.enabled && label.fill !== undefined && typeof label.fill !== "string")
    throw new HierarchyPaintAdapterRequired(
      "Active advanced label fill requires its reviewed native adapter.",
    );
  const padding = label.padding;
  const border = label.border;
  return {
    backgroundColor:
      typeof label.fill === "string"
        ? hierarchyOpacity(label.fill, label.fillOpacity ?? 1)
        : undefined,
    borderColor:
      border?.enabled === false || !border?.stroke
        ? undefined
        : hierarchyOpacity(border.stroke, border.strokeOpacity ?? 1),
    borderWidth: border?.enabled === false ? 0 : border?.strokeWidth,
    borderRadius: label.cornerRadius,
    padding:
      typeof padding === "object"
        ? [padding.top ?? 0, padding.right ?? 0, padding.bottom ?? 0, padding.left ?? 0]
        : padding,
  };
}
export function hierarchyLabelOptions(
  label: Label,
  text: string,
  padding: number,
): Record<string, unknown> {
  const formatter = () => text;
  descriptors.set(formatter, {
    label,
    text,
    horizontalPadding: padding * 2,
    verticalPadding: padding * 2,
  });
  const boxing = box(label);
  const boxed =
    boxing.backgroundColor !== undefined || boxing.borderColor !== undefined;
  return {
    ...fontStyle(label),
    ...boxing,
    show: label.enabled && text !== "",
    formatter,
    // Native Treemap subtracts text padding again; inactive boxing must use the fit inset.
    padding: boxed ? (boxing.padding ?? padding) : padding,
    lineHeight: "lineHeight" in label ? label.lineHeight : undefined,
    overflow: "truncate",
    ellipsis: "…",
    align: "center",
    verticalAlign: "middle",
  };
}
function width(text: string, label: Label, size: number): number {
  return measureText(text, { ...label, size }).width;
}
function splitWord(
  word: string,
  limit: number,
  label: Label,
  size: number,
  hyphen: boolean,
): string[] {
  const parts: string[] = [];
  let current = "";
  for (const character of word) {
    if (
      current &&
      width(current + character + (hyphen ? "-" : ""), label, size) > limit
    ) {
      parts.push(current + (hyphen ? "-" : ""));
      current = "";
    }
    current += character;
  }
  if (current) parts.push(current);
  return parts;
}
function wrap(
  text: string,
  limit: number,
  label: HierarchyAutoLabel,
  size: number,
): string[] {
  if (label.wrapping === "never") return text.split("\n");
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const pieces =
        label.wrapping === "on-space"
          ? [word]
          : splitWord(word, limit, label, size, label.wrapping === "hyphenate");
      for (const piece of pieces) {
        const next = line ? `${line} ${piece}` : piece;
        if (line && width(next, label, size) > limit) {
          lines.push(line);
          line = piece;
        } else line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}
function fitLabel(
  descriptor: Descriptor,
  availableWidth: number,
  availableHeight: number,
) {
  const { label, text } = descriptor;
  // Native zrender truncation reserves one pixel even for an exactly fitted line.
  const w = Math.max(0, availableWidth - descriptor.horizontalPadding - 1);
  const h = Math.max(0, availableHeight - descriptor.verticalPadding);
  const minimum =
    "minimumFontSize" in label
      ? Math.min(label.minimumFontSize, label.size)
      : label.size;
  let size = label.size;
  let lines = [text];
  const steps = Math.max(1, Math.min(32, Math.ceil(label.size - minimum)));
  for (let attempt = 0; attempt <= steps; attempt++) {
    size =
      attempt === steps
        ? minimum
        : label.size + (minimum - label.size) * (attempt / steps);
    lines = "wrapping" in label ? wrap(text, w, label, size) : [text];
    const lineHeight =
      "lineHeight" in label ? (label.lineHeight ?? size * 1.2) : size * 1.2;
    const fits =
      lines.length * lineHeight <= h &&
      lines.every((line) => width(line, label, size) <= w);
    if (fits) return { text: lines.join("\n"), size, show: label.enabled };
  }
  if (
    !("overflowStrategy" in label) ||
    label.overflowStrategy === "hide" ||
    h < size * 1.2 ||
    w <= 0
  )
    return { text: "", size, show: false };
  const maxLines = Math.max(1, Math.floor(h / (label.lineHeight ?? size * 1.2)));
  lines = lines.slice(0, maxLines);
  let last = lines.pop() ?? "";
  while (last && width(`${last}…`, label, size) > w) last = last.slice(0, -1);
  return {
    text: [...lines, `${last}…`].join("\n"),
    size,
    show: label.enabled && width("…", label, size) <= w,
  };
}
function bounds(layout: Record<string, number>): [number, number] {
  if ([layout.width, layout.height].every((v) => Number.isFinite(v) && v >= 0))
    return [layout.width, layout.height];
  if (
    ![layout.r, layout.r0, layout.startAngle, layout.endAngle].every(Number.isFinite) ||
    layout.r0 < 0 ||
    layout.r < layout.r0 ||
    layout.endAngle < layout.startAngle
  )
    throw Error("Unsupported native hierarchy label geometry.");
  const thickness = layout.r - layout.r0;
  const chord =
    2 *
    ((layout.r + layout.r0) / 2) *
    Math.sin(Math.min(Math.PI, layout.endAngle - layout.startAngle) / 2);
  return [Math.max(0, chord), Math.max(0, thickness)];
}
function applyLabel(option: Record<string, unknown>, dimensions: [number, number]) {
  const formatter = option.formatter;
  if (typeof formatter !== "function") return;
  const descriptor = descriptors.get(formatter);
  if (!descriptor) return;
  const result = fitLabel(descriptor, ...dimensions);
  const next = () => result.text;
  descriptors.set(next, descriptor);
  Object.assign(option, { formatter: next, fontSize: result.size, show: result.show });
}
// ECharts 6.0.0 extension adapter: native rectangle/sector fields are version-coupled.
// Module registration is once-only; immutable formatter keys isolate each chart's labels.
registerLayout(PRIORITY.VISUAL.POST_CHART_LAYOUT, (ecModel) => {
  ecModel.eachSeries((series) => {
    if (
      series.id !== "qopenbb-hierarchy" ||
      !["treemap", "sunburst"].includes(series.subType)
    )
      return;
    const data = series.getData();
    for (let index = 0; index < data.count(); index++) {
      const layout = data.getItemLayout(index) as Record<string, number> | undefined;
      if (!layout) continue;
      const model = data.getItemModel(index);
      const option = model.option as Record<string, unknown>;
      const owned = [option.label, option.upperLabel].some(
        (value) =>
          value &&
          typeof value === "object" &&
          "formatter" in value &&
          typeof value.formatter === "function" &&
          descriptors.has(value.formatter),
      );
      if (!owned) continue;
      const dimensions = bounds(layout);
      if (option.label && typeof option.label === "object")
        applyLabel(option.label as Record<string, unknown>, dimensions);
      if (option.upperLabel && typeof option.upperLabel === "object")
        applyLabel(option.upperLabel as Record<string, unknown>, [
          dimensions[0],
          Number((option.upperLabel as Record<string, unknown>).height) ||
            dimensions[1],
        ]);
    }
  });
});
