import type { ApplicationEditorState } from "../compatibility/editorBindings/types";
import type {
  BoxPlotMappingInput,
  BoxPlotProjection,
  BoxStroke,
} from "../echarts/boxPlotTypes";
export function isBoxPlotFamily(value: unknown): value is "boxPlot" {
  return value === "boxPlot";
}
export type BoxPlotEditIntent = {
  panel: "boxPlot";
  edit:
    | { kind: "direction"; value: "vertical" | "horizontal" }
    | {
        kind: "whisker";
        field: keyof BoxStroke;
        value: string | number | readonly number[];
      }
    | { kind: "cap"; value: number };
};
export interface BoxPlotControlValues {
  readonly direction: "vertical" | "horizontal";
  readonly whisker: BoxStroke;
  readonly cap: { readonly lengthRatio: number };
}
export interface BoxPlotEditorProjection {
  readonly style: BoxPlotMappingInput["style"];
  readonly projection: BoxPlotProjection;
  readonly controls: BoxPlotControlValues;
}
export type BoxPlotEditorState = ApplicationEditorState;
