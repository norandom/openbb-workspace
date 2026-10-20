import { xyEmptyAxes } from "./xyEmptyDomain";
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
/** Pure projection: callers retain snapshot, assignment and appearance ownership. */
export const translateXy: TranslateXy = (input) => {
  try {
    const failure = admitXy(input);
    if (failure) return failure;
    const empty = xyEmptyAxes(input);
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
      series: xySeries(input).map((series) => empty.length ? { ...series, data: [] } : series),
      tooltip: xyTooltip(input),
    };
    for (const id of empty) {
      const axis = id === "x" ? options.xAxis : options.yAxis;
      Object.assign(axis, { show: false, min: undefined, max: undefined });
    }
    finiteGeometry(options);
    return { status: "supported", options };
  } catch {
    return xyFailure(
      "XY input could not be safely inspected or projected into finite geometry.",
    );
  }
};
