import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from "echarts";
import type { HeatmapMappingInput } from "../application/heatmapTypes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { HeatmapData } from "./heatmapData";
import { hierarchyColorScale, hierarchyOpacity } from "./hierarchyColor";

export function heatmapColor(
  range: readonly string[],
  extent: readonly [number, number],
  value: number,
): string {
  if (!range.length) throw Error("Empty heatmap color range");
  return extent[0] === extent[1]
    ? range[Math.floor(range.length / 2)]
    : hierarchyColorScale(range, extent).color(value);
}
export function heatmapGeometry(
  center: readonly number[],
  size: readonly number[],
  clip: { x: number; y: number; width: number; height: number },
) {
  const originX = Math.floor(center[0] - Math.abs(size[0]) / 2);
  const originY = Math.floor(center[1] - Math.abs(size[1]) / 2);
  const left = Math.max(clip.x, originX);
  const top = Math.max(clip.y, originY);
  const right = Math.min(clip.x + clip.width, originX + Math.ceil(Math.abs(size[0])));
  const bottom = Math.min(clip.y + clip.height, originY + Math.ceil(Math.abs(size[1])));
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
export function heatmapCellId(rowId: string, columnId: string): string {
  return JSON.stringify([rowId, columnId]);
}
export function heatmapItems(model: HeatmapData) {
  const finite = new Map(model.cells.map((c) => [`${c.x}/${c.y}`, c]));
  return model.y.flatMap((row, y) =>
    model.x.map((column, x) => {
      const cell = finite.get(`${x}/${y}`);
      return {
        id: heatmapCellId(row.id, column.id),
        value: cell ? [x, y, cell.value] : [x, y],
        tooltip: { show: !!cell },
        silent: !cell,
      };
    }),
  );
}
function wrapText(
  text: string,
  width: number,
  label: HeatmapMappingInput["style"]["series"]["label"],
  size: number,
): string[] {
  if (label.wrapping === "never") return text.split("\n");
  const pieces = label.wrapping === "on-space" ? text.split(/\s+/) : [...text];
  const lines: string[] = [];
  let line = "";
  for (const piece of pieces) {
    const next = line + (line && label.wrapping === "on-space" ? " " : "") + piece;
    if (
      line &&
      measureText(next + (label.wrapping === "hyphenate" ? "-" : ""), {
        ...label,
        size,
      }).width > width
    ) {
      lines.push(line + (label.wrapping === "hyphenate" ? "-" : ""));
      line = piece;
    } else line = next;
  }
  return [...lines, line];
}
export function fitHeatmapLabel(
  input: HeatmapMappingInput,
  text: string,
  width: number,
  height: number,
) {
  const label = input.style.series.label;
  const minimum = Math.min(label.minimumFontSize, label.size);
  let size = label.size;
  let lines = [text];
  for (let attempt = 0; attempt <= 32; attempt++) {
    size = label.size + ((minimum - label.size) * attempt) / 32;
    lines = wrapText(text, width, label, size);
    const lineHeight = label.lineHeight ?? size * 1.2;
    if (
      lines.length * lineHeight <= height &&
      lines.every((line) => measureText(line, { ...label, size }).width <= width)
    )
      return { text: lines.join("\n"), size, lineHeight };
  }
  const lineHeight = label.lineHeight ?? size * 1.2;
  if (
    label.overflowStrategy === "hide" ||
    height < lineHeight ||
    measureText("…", { ...label, size }).width > width
  )
    return;
  lines = lines.slice(0, Math.floor(height / lineHeight));
  lines = lines.map((line, index) => {
    if (
      index !== lines.length - 1 &&
      measureText(line, { ...label, size }).width <= width
    )
      return line;
    while (line && measureText(`${line}…`, { ...label, size }).width > width)
      line = line.slice(0, -1);
    return `${line}…`;
  });
  return { text: lines.join("\n"), size, lineHeight };
}
function cellLabel(
  input: HeatmapMappingInput,
  shape: ReturnType<typeof heatmapGeometry>,
  value: number,
) {
  const s = input.style.series;
  if (!s.label.enabled) return;
  const fit = fitHeatmapLabel(
    input,
    String(input.context.display.seriesLabel(value)),
    shape.width - 2 * s.itemPadding,
    shape.height - 2 * s.itemPadding,
  );
  if (!fit) return;
  const x =
    s.textAlign === "left"
      ? shape.x + s.itemPadding
      : s.textAlign === "right"
        ? shape.x + shape.width - s.itemPadding
        : shape.x + shape.width / 2;
  const y =
    s.verticalAlign === "top"
      ? shape.y + s.itemPadding
      : s.verticalAlign === "bottom"
        ? shape.y + shape.height - s.itemPadding
        : shape.y + shape.height / 2;
  return {
    type: "text" as const,
    silent: true,
    style: {
      ...fontStyle({ ...s.label, size: fit.size }),
      text: fit.text,
      lineHeight: fit.lineHeight,
      x,
      y,
      fill: s.label.color,
      align: s.textAlign,
      verticalAlign: s.verticalAlign,
    },
  };
}
export function heatmapRenderer(input: HeatmapMappingInput, model: HeatmapData) {
  const items = heatmapItems(model);
  const scale =
    model.extent && model.extent[0] !== model.extent[1]
      ? hierarchyColorScale(input.style.colorRange, model.extent)
      : undefined;
  return (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
    const item = items[params.dataIndex];
    const value = item.value[2];
    const coord = params.coordSys as unknown as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const shape = heatmapGeometry(
      api.coord(item.value.slice(0, 2)),
      api.size?.([1, 1]) as number[],
      coord,
    );
    if (!shape.width || !shape.height) return;
    const fill =
      value === undefined
        ? "transparent"
        : (scale?.color(value) ??
          input.style.colorRange[Math.floor(input.style.colorRange.length / 2)]);
    const label = value === undefined ? undefined : cellLabel(input, shape, value);
    return {
      type: "group" as const,
      children: [
        {
          type: "rect" as const,
          name: item.id,
          silent: value === undefined,
          shape,
          style: {
            fill,
            stroke: hierarchyOpacity(
              input.style.series.stroke,
              input.style.series.strokeOpacity,
            ),
            lineWidth: input.style.series.strokeWidth,
          },
        },
        ...(label ? [label] : []),
      ],
    };
  };
}
