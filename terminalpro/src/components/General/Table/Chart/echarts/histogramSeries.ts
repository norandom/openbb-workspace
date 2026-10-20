import { color, type CustomSeriesOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { histogramTooltipText } from "./histogramTooltip";
import type { HistogramDatum, HistogramProjection } from "./histogramTypes";

function alpha(value: string, opacity: number): string {
  if (opacity === 1) return value;
  const parsed = color.parse(value);
  const result = parsed && color.modifyAlpha(value, parsed[3] * opacity);
  if (!result) throw Error("Cannot apply histogram opacity to color.");
  return result;
}
function dataFor({ input, field, calculation }: HistogramProjection): HistogramDatum[] {
  if (!field) return [];
  return calculation.groups.map(group => ({
    value: [...calculation.bins[group.intervalIndex], group.frequency] as [number, number, number],
    metadata: { field, intervalIndex: group.intervalIndex, observationIndices: [...group.observationIndices],
      rowIds: group.observationIndices.map(i => input.snapshot.rows[i].id) },
  })).sort((a, b) => a.value[0] - b.value[0] || a.value[1] - b.value[1]);
}
function rectStyle(input: HistogramProjection["input"]) {
  const { series: s, application: { palette } } = input.style;
  return {
    fill: alpha(s.fill ?? palette.fills[0], s.fillOpacity),
    stroke: alpha(s.stroke ?? palette.strokes[0], s.strokeOpacity),
    lineWidth: s.strokeWidth, lineDash: [...s.lineDash],
    ...(s.shadow.enabled ? { shadowBlur: s.shadow.blur, shadowColor: s.shadow.color,
      shadowOffsetX: s.shadow.xOffset, shadowOffsetY: s.shadow.yOffset } : {}),
  };
}
export function createHistogramRenderer(
  input: HistogramProjection["input"],
  data: readonly HistogramDatum[],
  labelsEnabled = input.style.series.labels.enabled,
): NonNullable<CustomSeriesOption["renderItem"]> {
  const s = input.style.series, style = rectStyle(input);
  const labels = data.map(d => String(input.context.display.seriesLabel(d.value[2])));
  data.forEach(d => histogramTooltipText(input, d));
  return (params, api) => {
      const lower = Number(api.value(0)), upper = Number(api.value(1)), frequency = Number(api.value(2));
      if (!(frequency > 0)) return;
      const low = api.coord([lower, 0]), high = api.coord([upper, frequency]);
      if (![...low, ...high].every(Number.isFinite)) return;
      const shape = { x: Math.min(low[0], high[0]), y: Math.min(low[1], high[1]),
        width: Math.abs(high[0] - low[0]), height: Math.abs(high[1] - low[1]) };
      if (!shape.width || !shape.height) return;
      // Native clipping keeps the original edge and full-bin label anchor intact.
      return { type: "rect", shape, style,
        ...(labelsEnabled ? {
          textContent: { type: "text", style: { ...fontStyle(s.labels), fill: s.labels.color,
            text: labels[params.dataIndex], align: "center", verticalAlign: "middle" } },
          textConfig: { position: "inside", insideFill: s.labels.color, insideStroke: "transparent" },
        } : {}),
      };
    };
}
export function histogramSeries(projection: HistogramProjection, empty: boolean): CustomSeriesOption[] {
  const { input, field } = projection;
  if (!field) return [];
  const s = input.style.series, data = dataFor(projection), style = rectStyle(input);
  return [{
    type: "custom", coordinateSystem: "cartesian2d", clip: true, animation: false,
    id: JSON.stringify(["histogram", field.id]), name: field.id,
    dimensions: ["lower", "upper", "frequency"], encode: { x: [0, 1], y: 2 },
    itemStyle: { color: style.fill, borderColor: style.stroke, borderWidth: s.strokeWidth },
    data: empty ? [] : data,
    renderItem: createHistogramRenderer(input, data),
  }];
}
