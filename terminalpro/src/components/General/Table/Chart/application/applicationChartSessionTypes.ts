import type { ComboSeriesAssignment } from "../compatibility/comboAssignments";
import type { ComboGeometry } from "../echarts/comboTypes";
import type {
  ApplicationSessionCommand,
  ApplicationSessionReady,
} from "./applicationSessionTypes";
import type {
  ApplicationChartFamily,
  ComboAssignmentCommand,
} from "./comboSessionTypes";
import type { SessionStamp } from "./types";
export type ApplicationChartReady =
  | (Omit<ApplicationSessionReady, "editor"> & {
      readonly kind: "nightingale";
      readonly editor: import("../compatibility/nightingaleContracts").NightingaleEditorState;
    })
  | (Omit<ApplicationSessionReady, "editor"> & {
      readonly kind: "radar";
      readonly editor: import("../compatibility/radarContracts").RadarEditorState;
    })
  | (ApplicationSessionReady & {
      readonly kind: "waterfall";
      readonly family: "waterfall";
      readonly waterfall: {
        readonly controls: import("./waterfallTypes").WaterfallControlValues;
      };
    })
  | import("./rangeSessionTypes").RangeSessionReady
  | (ApplicationSessionReady & {
      readonly kind: "boxPlot";
      readonly boxPlot: import("./boxPlotSessionTypes").BoxPlotEditorProjection;
    })
  | (Omit<ApplicationSessionReady, "editor"> & {
      readonly kind: "pie";
      readonly editor: import("./pieSessionTypes").PieEditorState;
      readonly legendPagination?: import("../echarts/pieLegendTypes").PieLegendPagination;
    })
  | (ApplicationSessionReady & {
      readonly kind: "histogram";
      readonly histogram: import("./histogramSessionTypes").HistogramEditorProjection;
    })
  | (ApplicationSessionReady & {
      readonly kind: "xy";
      readonly xy: import("./xySessionTypes").XyEditorProjection;
    })
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
    | import("../compatibility/nightingaleContracts").NightingaleEditIntent
    | import("../compatibility/radarContracts").RadarEditIntent
    | ApplicationSessionCommand["intent"]
    | import("./waterfallTypes").WaterfallEditIntent
    | import("./rangeSessionTypes").RangeEditIntent
    | import("./boxPlotSessionTypes").BoxPlotEditIntent
    | import("./pieSessionTypes").PieEditIntent
    | import("./xySessionTypes").XyEditIntent
    | import("./histogramSessionTypes").HistogramEditIntent
    | ComboAssignmentCommand["intent"]
    | { readonly panel: "family"; readonly chartType: ApplicationChartFamily }
    | { readonly panel: "geometry"; readonly geometry: ComboGeometry };
}
