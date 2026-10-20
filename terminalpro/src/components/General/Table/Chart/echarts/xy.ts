import { admitXy, xyFailure } from "./xyAdmission";
import { xyAxes } from "./xyAxes";
import { xyLayout } from "./xyLayout";
import { xySeries, xyTooltip } from "./xySeries";
import type { TranslateXy } from "./xyTypes";
function finiteGeometry(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite XY geometry.");
  if (value !== null && typeof value === "object")
    Object.values(value).forEach(finiteGeometry);
}
/** Inactive projection: callers retain snapshot, assignment and appearance ownership. */
export const translateXy: TranslateXy = (input) => {
  try {
    const failure = admitXy(input);
    if (failure) return failure;
    const c = input.style.common;
    const options = {
      animation: false,
      textStyle: {
        color: c.textColor,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
      },
      ...xyLayout(input),
      ...xyAxes(input),
      series: xySeries(input),
      tooltip: xyTooltip(input),
    };
    finiteGeometry(options);
    return { status: "supported", options };
  } catch {
    return xyFailure(
      "XY input could not be safely inspected or projected into finite geometry.",
    );
  }
};
