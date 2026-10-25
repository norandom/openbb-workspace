import type {
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import type {
  RuntimeOptions,
  ValidationResult,
} from "../compatibility/legacyTypes";
import type { DeepReadonly } from "../compatibility/snapshotTypes";
import type { ResolvedHierarchyStyle } from "./hierarchyAppearanceTypes";
import type { HierarchyAssignments } from "./hierarchyTypes";

type CommonTitles = ApplicationEditorState["titles"];
type CommonLegend = ApplicationEditorState["legend"];
export type HierarchyTitleId = "title" | "subtitle";
export type HierarchyTitlesState = DeepReadonly<
  Omit<CommonTitles, "value" | "availableCaptions" | "optionsByCaption"> & {
    value: Pick<CommonTitles["value"], HierarchyTitleId>;
    availableCaptions: readonly HierarchyTitleId[];
    optionsByCaption: Required<
      Pick<NonNullable<CommonTitles["optionsByCaption"]>, HierarchyTitleId>
    >;
  }
>;
export type HierarchySpacingField =
  | "groupPadding"
  | "groupGap"
  | "tilePadding"
  | "tileGap";
export interface HierarchySpacingControl {
  readonly field: HierarchySpacingField;
  readonly label: string;
  readonly value: number;
  readonly bounds: { readonly min: 0; readonly max: number; readonly step: 1 };
}
export type HierarchyGradientLegendValue = DeepReadonly<
  Pick<
    CommonLegend["value"],
    "enabled" | "font" | "weight" | "size" | "color" | "spacing"
  > & {
    position: ResolvedHierarchyStyle["gradientLegend"]["position"];
    reverseOrder: boolean;
    thickness: number;
    preferredLength: number;
  }
>;
export interface HierarchyGradientLegendState {
  readonly applicable: boolean;
  readonly value: HierarchyGradientLegendValue;
  readonly fonts: DeepReadonly<CommonLegend["fonts"]>;
  readonly weights: DeepReadonly<CommonLegend["weights"]>;
  readonly sizes: DeepReadonly<CommonLegend["sizes"]>;
  readonly positions: DeepReadonly<CommonLegend["positions"]>;
  readonly bounds: DeepReadonly<{
    thickness: { min: 0; max: number; step: 1 };
    preferredLength: { min: 0; max: number; step: 1 };
    spacing: { min: 0; max: number; step: 1 };
  }>;
}
type HierarchyEditorCommon = DeepReadonly<
  Pick<ApplicationEditorState, "padding" | "background" | "tooltips">
> & {
  readonly kind: "hierarchy";
  readonly titles: HierarchyTitlesState;
  readonly gradientLegend: HierarchyGradientLegendState;
};
export type HierarchyEditorState = HierarchyEditorCommon &
  (
    | {
        readonly family: "treemap";
        readonly spacing: readonly HierarchySpacingControl[];
      }
    | { readonly family: "sunburst"; readonly spacing?: never }
  );
export type HierarchyCommonEditIntent =
  | Extract<
      ApplicationEditorIntent,
      { readonly panel: "padding" | "background" | "tooltips" }
    >
  | {
      readonly panel: "titles";
      readonly edit: Extract<
        ApplicationEditorIntent,
        { readonly panel: "titles" }
      >["edit"] & { readonly caption: HierarchyTitleId };
    };
export type HierarchySpacingEdit = {
  readonly field: HierarchySpacingField;
  readonly value: number;
};
export type HierarchyGradientLegendEdit = {
  [Field in keyof HierarchyGradientLegendValue]: {
    readonly field: Field;
    readonly value: HierarchyGradientLegendValue[Field];
  };
}[keyof HierarchyGradientLegendValue];
export type HierarchyEditIntent =
  | { readonly panel: "hierarchySpacing"; readonly edit: HierarchySpacingEdit }
  | {
      readonly panel: "hierarchyGradientLegend";
      readonly edit: HierarchyGradientLegendEdit;
    };
export type HierarchyAcceptedEditIntent =
  | HierarchyCommonEditIntent
  | HierarchyEditIntent;
export interface HierarchyEditorContext {
  readonly style: ResolvedHierarchyStyle;
  readonly assignments: HierarchyAssignments;
}
export interface HierarchyEditorMutation {
  readonly kind: "options";
  readonly eventOptions: RuntimeOptions;
}
export type ProjectHierarchyEditorState = (
  style: ResolvedHierarchyStyle,
  assignments: HierarchyAssignments,
) => HierarchyEditorState;
export type MapHierarchyEditorIntent = (
  selected: HierarchyEditorContext,
  intent: HierarchyAcceptedEditIntent,
) => ValidationResult<HierarchyEditorMutation>;
export interface HierarchySpacingControlsProps {
  readonly controls: readonly HierarchySpacingControl[];
  readonly onEdit: (edit: HierarchySpacingEdit) => void;
}
export interface HierarchyGradientLegendPanelProps
  extends HierarchyGradientLegendState {
  readonly onEdit: (edit: HierarchyGradientLegendEdit) => void;
}
