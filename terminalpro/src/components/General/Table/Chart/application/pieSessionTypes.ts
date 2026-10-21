import type { ApplicationEditorState } from "../compatibility/editorBindings/types";
import type { PieChartType } from "../compatibility/pieAssignments";
import type { ChartLabelsEdit, ChartLabelsPanelProps } from "../editor/labels/ChartLabelsPanel";
import type { ChartNumberInputProps } from "../editor/series/ChartNumberInput";

export function isPieChartFamily(value: unknown): value is PieChartType {
  return value === "pie" || value === "donut" || value === "doughnut";
}
export type PieLabelKind = "calloutLabel" | "sectorLabel";
export type PieEditIntent =
  | { panel: "pieLabel"; label: PieLabelKind; edit: ChartLabelsEdit }
  | { panel: "pieCallout"; edit: { field: "length" | "strokeWidth" | "offset"; value: number } }
  | { panel: "pieSector"; edit: { field: "positionRatio"; value: number } };
export type LabelPanelValue = Omit<ChartLabelsPanelProps, "onEdit">;
export type NumericControl = Omit<ChartNumberInputProps, "onChange">;
export interface PieLabelControlsProps {
  readonly callout: LabelPanelValue;
  readonly sector: LabelPanelValue;
  readonly calloutControls: Readonly<Record<"length" | "strokeWidth" | "offset", NumericControl>>;
  readonly sectorPosition: NumericControl;
  readonly onIntent: (intent: PieEditIntent) => void;
}
export type PieEditorState = Pick<ApplicationEditorState,
  "legend" | "padding" | "background" | "tooltips" | "series" | "shadow"> &
  Omit<PieLabelControlsProps, "onIntent"> & { readonly kind: "pie";
    readonly titles: Omit<import("../editor/titles/ChartTitlesPanel").AvailableChartTitlesProps, "onEdit"> };
