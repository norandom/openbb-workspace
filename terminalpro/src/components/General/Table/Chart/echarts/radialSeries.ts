import type { CustomSeriesOption, TooltipComponentOption } from "echarts";
import { color } from "echarts";
import type { RadialMappingInput } from "../compatibility/radialContracts";
import { escapeHtml, fontStyle } from "./cartesianDisplay";
import { buildRadialColumnPath } from "./radialColumnShape";
import type { RadialPreparedModel, RadialPreparedSeries } from "./radialModel";
function alpha(value: string, opacity: number) {
  return (
    color.modifyAlpha(value, (color.parse(value)?.[3] ?? 1) * opacity) ?? value
  );
}
function paint(input: RadialMappingInput, series: RadialPreparedSeries) {
  const s = input.style.series;
  const p = input.style.application.palette;
  return {
    fill: alpha(
      s.fill ?? p.fills[series.paletteIndex % p.fills.length],
      s.fillOpacity,
    ),
    stroke: alpha(
      s.stroke ?? p.strokes[series.paletteIndex % p.strokes.length],
      s.strokeOpacity,
    ),
    lineWidth: s.strokeWidth,
    lineDash: [...s.lineDash],
  };
}
function elements(
  input: RadialMappingInput,
  model: RadialPreparedModel,
  series: RadialPreparedSeries,
) {
  const style = paint(input, series);
  return series.marks.map((mark) => {
    const path =
      mark.kind === "column"
        ? buildRadialColumnPath({
            ...mark,
            holeRadius: model.holeRadius,
            outerRadius: model.outerRadius,
          })
        : undefined;
    const shape =
      mark.kind === "column"
        ? {
            type: "path" as const,
            shape: { pathData: path?.pathData },
            rotation: -mark.rotation,
            style: { ...style, fill: path?.zero ? "none" : style.fill },
          }
        : {
            type: "sector" as const,
            shape: {
              cx: 0,
              cy: 0,
              r0: mark.innerRadius,
              r: mark.outerRadius,
              startAngle: mark.startAngle,
              endAngle: mark.endAngle,
              clockwise: true,
            },
            style: {
              ...style,
              fill: mark.startAngle === mark.endAngle ? "none" : style.fill,
            },
          };
    return {
      type: "group" as const,
      x: model.center[0],
      y: model.center[1],
      children: [
        shape,
        ...(input.style.series.labels.enabled
          ? [
              {
                type: "text" as const,
                silent: true,
                x: mark.labelX,
                y: mark.labelY,
                style: {
                  ...fontStyle(input.style.series.labels),
                  fill: input.style.series.labels.color,
                  text: String(
                    input.context.display.seriesLabel(mark.rawValue),
                  ),
                  align: "center" as const,
                  verticalAlign: "middle" as const,
                },
              },
            ]
          : []),
      ],
    };
  });
}
/** Precompute paths before renderItem so malformed pixels use the translation envelope. */
export function radialSeries(
  input: RadialMappingInput,
  model: RadialPreparedModel,
): CustomSeriesOption[] {
  return model.series.map((series) => {
    const shapes = elements(input, model, series);
    return {
      id: series.id,
      name: series.id,
      type: "custom",
      coordinateSystem: "none",
      animation: false,
      itemStyle: {
        color: paint(input, series).fill,
        borderColor: paint(input, series).stroke,
      },
      renderItem: (params) => shapes[params.dataIndex],
      data: series.marks.map((mark) => ({
        name: mark.rowId,
        value: mark.rowIndex,
        rowId: mark.rowId,
        rowIndex: mark.rowIndex,
        category: mark.category,
        rawValue: mark.rawValue,
      })),
    };
  });
}
function content(
  input: RadialMappingInput,
  model: RadialPreparedModel,
  params: unknown,
): string {
  const p = params as { seriesId?: string; data?: { rowId?: string } };
  const source = model.series.find((series) => series.id === p.seriesId);
  const mark = source?.marks.find((m) => m.rowId === p.data?.rowId);
  if (!mark) return "";
  const mode = input.style.application.tooltip.mode;
  const lines = model.series
    .filter((s) => s.visible && (mode === "shared" || s.id === p.seriesId))
    .flatMap((s) => {
      const datum = s.marks.find((m) => m.rowId === mark.rowId);
      return datum
        ? [
            `${escapeHtml(s.label)}: ${escapeHtml(input.context.display.tooltipNumber(datum.rawValue))}`,
          ]
        : [];
    });
  return [
    ...(mode === "compact"
      ? []
      : [escapeHtml(String(input.context.display.category(mark.category)))]),
    ...lines,
  ].join("<br/>");
}
export function radialTooltip(
  input: RadialMappingInput,
  model: RadialPreparedModel,
): TooltipComponentOption {
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item",
    confine: true,
    formatter: (params) => content(input, model, params),
  };
}
