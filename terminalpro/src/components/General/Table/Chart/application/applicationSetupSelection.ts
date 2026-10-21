import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { isComboChartFamily, type ApplicationChartFamily, type ComboSessionContext } from "./comboSessionTypes";
import { selectComboSession } from "./comboSessionSelection";
import { selectApplicationSession } from "./applicationSessionSelection";
import { selectHistogramSession } from "./histogramSessionSelection";
import { isXyChartFamily } from "./xySessionTypes";
import { selectXySession } from "./xySessionSelection";
import { isPieChartFamily } from "./pieSessionTypes";
import { selectPieSession } from "./pieSessionSelection";

export { canSwitchCategorySeries } from "./applicationSessionSelection";
export function selectApplicationSetup(storage: ChartStorageOutput, context: ApplicationSessionContext<ApplicationChartFamily>) {
  const family = context.inputs.family;
  if (isComboChartFamily(family)) return selectComboSession(storage, context as ComboSessionContext);
  const value = isPieChartFamily(family) ? selectPieSession(storage, context as ApplicationSessionContext<import("../compatibility/pieAssignments").PieChartType>)
    : family === "histogram" ? selectHistogramSession(storage, context as ApplicationSessionContext<"histogram">)
    : isXyChartFamily(family) ? selectXySession(storage, context as ApplicationSessionContext<import("../compatibility/xyAssignments").XyChartType>)
    : selectApplicationSession(storage, context as ApplicationSessionContext);
  return { status: "ready" as const, stamp: context.local.stamp, value };
}
