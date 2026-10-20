import type { ComboSeriesAssignment } from "../../compatibility/comboAssignments";
import type { ComboGeometry } from "../../echarts/comboTypes";
import type { ComboAssignmentCommand } from "../../application/comboSessionTypes";
export type ApplicationEditorMode =
  | { kind: "ordinary" }
  | ({ kind: "xy"; onEdit: (edit: import("../../application/xySessionTypes").XyEditIntent["edit"]) => void } & import("../../application/xySessionTypes").XyEditorProjection)
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
