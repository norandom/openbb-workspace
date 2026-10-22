import type {
  ComboAssignmentDiagnostic,
  ComboChartType,
  ComboSeriesAssignment,
  ComboSeriesChartType,
} from "../compatibility/comboAssignments";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { CartesianFamily } from "../echarts/cartesianTypes";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import type { ResolvedRange, SessionStamp } from "./types";

export type ApplicationChartFamily =
  | CartesianFamily
  | ComboChartType
  | import("../compatibility/xyAssignments").XyChartType
  | "histogram"
  | "boxPlot"
  | "rangeBar"
  | "rangeArea"
  | import("../compatibility/pieAssignments").PieChartType;
export type ComboSessionContext = ApplicationSessionContext<ComboChartType>;
export function isComboChartFamily(value: unknown): value is ComboChartType {
  return (
    value === "columnLineCombo" ||
    value === "areaColumnCombo" ||
    value === "customCombo"
  );
}
export interface ComboAssignmentCommand {
  readonly stamp: SessionStamp;
  readonly family: ComboChartType;
  readonly intent: {
    readonly panel: "comboAssignment";
    readonly colId: string;
    readonly edit:
      | { readonly kind: "type"; readonly value: ComboSeriesChartType }
      | { readonly kind: "secondaryAxis"; readonly value: boolean };
  };
}
export interface ComboSessionAssignmentSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly chartType: ComboChartType;
  readonly seriesChartTypes: readonly Readonly<ComboSeriesAssignment>[];
  readonly diagnostics: readonly ComboAssignmentDiagnostic[];
}
