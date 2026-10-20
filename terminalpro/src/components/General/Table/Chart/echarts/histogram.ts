import { admitHistogram, histogramFailure } from "./histogramAdmission";
import { histogramAxes, histogramDomain } from "./histogramAxes";
import { histogramLayout } from "./histogramLayout";
import { histogramSeries } from "./histogramSeries";
import { histogramTooltip } from "./histogramTooltip";
import type { TranslateHistogram } from "./histogramTypes";

function finiteGeometry(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw Error("Nonfinite histogram geometry.");
  if (value !== null && typeof value === "object") Object.values(value).forEach(finiteGeometry);
}
/** Inactive projection: snapshot, appearance and session state stay caller-owned. */
export const translateHistogram: TranslateHistogram = input => {
  try {
    const admitted = admitHistogram(input);
    if (admitted.status !== "admitted") return admitted;
    const validated = admitted.input, c = validated.style.common;
    const domain = histogramDomain(admitted);
    const options = {
      animation: false,
      textStyle: { color: c.textColor, fontFamily: c.fontFamily, fontSize: c.fontSize },
      ...histogramLayout(admitted), ...histogramAxes(validated, domain),
      series: histogramSeries(admitted, domain.emptyAxes.length > 0 ||
        validated.context.viewport.width === 0 || validated.context.viewport.height === 0),
      tooltip: histogramTooltip(validated),
    };
    finiteGeometry(options);
    return { status: "supported", options };
  } catch {
    return histogramFailure("Histogram input could not be safely inspected or projected into finite geometry.");
  }
};
