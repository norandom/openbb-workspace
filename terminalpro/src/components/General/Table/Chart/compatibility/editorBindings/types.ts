import type { ChartModel, RuntimeOptions, ValidationResult } from "../legacyTypes";
import type { ResolvedRange, SessionStamp, SessionResult } from "../../application/types";
import type { ApplicationAxisId, ApplicationResolvedStyle, ResolvedFontStyle } from "../../application/appearanceModel";
import type { CartesianFamily } from "../../echarts/cartesianTypes";
import type { ChartTitlesPanelProps, ChartCaptionEdit } from "../../editor/titles/ChartTitlesPanel";
import type { ChartLegendPanelProps, ChartLegendEdit } from "../../editor/legend/ChartLegendPanel";
import type { ChartPaddingPanelProps, ChartPaddingEdit } from "../../editor/padding/ChartPaddingPanel";
import type { ChartBackgroundPanelProps, ChartBackgroundEdit } from "../../editor/background/ChartBackgroundPanel";
import type { ChartTooltipsPanelProps, ChartTooltipsEdit } from "../../editor/tooltips/ChartTooltipsPanel";
import type { ChartSeriesStylePanelProps } from "../../editor/series/ChartSeriesStylePanel";
import type { ChartShadowPanelProps, ChartShadowEdit } from "../../editor/shadow/ChartShadowPanel";
import type { ChartLabelsPanelProps, ChartLabelsEdit } from "../../editor/labels/ChartLabelsPanel";
import type { ChartMarkersPanelProps, ChartMarkersEdit } from "../../editor/markers/ChartMarkersPanel";
import type { ChartAxisFieldsPanelProps, ChartAxisFieldsEdit } from "../../editor/axis/ChartAxisFieldsPanel";
import type { ChartAxisLabelsPanelProps, ChartAxisLabelsEdit } from "../../editor/axis/ChartAxisLabelsPanel";
import type { ChartGridLinesPanelProps, ChartGridLinesEdit } from "../../editor/axis/ChartGridLinesPanel";
import type { ChartTicksPanelProps, ChartTicksEdit } from "../../editor/axis/ChartTicksPanel";

type Values<Props> = Omit<Props, "onEdit">;
type Metadata<Props> = Omit<Props, "onEdit" | "value">;
export interface AxisBinding {
  readonly axis: ApplicationAxisId;
  readonly optionType: "category" | "number" | "time" | "grouped-category";
  readonly direction: "x" | "y";
}
/** Current retained values needed by source operations; never a saved style payload. */
export interface FontEditContext { readonly predefined: ResolvedFontStyle }
export type AxisAppearanceEdit = ChartAxisFieldsEdit & { field: "color" | "thickness" };
export type AxisStructureEdit = ChartAxisFieldsEdit & { field: "type" | "timeFormat" | "position" };
/** These edits update concrete axes/model state, not the appearance patch reducer. */
export interface ApplicationAxisStructureEvent {
  readonly panel: "axisStructure";
  readonly axis: ApplicationAxisId;
  readonly edit: AxisStructureEdit;
}
export type ApplicationEditorEvent =
  | { readonly panel: "titles"; readonly edit: ChartCaptionEdit; readonly font: FontEditContext; readonly axisBinding?: AxisBinding }
  | { readonly panel: "legend"; readonly edit: ChartLegendEdit; readonly font: FontEditContext }
  | { readonly panel: "padding"; readonly edit: ChartPaddingEdit }
  | { readonly panel: "background"; readonly edit: ChartBackgroundEdit }
  | { readonly panel: "tooltips"; readonly edit: ChartTooltipsEdit }
  | { readonly panel: "series"; readonly edit: Parameters<ChartSeriesStylePanelProps["onEdit"]>[0] }
  | { readonly panel: "shadow"; readonly edit: ChartShadowEdit }
  | { readonly panel: "labels"; readonly edit: ChartLabelsEdit; readonly font: FontEditContext }
  | { readonly panel: "markers"; readonly edit: ChartMarkersEdit }
  | { readonly panel: "connectMissingData"; readonly value: boolean }
  | { readonly panel: "axis"; readonly binding: AxisBinding; readonly edit: AxisAppearanceEdit }
  | { readonly panel: "axisLabels"; readonly binding: AxisBinding; readonly edit: ChartAxisLabelsEdit; readonly font: FontEditContext; readonly manualRotation: number | undefined }
  | { readonly panel: "grid"; readonly binding: AxisBinding; readonly edit: ChartGridLinesEdit; readonly firstStyle: { readonly stroke: string; readonly lineDash: readonly number[] } }
  | { readonly panel: "ticks"; readonly binding: AxisBinding; readonly edit: ChartTicksEdit };

