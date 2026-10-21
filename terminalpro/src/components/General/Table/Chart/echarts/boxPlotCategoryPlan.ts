import { boxDisplayText } from "./boxPlotAdmission";
import { boxBand } from "./boxPlotGeometry";
import type {
  BoxLabelWrapping,
  BoxPlotMappingInput,
  BoxPlotProjection,
} from "./boxPlotTypes";
import { measureText } from "./cartesianLayout";

export interface BoxCategoryLabelPlan {
  readonly labels: readonly string[];
  readonly slots: readonly number[];
  readonly rotation: number;
  readonly footprint: number;
  readonly span: number;
  readonly bandwidth: number;
  readonly sizeLimit: number;
}
type Font = BoxPlotMappingInput["style"]["axes"]["category"]["labels"];
function wrapLine(
  text: string,
  width: number,
  font: Font,
  mode: BoxLabelWrapping,
): string | undefined {
  if (measureText(text, font).width <= width) return text;
  if (mode === "never") return undefined;
  const words = text.trimEnd().split(/ +/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (measureText(word, font).width > width) {
      if (mode === "on-space") return undefined;
      if (line) lines.push(line);
      const split = splitWord(word, width, font, mode === "hyphenate");
      if (!split) return undefined;
      lines.push(...split.slice(0, -1));
      line = split.at(-1) ?? "";
    } else if (line && measureText(`${line} ${word}`, font).width > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  lines.push(line);
  return lines.join("\n");
}
function splitWord(
  word: string,
  width: number,
  font: Font,
  hyphenate: boolean,
): string[] | undefined {
  const lines: string[] = [];
  let remaining = word;
  while (measureText(remaining, font).width > width) {
    const postfix = hyphenate ? "-" : "";
    let length = 0;
    while (
      length < remaining.length &&
      measureText(remaining.slice(0, length + 1) + postfix, font).width <= width
    )
      length++;
    if (!length) return undefined;
    lines.push(remaining.slice(0, length) + postfix);
    remaining = remaining.slice(length);
  }
  return [...lines, remaining];
}
function wrapped(text: string, width: number, height: number, font: Font): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => wrapLine(line, width, font, font.wrapping ?? "on-space"));
  if (lines.some((line) => line === undefined)) return text;
  const result = lines.join("\n");
  return measureText(result, font).height <= height ? result : text;
}
function candidates(count: number, step: number): number[] {
  const remainder = count - step * Math.floor(count / step);
  const half = Math.floor(remainder / 2);
  const inset = half > 0 ? 2 ** Math.floor(Math.log2(half)) : 0;
  return Array.from({ length: count }, (_, i) => i).filter(
    (i) => i >= inset && (i - inset) % step === 0,
  );
}
function overlaps(
  labels: readonly string[],
  slots: readonly number[],
  step: number,
  vertical: boolean,
  font: Font,
  rotation: number,
): boolean {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const gap = font.minSpacing ?? (rotation ? 0 : 10);
  let end = Number.NEGATIVE_INFINITY;
  return slots.some((slot) => {
    const size = measureText(labels[slot], font);
    const extent = vertical
      ? size.width * cosine + size.height * sine
      : size.height * cosine + size.width * sine;
    // Rotated bottom labels end at their raw tick; long boundary text extends outward.
    const before =
      vertical && rotation
        ? rotation > 0
          ? size.width * cosine
          : size.height * sine
        : extent / 2;
    const start = slot * step - before;
    const collision = start < end;
    end = start + extent + gap;
    return collision;
  });
}
function footprint(
  labels: readonly string[],
  slots: readonly number[],
  font: Font,
  vertical: boolean,
  rotation: number,
): number {
  if (font.enabled === false || !slots.length) return 0;
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return (
    Math.max(
      0,
      ...slots.map((slot) => {
        const size = measureText(labels[slot], font);
        return vertical
          ? size.height * cosine + size.width * sine
          : size.width * cosine + size.height * sine;
      }),
    ) + font.padding
  );
}
export function planBoxCategoryLabels(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  span: number,
): BoxCategoryLabelPlan {
  const vertical = input.style.direction === "vertical";
  const font = input.style.axes.category.labels;
  const window = vertical ? input.context.navigation?.window : undefined;
  const fraction = window ? Math.max(0.001, (window.end - window.start) / 100) : 1;
  const b = input.style.band;
  // Retained CartesianAxis bounds each axis to 30% of the scene's cross dimension.
  const sizeLimit =
    (vertical ? input.context.viewport.height : input.context.viewport.width) * 0.3;
  const band = boxBand(
    span / fraction,
    projection.groups.length,
    b.paddingInner,
    b.paddingOuter,
  );
  const labels = projection.groups.map((group) => {
    const text = boxDisplayText(input.context.display.category(group.category));
    return font.avoidCollisions === false || font.enabled === false
      ? text
      : wrapped(
          text,
          vertical ? band.width : sizeLimit,
          vertical ? sizeLimit : band.width,
          font,
        );
  });
  const c = b.paddingOuter + (1 - b.paddingInner) / 2;
  const extent =
    projection.groups.length > 1 ? [-c, projection.groups.length - 1 + c] : [-0.5, 0.5];
  const visible = (slot: number) =>
    !window ||
    (slot >= extent[0] + ((extent[1] - extent[0]) * window.start) / 100 &&
      slot <= extent[0] + ((extent[1] - extent[0]) * window.end) / 100);
  let slots = projection.groups.map((g) => g.slot).filter(visible);
  let rotation = font.rotation ? -font.rotation : 0;
  if (font.enabled !== false && font.avoidCollisions !== false) {
    for (let stride = 1; stride < Math.max(2, labels.length * 2); stride *= 2) {
      slots = candidates(labels.length, stride).filter(visible);
      rotation = font.rotation ? -font.rotation : 0;
      if (!overlaps(labels, slots, band.step, vertical, font, rotation)) break;
      if (font.autoRotate && font.rotation === undefined) rotation = 25;
      if (!overlaps(labels, slots, band.step, vertical, font, rotation)) break;
    }
  }
  return {
    labels,
    slots,
    rotation,
    footprint: Math.min(sizeLimit, footprint(labels, slots, font, vertical, rotation)),
    span,
    bandwidth: band.width,
    sizeLimit,
  };
}
