import { type CustomSeriesOption, color, type TooltipComponentOption } from "echarts";
import type { RadarMappingInput } from "../compatibility/radarContracts";
import { escapeHtml } from "./cartesianDisplay";
import { markerDimensions, markerSymbol } from "./cartesianMarkers";
import type { RadarData, RadarDataSeries } from "./radarData";
import { type RadarGeometry, type radarDomain, radarPoint } from "./radarLayout";

type Domain = ReturnType<typeof radarDomain>;
function alpha(value: string, opacity: number) {
  return color.modifyAlpha(value, (color.parse(value)?.[3] ?? 1) * opacity) ?? value;
}
function paint(input: RadarMappingInput, index: number) {
  const s = input.style.series;
  const p = input.style.application.palette;
  return {
    fill: alpha(s.fill ?? p.fills[index % p.fills.length], s.fillOpacity),
    stroke: alpha(
      s.stroke ??
        (input.family === "radarLine"
          ? p.fills[index % p.fills.length]
          : p.strokes[index % p.strokes.length]),
      s.strokeOpacity,
    ),
    lineWidth: s.strokeWidth,
    lineDash: [...s.lineDash],
  };
}
function marker(
  input: RadarMappingInput,
  p: [number, number],
  fill: string,
  stroke: string,
) {
  const m = input.style.series.markers;
  const style = { fill, stroke, lineWidth: m.strokeWidth };
  if (m.shape === "circle")
    return {
      type: "circle" as const,
      shape: { cx: p[0], cy: p[1], r: m.size / 2 },
      style,
    };
  const dimensions = markerDimensions(m.shape, m.size);
  const [width, height] =
    typeof dimensions === "number" ? [dimensions, dimensions] : dimensions;
  return {
    type: "path" as const,
    shape: {
      pathData: markerSymbol(m.shape).slice(7),
      x: p[0] - width / 2,
      y: p[1] - height / 2,
      width,
      height,
      layout: "cover" as const,
    },
    style,
  };
}
function label(input: RadarMappingInput, value: number, p: [number, number]) {
  const s = input.style.series.labels;
  return {
    type: "text" as const,
    silent: true,
    x: p[0],
    y: p[1] - s.size,
    style: {
      text: String(input.context.display.seriesLabel(value)),
      fill: s.color,
      fontFamily: s.font,
      fontSize: s.size,
      fontWeight: s.fontWeight as
        | number
        | "normal"
        | "bold"
        | "bolder"
        | "lighter"
        | undefined,
      fontStyle: s.fontStyle as "normal" | "italic" | "oblique" | undefined,
      align: "center" as const,
      verticalAlign: "bottom" as const,
    },
  };
}
function drawing(
  input: RadarMappingInput,
  series: RadarDataSeries,
  points: [number, number][],
  paletteIndex: number,
  index: number,
) {
  const s = input.style.series;
  const value = series.values[index];
  const count = series.values.length;
  const style = paint(input, paletteIndex);
  const next = (index + 1) % count;
  const children: NonNullable<
    Extract<
      import("echarts").CustomSeriesRenderItemReturn,
      { type: "group" }
    >["children"]
  > = [];
  if (
    input.family === "radarArea" &&
    index === 0 &&
    series.values.some((v) => v !== null)
  )
    children.push({ type: "polygon", silent: true, shape: { points }, style });
  if (input.family === "radarLine" && value !== null && series.values[next] !== null)
    children.push({
      type: "line",
      silent: true,
      shape: {
        x1: points[index][0],
        y1: points[index][1],
        x2: points[next][0],
        y2: points[next][1],
      },
      style: { ...style, fill: "none" },
    });
  if (value !== null) {
    children.push({
      type: "circle",
      shape: {
        cx: points[index][0],
        cy: points[index][1],
        r: Math.max(5, s.markers.size / 2),
      },
      style: { fill: "transparent" },
    });
    if (s.markers.enabled)
      children.push(marker(input, points[index], style.fill, style.stroke));
    if (s.labels.enabled) children.push(label(input, value, points[index]));
  }
  return { type: "group" as const, children };
}
export function radarSeries(
  input: RadarMappingInput,
  data: RadarData,
  g: RadarGeometry,
  domain: Domain,
): CustomSeriesOption[] {
  return data.series.map((s, index) => {
    const points = s.values.map((v, i) =>
      v === null
        ? ([...g.center] as [number, number])
        : radarPoint(i, data.categories.length, v, g, domain.extent),
    );
    return {
      id: s.id,
      name: s.id,
      type: "custom",
      coordinateSystem: "none",
      animation: false,
      itemStyle: {
        color:
          input.style.series.fill ??
          input.style.application.palette.fills[
            index % input.style.application.palette.fills.length
          ],
      },
      renderItem: (params) => drawing(input, s, points, index, params.dataIndex),
      data: s.values.map((rawValue, i) => ({
        name: data.rowIds[i],
        value: i,
        rawValue,
        category: data.categories[i],
        seriesLabel: s.label,
      })),
      tooltip: { show: input.style.application.tooltip.enabled },
    };
  });
}
/** Only real observations own tooltip hit targets; an Area's missing center has none. */
export function radarTooltip(input: RadarMappingInput): TooltipComponentOption {
  const mode = input.style.application.tooltip.mode;
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item",
    confine: true,
    formatter: (params: unknown) => tooltipContent(input, mode, params),
  };
}
function tooltipContent(
  input: RadarMappingInput,
  mode: string,
  params: unknown,
): string {
  const p = params as {
    data?: {
      name?: string;
      rawValue?: number | null;
      category?: string | number;
      seriesLabel?: string;
    };
    seriesId?: string;
  };
  const d = p.data;
  if (!d || typeof d.rawValue !== "number") return "";
  const row = input.snapshot.rows.find((r) => r.id === d.name);
  if (!row) return "";
  const columns = input.assignments.filter(
    (a) =>
      (mode === "shared" || a.colId === p.seriesId) &&
      input.context.legendSelection?.[a.colId] !== false,
  );
  const lines = columns.map((a) => {
    const column = input.snapshot.columns.find((c) => c.id === a.colId);
    const value = row.values[a.colId];
    return `${escapeHtml(column?.label ?? a.colId)}: ${typeof value === "number" ? escapeHtml(input.context.display.tooltipNumber(value)) : "—"}`;
  });
  return [
    ...(mode === "compact"
      ? []
      : [escapeHtml(String(input.context.display.category(row.category)))]),
    ...lines,
  ].join("<br/>");
}
export function radarLegendData(input: RadarMappingInput, data: RadarData) {
  const l = input.style.application.legend;
  const s = input.style.series;
  return data.series.map((series, index) => {
    const p = paint(input, index);
    const size = l.markerSize;
    const width = input.family === "radarLine" ? Math.max(25, size) : size;
    const shape =
      input.family === "radarLine" && s.markers.enabled ? s.markers.shape : "square";
    const bounds =
      shape === "plus" ? "0 0 3 3" : shape === "heart" ? "-.5 -.375 1 .75" : "0 0 1 1";
    const geometry =
      shape === "circle"
        ? '<circle cx=".5" cy=".5" r=".5"'
        : `<path d="${markerSymbol(shape).slice(7)}"`;
    const marker =
      input.family === "radarLine" && !s.markers.enabled
        ? ""
        : `<svg x="${(width - size) / 2 + 2}" y="2" width="${size}" height="${size}" viewBox="${bounds}" overflow="visible">${geometry} fill="${escapeHtml(p.fill)}" stroke="${escapeHtml(p.stroke)}" stroke-width="${input.style.application.legendMarkerStrokeWidth / Math.max(1, size)}"/></svg>`;
    const line =
      input.family === "radarLine"
        ? `<line x1="2" x2="${width + 2}" y1="${size / 2 + 2}" y2="${size / 2 + 2}" stroke="${escapeHtml(p.stroke)}" stroke-width="${s.strokeWidth}"/>`
        : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 4}" height="${size + 4}" viewBox="0 0 ${width + 4} ${size + 4}">${line}${marker}</svg>`;
    return {
      name: series.id,
      icon: `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    };
  });
}
