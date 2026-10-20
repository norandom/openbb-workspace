import type { ScatterSeriesOption } from "echarts";
import { color } from "echarts";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import { escapeHtml, fontStyle } from "./cartesianDisplay";
import { markerDimensions, markerSymbol } from "./cartesianMarkers";
import { xyObservations } from "./xyObservations";
import type { XyDatum, XyMappingInput } from "./xyTypes";
function alpha(value: string, opacity: number): string {
  if (opacity === 1) return value;
  const original = color.parse(value);
  const result = original && color.modifyAlpha(value, original[3] * opacity);
  if (!result) throw Error("Cannot apply marker opacity to color.");
  return result;
}
export function xySeries(input: XyMappingInput): ScatterSeriesOption[] {
  const {
    series: s,
    application: { palette },
    overrides,
  } = input.style;
  return input.assignments.flatMap((a, index) => {
    if (input.context.legendSelection?.[a.yColId] === false) return [];
    const o = overrides[a.yColId] ?? {};
    const data = xyObservations(input, a);
    const shape = s.markers.shape;
    return [
      {
        id: `xy:${JSON.stringify([input.chartType, a.xColId, a.yColId, a.sizeColId ?? null])}`,
        name: a.yColId,
        type: "scatter",
        data,
        symbol: markerSymbol(shape),
        symbolSize: (_value, params) =>
          s.markers.enabled
            ? markerDimensions(
                shape,
                (params.data as unknown as XyDatum).diameter,
              )
            : 0,
        symbolOffset: (_value, params) => [
          0,
          shape === "triangle"
            ? -(params.data as unknown as XyDatum).diameter * 0.065
            : 0,
        ],
        itemStyle: {
          color: alpha(
            o.markerFill ??
              o.fill ??
              o.color ??
              palette.fills[index % palette.fills.length],
            s.fillOpacity,
          ),
          borderColor: alpha(
            o.markerStroke ??
              o.stroke ??
              o.color ??
              palette.strokes[index % palette.strokes.length],
            s.strokeOpacity,
          ),
          borderWidth:
            o.markerStrokeWidth ?? o.strokeWidth ?? s.markers.strokeWidth,
          borderType: [...s.lineDash],
          borderCap: "butt",
          ...(s.shadow.enabled
            ? {
                shadowBlur: s.shadow.blur,
                shadowColor: s.shadow.color,
                shadowOffsetX: s.shadow.xOffset,
                shadowOffsetY: s.shadow.yOffset,
              }
            : {}),
        },
        label: {
          show: s.labels.enabled,
          ...fontStyle(s.labels),
          formatter: (p) => {
            const d = p.data as unknown as XyDatum;
            return String(
              input.context.display.seriesLabel(
                input.context.labels === "category"
                  ? d.metadata.category
                  : d.metadata.rawY,
              ),
            );
          },
        },
      } satisfies ScatterSeriesOption,
    ];
  });
}
export function xyTooltip(input: XyMappingInput) {
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item" as const,
    formatter: (params: unknown) => {
      const items = Array.isArray(params) ? params : [params];
      return items
        .map((p) => pointTooltip(input, (p as { data: XyDatum }).data))
        .join("<br/>");
    },
  };
}
function pointTooltip(input: XyMappingInput, datum: XyDatum): string {
  const m = datum.metadata,
    display = input.context.display;
  const rows: [SnapshotColumn, number][] = [
    [m.x, m.rawX],
    [m.y, m.rawY],
  ];
  if (typeof m.rawSize === "number" && m.size) rows.push([m.size, m.rawSize]);
  rows.sort((a, b) => b[1] - a[1]);
  return [
    escapeHtml(String(display.category(m.category))),
    ...rows.map(
      ([column, value]) =>
        `${escapeHtml(column.label)}: ${escapeHtml(String(display.tooltipNumber(value)))}`,
    ),
  ].join("<br/>");
}
