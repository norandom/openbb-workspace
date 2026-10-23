import type { ComboAssignmentCommand } from "../../application/comboSessionTypes";
import type { ComboSeriesAssignment } from "../../compatibility/comboAssignments";
import type { ComboGeometry } from "../../echarts/comboTypes";
export type ApplicationEditorMode =
  | { kind: "ordinary" }
  | {
      kind: "waterfall";
      controls: import("../../application/waterfallTypes").WaterfallControlValues;
      onEdit: (edit: import("../../application/waterfallTypes").WaterfallEdit) => void;
    }
  | ({
      kind: "range";
      onEdit: (
        edit: import("../../application/rangeSessionTypes").RangeEditIntent["edit"],
      ) => void;
    } & import("../../application/rangeSessionTypes").RangeEditorProjection)
  | {
      kind: "boxPlot";
      controls: import("../../application/boxPlotSessionTypes").BoxPlotControlValues;
      onEdit: (
        edit: import("../../application/boxPlotSessionTypes").BoxPlotEditIntent["edit"],
      ) => void;
    }
  | { kind: "pie"; canSwitchCategorySeries: boolean }
  | ({
      kind: "histogram";
      onEdit: (
        edit: import("../../application/histogramSessionTypes").HistogramEditIntent["edit"],
      ) => void;
    } & import("../../application/histogramSessionTypes").HistogramEditorProjection)
  | ({
      kind: "xy";
      onEdit: (
        edit: import("../../application/xySessionTypes").XyEditIntent["edit"],
      ) => void;
    } & import("../../application/xySessionTypes").XyEditorProjection)
  | {
      kind: "combo";
      assignments: readonly Readonly<ComboSeriesAssignment>[];
      geometry: ComboGeometry;
      activeGeometries: readonly ComboGeometry[];
      onAssignment: (
        colId: string,
        edit: ComboAssignmentCommand["intent"]["edit"],
      ) => void;
      onGeometry: (geometry: ComboGeometry) => void;
    };
