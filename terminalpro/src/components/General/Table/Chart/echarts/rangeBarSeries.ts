import type { CustomSeriesOption } from "echarts";
import { rangeCoordinate } from "./rangeBarAxes";
import { createRangeRenderer } from "./rangeBarGeometry";
import type {
  RangeBarMappingInput,
  RangeBarProjection,
  RangeBarText,
} from "./rangeBarTypes";

export function rangeBarSeries(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
  text: RangeBarText,
): CustomSeriesOption[] {
  const vertical = input.style.direction === "vertical";
  return projection.fields.map((field, index) => ({
    id: field.descriptor.id,
    name: field.descriptor.id,
    type: "custom",
    coordinateSystem: "cartesian2d",
    clip: true,
    animation: false,
    dimensions: ["slot", "min", "max"],
    encode: vertical ? { x: 0, y: [1, 2] } : { x: [1, 2], y: 0 },
    itemStyle: { color: input.style.fields[field.descriptor.id].fill },
    data: field.data.map((d) => ({
      value: [
        d.groupSlot,
        ...(d.summary && input.style.valueScale !== null
          ? [
              rangeCoordinate(d.summary.min, input),
              rangeCoordinate(d.summary.max, input),
            ]
          : [null, null]),
      ],
      metadata: {
        fieldId: field.descriptor.id,
        groupSlot: d.groupSlot,
        summary: d.summary,
        count: d.count,
        sourceRowIds: [...d.sourceRowIds],
      },
    })),
    renderItem: createRangeRenderer(input, projection, index, text),
  }));
}
