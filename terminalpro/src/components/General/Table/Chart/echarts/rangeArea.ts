import { admitRangeArea, rangeFailure } from "./rangeAreaAdmission";
import { rangeAreaAxes } from "./rangeAreaAxes";
import { preflightRangeArea, rangeAreaSeries } from "./rangeAreaSeries";
import { prepareRangeText, rangeAreaTooltip } from "./rangeAreaTooltip";
import type {
  RangeAreaMappingInput,
  RangeAreaTranslationResult,
} from "./rangeAreaTypes";
import { projectRangeBar } from "./rangeBarProjection";
import { rangeCategoryData, resolveRangeCategory } from "./rangeCategoryCoordinates";
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
    const data = rangeCategoryData(
      projection,
      input.style.categoryCoordinates?.kind ?? "category",
      "area",
    );
    const text = prepareRangeText(input, projection, data);
    const category = resolveRangeCategory(
      input.style,
      projection,
      text.categories,
      "area",
    );
    preflightRangeArea(input, projection, text, category);
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
        ...rangeAreaAxes(input, text, category),
        series: rangeAreaSeries(input, projection, text, category),
        tooltip: rangeAreaTooltip(input, projection, text, category),
      },
    };
  } catch {
    return rangeFailure(
      "Range Area input could not be safely projected into finite geometry and display text.",
    );
  }
}
