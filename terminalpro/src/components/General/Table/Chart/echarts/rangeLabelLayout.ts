import type { RangeResolvedAxis } from "../application/rangeAxisAppearance";
import { measureText } from "./cartesianLayout";
import type { RangeCategoryTick } from "./rangeCategoryTypes";

type Font = RangeResolvedAxis["labels"];
export function rangeTextSize(text: string, font: Font, rotation: number) {
  const size = measureText(text, font);
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: size.width * cosine + size.height * sine,
    height: size.height * cosine + size.width * sine,
  };
}
function splitWord(word: string, width: number, font: Font): string[] | undefined {
  const lines: string[] = [];
  const suffix = font.wrapping === "hyphenate" ? "-" : "";
  while (measureText(word, font).width > width) {
    let count = 0;
    while (
      count < word.length &&
      measureText(word.slice(0, count + 1) + suffix, font).width <= width
    )
      count++;
    if (!count) return;
    lines.push(word.slice(0, count) + suffix);
    word = word.slice(count);
  }
  return [...lines, word];
}
function wrapLine(text: string, width: number, font: Font): string | undefined {
  if (measureText(text, font).width <= width) return text;
  if (font.wrapping === "never") return;
  const lines: string[] = [];
  let line = "";
  for (const word of text.trimEnd().split(/ +/)) {
    if (measureText(word, font).width > width) {
      if (font.wrapping === "on-space") return;
      const split = splitWord(word, width, font);
      if (!split) return;
      if (line) lines.push(line);
      lines.push(...split.slice(0, -1));
      line = split.at(-1) ?? "";
    } else if (line && measureText(`${line} ${word}`, font).width > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line].join("\n");
}
export function rangeWrapLabel(
  text: string,
  width: number,
  height: number,
  font: Font,
): string {
  if (!font.enabled || !font.avoidCollisions) return text;
  const lines = text.split(/\r?\n/).map((line) => wrapLine(line, width, font));
  if (lines.some((line) => line === undefined)) return text;
  const wrapped = lines.join("\n");
  return measureText(wrapped, font).height <= height ? wrapped : text;
}
export function rangeLabelsFit(
  ticks: readonly RangeCategoryTick[],
  extent: readonly [] | readonly [number, number],
  span: number,
  axis: RangeResolvedAxis,
  horizontal: boolean,
  rotation: number,
): boolean {
  if (!axis.labels.enabled || !axis.labels.avoidCollisions || extent.length === 0)
    return true;
  let end = Number.NEGATIVE_INFINITY;
  return ticks.every((tick) => {
    const size = rangeTextSize(tick.label, axis.labels, rotation);
    const length = horizontal ? size.width : size.height;
    const position =
      extent[0] === extent[1]
        ? span / 2
        : ((tick.coordinate - extent[0]) / (extent[1] - extent[0])) * span;
    const fits = position - length / 2 >= end;
    end = position + length / 2 + (axis.labels.minSpacing ?? (rotation ? 0 : 10));
    return fits;
  });
}
export function rangeAxisFootprint(
  axis: RangeResolvedAxis,
  labels: readonly string[],
  horizontal: boolean,
  rotation: number,
) {
  const label =
    !axis.labels.enabled || !labels.length
      ? 0
      : Math.max(
          0,
          ...labels.map((text) => {
            const size = rangeTextSize(text, axis.labels, rotation);
            return horizontal ? size.height : size.width;
          }),
        ) + axis.labels.padding;
  const title =
    axis.title.enabled && axis.title.text
      ? measureText(axis.title.text, axis.title).height + axis.title.spacing
      : 0;
  return label + (axis.ticks.enabled ? axis.ticks.length : 0) + title;
}
