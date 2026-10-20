import type { ComboSeriesAssignment } from "../compatibility/comboAssignments";
import type { ComboGeometry } from "../echarts/comboTypes";
import type {
  ApplicationSessionReady,
  ApplicationSessionCommand,
} from "./applicationSessionTypes";
import type {
  ApplicationChartFamily,
  ComboAssignmentCommand,
} from "./comboSessionTypes";
import type { SessionStamp } from "./types";
export type ApplicationChartReady =
  | (ApplicationSessionReady & { readonly kind: "cartesian" })
  | (ApplicationSessionReady & {
      readonly kind: "combo";
      readonly combo: {
        readonly assignments: readonly Readonly<ComboSeriesAssignment>[];
        readonly geometry: ComboGeometry;
        readonly activeGeometries: readonly ComboGeometry[];
      };
    });
export interface ApplicationChartCommand {
  readonly stamp: SessionStamp;
  readonly family: ApplicationChartFamily;
  readonly geometry?: ComboGeometry;
  readonly intent:
    | ApplicationSessionCommand["intent"]
    | ComboAssignmentCommand["intent"]
    | { readonly panel: "family"; readonly chartType: ApplicationChartFamily }
    | { readonly panel: "geometry"; readonly geometry: ComboGeometry };
}
