import type {
  HierarchyAppearanceInput,
  ResolvedHierarchyStyle,
  ResolveHierarchyAppearance,
} from "../../../src/components/General/Table/Chart/application/hierarchyAppearanceTypes";
import type {
  HierarchyAcceptedEditIntent,
  HierarchyEditorContext,
  HierarchyEditorState,
  HierarchyGradientLegendEdit,
  HierarchyGradientLegendPanelProps,
  HierarchySpacingControlsProps,
  HierarchyTitlesState,
  MapHierarchyEditorIntent,
  ProjectHierarchyEditorState,
} from "../../../src/components/General/Table/Chart/application/hierarchyEditorTypes";
import type {
  HierarchyAutoLabel,
  HierarchyFill,
  HierarchyGroupLabel,
  HierarchyWrap,
} from "../../../src/components/General/Table/Chart/application/hierarchyPaintTypes";
import type { HierarchySetupProjection } from "../../../src/components/General/Table/Chart/application/hierarchySetupTypes";
import type { HierarchyAssignments } from "../../../src/components/General/Table/Chart/application/hierarchyTypes";
import type {
  HierarchyHoverBinding,
  HierarchyHoverPlan,
} from "../../../src/components/General/Table/Chart/echarts/hierarchyHoverTypes";
import type {
  HierarchyMappingInput,
  TranslateHierarchy,
} from "../../../src/components/General/Table/Chart/echarts/hierarchyModel";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Absent<T, Key extends PropertyKey> = Key extends keyof T ? false : true;
type Treemap = Extract<ResolvedHierarchyStyle, { family: "treemap" }>;
type Sunburst = Extract<ResolvedHierarchyStyle, { family: "sunburst" }>;
type SunburstEditor = Extract<HierarchyEditorState, { family: "sunburst" }>;
type SizeEdit = Extract<HierarchyGradientLegendEdit, { field: "size" }>;

export type ContractChecks = [
  Assert<Equal<HierarchyWrap, "never" | "always" | "hyphenate" | "on-space">>,
  Assert<Equal<HierarchyMappingInput["projection"], HierarchySetupProjection>>,
  Assert<Equal<HierarchyAppearanceInput["assignments"], HierarchyAssignments>>,
  Assert<Equal<SizeEdit["value"], number>>,
  Assert<Equal<keyof HierarchyTitlesState["value"], "title" | "subtitle">>,
  Assert<
    Equal<keyof HierarchyTitlesState["optionsByCaption"], "title" | "subtitle">
  >,
  Assert<Absent<HierarchyEditorState, "axes">>,
  Assert<Absent<HierarchyEditorState, "legend">>,
  Assert<Absent<HierarchyEditorContext, "family">>,
  Assert<Absent<Sunburst["series"], "fill">>,
  Assert<Absent<Sunburst["series"], "stroke">>,
  Assert<Equal<Treemap["group"]["label"], HierarchyGroupLabel>>,
  Assert<Equal<Treemap["tile"]["label"], HierarchyAutoLabel>>,
  Assert<Equal<Sunburst["series"]["label"], HierarchyAutoLabel>>,
  Assert<Equal<SunburstEditor["spacing"], undefined>>,
];

export const savedFills: readonly HierarchyFill[] = [
  "#123456",
  {
    type: "gradient",
    colorStops: [
      { color: "red", stop: 0 },
      { color: "blue", stop: 1 },
    ],
    gradient: "conic",
    bounds: "item",
    reverse: false,
    rotation: 45,
  },
  { type: "gradient" },
  {
    type: "pattern",
    pattern: "crosses",
    path: "M0 0L1 1",
    fill: "red",
    stroke: "black",
    padding: 0,
    width: 10,
    height: 10,
    scale: 1,
  },
  {
    type: "image",
    url: "https://example.invalid/fill.png",
    fit: "contain",
    repeat: "no-repeat",
  },
];
export const wrapping: readonly HierarchyWrap[] = [
  "never",
  "always",
  "hyphenate",
  "on-space",
];
export const edits: readonly HierarchyAcceptedEditIntent[] = [
  { panel: "titles", edit: { caption: "title", field: "text", value: "USD" } },
  { panel: "tooltips", edit: { field: "enabled", value: false } },
  { panel: "hierarchySpacing", edit: { field: "groupGap", value: 0 } },
  {
    panel: "hierarchyGradientLegend",
    edit: { field: "enabled", value: false },
  },
  {
    panel: "hierarchyGradientLegend",
    edit: { field: "preferredLength", value: 0 },
  },
];
// @ts-expect-error Gradient edits retain field/value correlation.
export const wrongSize: HierarchyGradientLegendEdit = {
  field: "size",
  value: "12",
};
export const markerEdit: HierarchyGradientLegendEdit = {
  // @ts-expect-error The continuous legend does not expose categorical marker controls.
  field: "markerSize",
  value: 10,
};
export const axisEdit: HierarchyAcceptedEditIntent = {
  panel: "titles",
  // @ts-expect-error Hierarchy title edits cannot target axes.
  edit: { caption: "horizontalAxisTitle", field: "text", value: "USD" },
};
// @ts-expect-error Saved image paint requires its source URL.
export const missingImageUrl: HierarchyFill = { type: "image" };
// @ts-expect-error Wrapping preserves the original finite vocabulary.
export const invalidWrapping: HierarchyWrap = "word-break";

export function checkSeams(
  style: ResolvedHierarchyStyle,
  projection: HierarchySetupProjection,
  appearance: HierarchyAppearanceInput,
  mapping: HierarchyMappingInput,
  resolve: ResolveHierarchyAppearance,
  project: ProjectHierarchyEditorState,
  map: MapHierarchyEditorIntent,
  translate: TranslateHierarchy,
  gradientProps: HierarchyGradientLegendPanelProps,
  spacingProps: HierarchySpacingControlsProps,
  hover: HierarchyHoverBinding,
  plan: HierarchyHoverPlan,
) {
  const assignments: HierarchyAssignments = projection.assignments;
  resolve({ ...appearance, assignments });
  const editor: HierarchyEditorState = project(style, assignments);
  map({ style, assignments }, edits[0]);
  translate({ ...mapping, style, projection });
  gradientProps.onEdit({ field: "position", value: "left" });
  spacingProps.onEdit({ field: "tilePadding", value: 0 });
  hover.setPlan(plan);
  hover.setPlan(undefined);
  hover.clear();
  hover.dispose();
  const marker = plan.project(projection.root.id);
  if (marker) {
    const coordinates: readonly number[] = [
      marker.x,
      marker.y,
      marker.rotation,
      marker.size,
    ];
    const color: string = marker.color;
    void [coordinates, color];
  }
  if (style.family === "treemap") {
    const group: HierarchyGroupLabel = style.group.label;
    const tile: HierarchyAutoLabel = style.tile.label;
    void [group, tile];
    // @ts-expect-error Treemap does not expose Sunburst series paint.
    void style.series;
  } else {
    const label: HierarchyAutoLabel = style.series.label;
    void label;
    // @ts-expect-error Sunburst has no direct series fill.
    void style.series.fill;
  }
  // @ts-expect-error Resolved nested palettes are readonly.
  style.palette.fills.push("red");
  // @ts-expect-error Editor state has no categorical legend.
  void editor.legend;
  // @ts-expect-error Hierarchy editor has no axis placeholders.
  void editor.axes;
  return editor;
}
