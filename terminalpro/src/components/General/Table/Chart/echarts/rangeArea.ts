import { admitRangeArea, rangeFailure } from "./rangeAreaAdmission";
import { rangeAreaAxes } from "./rangeAreaAxes";
import { preflightRangeArea, rangeAreaSeries } from "./rangeAreaSeries";
import { prepareRangeText, rangeAreaTooltip } from "./rangeAreaTooltip";
import type {
  RangeAreaMappingInput,
  RangeAreaTranslationResult,
} from "./rangeAreaTypes";
import { projectRangeBar } from "./rangeBarProjection";
/** Pure inactive mapper; callers retain scale resolution and application lifecycle. */
export function translateRangeArea(
  value: RangeAreaMappingInput,
): RangeAreaTranslationResult {
  try {
    const admitted = admitRangeArea(value);
    if ("status" in admitted) return admitted;
    const { input } = admitted;
    const result = projectRangeBar(input.snapshot, input.context.legendSelection);
    if (result.status !== "resolved") return result;
    const { projection } = result;
    const text = prepareRangeText(input, projection);
    preflightRangeArea(input, projection, text);
    const p = input.context.plot;
    return {
      status: "supported",
      projection,
      options: {
        animation: false,
        grid: {
          left: p.left,
          top: p.top,
          width: p.width,
          height: p.height,
          containLabel: false,
        },
        ...rangeAreaAxes(input, projection, text),
        series: rangeAreaSeries(input, projection, text),
        tooltip: rangeAreaTooltip(input, projection, text),
      },
    };
  } catch {
    return rangeFailure(
      "Range Area input could not be safely projected into finite geometry and display text.",
    );
  }
}
