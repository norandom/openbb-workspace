import { admitPie, pieFailure } from "./pieAdmission";
import { pieData } from "./pieData";
import { pieLayout } from "./pieLayout";
import { pieSeries, pieTooltip } from "./pieSeries";
import type { TranslatePie } from "./pieTypes";

function finiteGeometry(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite pie projection");
  if (value !== null && typeof value === "object")
    Object.values(value).forEach(finiteGeometry);
}
/** Inactive pure mapper; saved state and session lifecycle remain caller-owned. */
export const translatePie: TranslatePie = (input) => {
  try {
    const admitted = admitPie(input);
    if ("status" in admitted) return admitted;
    const rings = pieData(admitted);
    const layout = pieLayout(admitted, rings);
    const c = admitted.style.common;
    const options = {
      animation: false,
      textStyle: {
        color: c.textColor,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
      },
      ...layout.options,
      series: pieSeries(admitted, rings, layout.geometry),
      tooltip: pieTooltip(admitted),
    };
    finiteGeometry(options);
    return {
      status: "supported",
      options,
      ...(layout.legendPagination ? { legendPagination: layout.legendPagination } : {}),
    };
  } catch {
    return pieFailure(
      "Pie input could not be safely inspected or projected into finite geometry.",
    );
  }
};
