import type {
  HeatmapAppearanceInput,
  HeatmapAxisEdit,
  HeatmapAxisId,
  HeatmapEditIntent,
  HeatmapEditorMutation,
  HeatmapEditorState,
  HeatmapMappingInput,
  HeatmapThemePaint,
  HeatmapTitlesState,
  ResolvedHeatmapStyle,
} from "../../../src/components/General/Table/Chart/application/heatmapTypes";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Caption = "title" | "subtitle" | "horizontalAxisTitle" | "verticalAxisTitle";
export type ContractChecks = [
  Assert<Equal<HeatmapAxisId, "x" | "y">>,
  Assert<Equal<keyof HeatmapTitlesState["value"], Caption>>,
  Assert<Equal<keyof HeatmapEditorState["axes"], HeatmapAxisId>>,
  Assert<Equal<Extract<HeatmapAxisEdit, { field: "thickness" }>["value"], number>>,
  Assert<Equal<Extract<HeatmapAxisEdit, { field: "color" }>["value"], string>>,
];

export const edits: readonly HeatmapEditIntent[] = [
  { panel: "heatmapAxis", axis: "x", edit: { field: "color", value: "#123456" } },
  { panel: "heatmapAxis", axis: "y", edit: { field: "color", value: "#654321" } },
  { panel: "heatmapAxis", axis: "x", edit: { field: "thickness", value: 4 } },
  { panel: "heatmapAxis", axis: "y", edit: { field: "thickness", value: 7 } },
  { panel: "titles", edit: { caption: "title", field: "text", value: "Returns" } },
  { panel: "titles", edit: { caption: "subtitle", field: "text", value: "Percent" } },
  {
    panel: "titles",
    edit: { caption: "horizontalAxisTitle", field: "text", value: "Period" },
  },
  {
    panel: "titles",
    edit: { caption: "verticalAxisTitle", field: "text", value: "Asset" },
  },
  { panel: "heatmapLine", edit: { field: "stroke", value: "#123456" } },
  { panel: "heatmapLine", edit: { field: "strokeWidth", value: 2 } },
  { panel: "heatmapLine", edit: { field: "strokeOpacity", value: 0.5 } },
];

// @ts-expect-error Category-axis line widths remain numeric.
export const wrongWidth: HeatmapAxisEdit = { field: "thickness", value: "4" };
// @ts-expect-error Category-axis line colors remain strings.
export const wrongColor: HeatmapAxisEdit = { field: "color", value: 4 };
// @ts-expect-error Heatmap axes cannot change to numeric or time axes.
export const numericAxis: HeatmapAxisEdit = { field: "type", value: "number" };
// @ts-expect-error Category positions are not editable heatmap line fields.
export const positionedAxis: HeatmapAxisEdit = { field: "position", value: "top" };
export const thirdAxis: HeatmapEditIntent = {
  panel: "heatmapAxis",
  // @ts-expect-error Only the two categorical axes are addressable.
  axis: "z",
  edit: { field: "thickness", value: 2 },
};
export const wrongCellWidth: HeatmapEditIntent = {
  panel: "heatmapLine",
  // @ts-expect-error Cell line width cannot receive a color string.
  edit: { field: "strokeWidth", value: "red" },
};
export const fifthCaption: HeatmapEditIntent = {
  panel: "titles",
  // @ts-expect-error All caption IDs are finite.
  edit: { caption: "legendTitle", field: "text", value: "Value" },
};

export function checkReadonly(
  style: ResolvedHeatmapStyle,
  editor: HeatmapEditorState,
  paint: HeatmapThemePaint,
  mapping: HeatmapMappingInput,
  appearance: HeatmapAppearanceInput,
  mutation: HeatmapEditorMutation,
) {
  // @ts-expect-error Resolved palette observations cannot be appended by renderers.
  style.colorRange.push("red");
  // @ts-expect-error Axis identities remain frozen.
  style.axes.x = style.axes.y;
  // @ts-expect-error Resolved cell paint is readonly.
  style.series.strokeWidth = 3;
  // @ts-expect-error Editor title values cannot be mutated through panel state.
  editor.titles.value.horizontalAxisTitle.text = "Changed";
  // @ts-expect-error Category panel values remain deeply readonly.
  editor.axes.y.fields.value.thickness = 9;
  // @ts-expect-error Theme palette is a readonly input.
  paint.colorRange.push("blue");
  // @ts-expect-error Mapping viewport is readonly.
  mapping.context.viewport.width = 400;
  // @ts-expect-error Appearance inputs cannot replace their baseline.
  appearance.baseline = { ...appearance.baseline };
  // @ts-expect-error Mutation envelope cannot replace its saved-leaf payload.
  mutation.eventOptions = {};
}
