import type { CustomSeriesOption } from "echarts";
import { rangeCoordinate } from "./rangeBarAxes";
import { rangeBarCategoryCoordinate } from "./rangeBarBands";
import { createRangeRenderer } from "./rangeBarGeometry";
import type {
  RangeBarMappingInput,
  RangeBarProjection,
  RangeBarText,
} from "./rangeBarTypes";
import type { RangeCategoryPlan } from "./rangeCategoryTypes";

export function rangeBarSeries(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
  text: RangeBarText,
  category: RangeCategoryPlan,
): CustomSeriesOption[] {
  const vertical = input.style.direction === "vertical";
  return projection.fields.map((field, index) => ({
    id: field.descriptor.id,
    name: field.descriptor.id,
    type: "custom",
    coordinateSystem: "cartesian2d",
    clip: true,
    animation: false,
    dimensions: ["coordinate", "min", "max", "groupSlot"],
    encode: vertical ? { x: 0, y: [1, 2] } : { x: [1, 2], y: 0 },
    itemStyle: { color: input.style.fields[field.descriptor.id].fill },
    data: field.data
      .filter((d) => rangeBarCategoryCoordinate(category, d.groupSlot) !== null)
      .map((d) => ({
        value: [
          rangeBarCategoryCoordinate(category, d.groupSlot),
          ...(d.summary && input.style.valueScale !== null
            ? [
                rangeCoordinate(d.summary.min, input),
                rangeCoordinate(d.summary.max, input),
              ]
            : [null, null]),
          d.groupSlot,
        ],
        metadata: {
          fieldId: field.descriptor.id,
          groupSlot: d.groupSlot,
          summary: d.summary,
          count: d.count,
          sourceRowIds: [...d.sourceRowIds],
        },
      })),
    renderItem: createRangeRenderer(input, projection, index, text, category),
  }));
}
