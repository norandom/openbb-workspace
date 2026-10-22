import type { EChartsOption, GridComponentOption } from "echarts";
import { translateRangeArea } from "./rangeArea";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import { translateRangeBar } from "./rangeBar";
import type { RangeBarMappingInput } from "./rangeBarTypes";
import type { RangeComposed } from "./rangeLiveTypes";

export function rangeNavigatorOverview(
  full: RangeComposed,
  grid: GridComponentOption,
  viewport: { readonly width: number; readonly height: number },
): EChartsOption {
  const plot = {
    left: Number(grid.left),
    top: viewport.height - Number(grid.bottom) - Number(grid.height),
    width: Math.max(0, viewport.width - Number(grid.left) - Number(grid.right)),
    height: Number(grid.height),
  };
  const fields = Object.fromEntries(
    Object.entries(full.mapping.style.fields).map(([id, style]) => [
      id,
      { ...style, label: { ...style.label, enabled: false } },
    ]),
  );
  const mapping = {
    ...full.mapping,
    style: { ...full.mapping.style, fields },
    context: { ...full.mapping.context, plot },
  };
  const result =
    "direction" in mapping.style
      ? translateRangeBar(mapping as RangeBarMappingInput)
      : translateRangeArea(mapping as RangeAreaMappingInput);
  if (result.status !== "supported") throw Error(JSON.stringify(result.diagnostics));
  return result.options;
}
