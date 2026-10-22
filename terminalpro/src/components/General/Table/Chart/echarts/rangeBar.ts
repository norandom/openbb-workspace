import { admitRangeBar, rangeFailure } from "./rangeBarAdmission";
import { rangeBarAxes } from "./rangeBarAxes";
import { preflightRangeGeometry } from "./rangeBarGeometry";
import { projectRangeBar } from "./rangeBarProjection";
import { rangeBarSeries } from "./rangeBarSeries";
import { prepareRangeText, rangeBarTooltip } from "./rangeBarTooltip";
import type { RangeBarMappingInput, RangeBarTranslationResult } from "./rangeBarTypes";
import { rangeCategoryData, resolveRangeCategory } from "./rangeCategoryCoordinates";

/** Inactive pure core: capture, automatic scale resolution and application lifecycle stay with callers. */
export function translateRangeBar(
  value: RangeBarMappingInput,
): RangeBarTranslationResult {
  try {
    const admitted = admitRangeBar(value);
    if ("status" in admitted) return admitted;
    const { input } = admitted;
    const result = projectRangeBar(input.snapshot, input.context.legendSelection);
    if (result.status !== "resolved") return result;
    const { projection } = result;
    const data = rangeCategoryData(
      projection,
      input.style.categoryCoordinates?.kind ?? "category",
      "bar",
    );
    const text = prepareRangeText(input, projection, data);
    const category = resolveRangeCategory(
      input.style,
      projection,
      text.categories,
      "bar",
    );
    preflightRangeGeometry(input, projection, text, category);
    const p = input.context.plot;
    const options = {
      animation: false,
      grid: {
        left: p.left,
        top: p.top,
        width: p.width,
        height: p.height,
        containLabel: false,
      },
      ...rangeBarAxes(input, text, category),
      series: rangeBarSeries(input, projection, text, category),
      tooltip: rangeBarTooltip(input, projection, text, category),
    };
    return { status: "supported", options, projection };
  } catch {
    return rangeFailure(
      "Range Bar input could not be safely projected into finite geometry and display text.",
    );
  }
}
