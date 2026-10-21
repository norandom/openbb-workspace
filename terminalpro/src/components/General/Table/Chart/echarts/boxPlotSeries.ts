import type { CustomSeriesOption } from "echarts";
import type { BoxValueScale } from "./boxPlotDomain";
import { createBoxRenderer } from "./boxPlotGeometry";
import type { BoxPlotMappingInput, BoxPlotProjection } from "./boxPlotTypes";

export function boxPlotSeries(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  scale: BoxValueScale,
  empty: boolean,
): CustomSeriesOption[] {
  const vertical = input.style.direction === "vertical";
  return projection.fields.map((field, index) => ({
    id: field.descriptor.id,
    name: field.descriptor.id,
    type: "custom",
    coordinateSystem: "cartesian2d",
    clip: true,
    animation: false,
    dimensions: ["slot", "min", "q1", "median", "q3", "max"],
    encode: vertical ? { x: 0, y: [1, 2, 3, 4, 5] } : { x: [1, 2, 3, 4, 5], y: 0 },
    itemStyle: { color: input.style.fields[field.descriptor.id].fill },
    data: field.data.map((d) => ({
      value: [
        d.groupSlot,
        ...(d.summary
          ? [d.summary.min, d.summary.q1, d.summary.median, d.summary.q3, d.summary.max]
          : [null, null, null, null, null]),
      ],
      metadata: { fieldId: field.descriptor.id, groupSlot: d.groupSlot },
    })),
    renderItem: createBoxRenderer(input, projection, index, scale, empty),
  }));
}