export interface ApplicationAxisEditorState {
  readonly fields: Values<ChartAxisFieldsPanelProps>;
  readonly labels: Values<ChartAxisLabelsPanelProps>;
  readonly grid: Values<ChartGridLinesPanelProps>;
  readonly ticks: Values<ChartTicksPanelProps>;
}
export interface ApplicationEditorState {
  readonly titles: Values<ChartTitlesPanelProps>;
  readonly legend: Values<ChartLegendPanelProps>;
  readonly padding: Values<ChartPaddingPanelProps>;
  readonly background: Values<ChartBackgroundPanelProps>;
  readonly tooltips: Values<ChartTooltipsPanelProps>;
  readonly series: Values<ChartSeriesStylePanelProps>;
  readonly shadow: Values<ChartShadowPanelProps>;
  readonly labels: Values<ChartLabelsPanelProps>;
  readonly markers: Values<ChartMarkersPanelProps>;
  readonly connectMissingData: boolean;
  readonly axes: Readonly<Record<ApplicationAxisId, ApplicationAxisEditorState>>;
  readonly eligibility: EditorEligibility;
}
export interface EditorEligibility {
  readonly legend: boolean;
  readonly shadow: boolean;
  readonly labels: boolean;
  readonly markers: boolean;
  readonly connectMissingData: boolean;
  readonly axes: Readonly<Record<ApplicationAxisId, {
    readonly type: boolean;
    readonly timeFormat: boolean;
    readonly position: boolean;
    readonly grid: boolean;
    readonly ticks: boolean;
    readonly tickLength: boolean;
    readonly autoRotate: boolean;
  }>>;
}
/** Full original menus and numeric bounds, never the shortened preview examples. */
export interface EditorMetadata {
  readonly titles: Metadata<ChartTitlesPanelProps>;
  readonly legend: Metadata<ChartLegendPanelProps>;
  readonly padding: Metadata<ChartPaddingPanelProps>;
  readonly tooltips: Metadata<ChartTooltipsPanelProps>;
  readonly labels: Metadata<ChartLabelsPanelProps>;
  readonly markers: Metadata<ChartMarkersPanelProps>;
  readonly axes: Readonly<Record<ApplicationAxisId, {
    readonly fields: Metadata<ChartAxisFieldsPanelProps>;
    readonly labels: Metadata<ChartAxisLabelsPanelProps>;
    readonly ticks: Metadata<ChartTicksPanelProps>;
  }>>;
}
export interface EditorSelectionInput {
  readonly style: ApplicationResolvedStyle;
  readonly family: CartesianFamily;
  readonly model: ChartModel;
  readonly range: ResolvedRange;
  readonly metadata: EditorMetadata;
  /** Calculated from the original family/data predicates at the caller boundary. */
  readonly eligibility: EditorEligibility;
}
export type EditorSelectionResult = ValidationResult<ApplicationEditorState>;
export type SelectApplicationEditorState = (input: EditorSelectionInput) => EditorSelectionResult;
export type MapApplicationEditorEvent = (
  event: ApplicationEditorEvent,
  family: CartesianFamily,
) => ValidationResult<RuntimeOptions>;
export interface ApplicationEditorCommand {
  readonly stamp: SessionStamp;
  readonly family: CartesianFamily;
  readonly intent: ApplicationEditorIntent | ApplicationAxisStructureEvent;
}
/** Strip every resolved value from UI dispatch; only the requested edit crosses renders. */
type IntentOf<Event> = Event extends { readonly binding: AxisBinding }
  ? Omit<Event, "binding" | "font" | "manualRotation" | "firstStyle"> & { readonly axis: ApplicationAxisId }
  : Omit<Event, "font" | "axisBinding">;
export type ApplicationEditorIntent = IntentOf<ApplicationEditorEvent>;
export interface RehydrateEditorEventInput {
  readonly intent: ApplicationEditorIntent;
  readonly selection: EditorSelectionInput;
  readonly bindings: Readonly<Record<ApplicationAxisId, AxisBinding>>;
  readonly manualRotations: Readonly<Record<ApplicationAxisId, number | undefined>>;
}
/** Execute inside the functional Widget update against freshly resolved latest storage. */
export type RehydrateApplicationEditorEvent = (
  input: RehydrateEditorEventInput,
) => ValidationResult<ApplicationEditorEvent>;
/** Validate address/generation/data identity, then return the latest accepted full stamp. */
export type ValidateSynchronousEditorStamp = (
  viewStamp: SessionStamp,
  currentStamp: SessionStamp,
) => SessionResult<SessionStamp>;
// Implementations: selectApplicationEditorState: SelectApplicationEditorState;
// mapApplicationEditorEvent: MapApplicationEditorEvent. Validate untrusted runtime input.
