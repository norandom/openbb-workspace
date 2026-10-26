import type {
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import type { DeepReadonly } from "../compatibility/snapshotTypes";
import type { FunnelFamily } from "../compatibility/funnelContracts";
import type { ChartLabelsEdit } from "../editor/labels/ChartLabelsPanel";
import type {
  AvailableChartTitlesProps,
  ChartCaptionEdit,
} from "../editor/titles/ChartTitlesPanel";
import type { SeriesStyleField } from "../editor/series/ChartSeriesStylePanel";
export type FunnelDropOffEdit =
  | { readonly field: "enabled"; readonly value: boolean }
  | { readonly field: SeriesStyleField; readonly value: number };
export type FunnelEditorState = DeepReadonly<
  Pick<
    ApplicationEditorState,
    "padding" | "background" | "tooltips" | "series" | "labels"
  >
> & {
  readonly kind: "funnel";
  readonly family: FunnelFamily;
  readonly direction: "vertical" | "horizontal";
  readonly titles: DeepReadonly<Omit<AvailableChartTitlesProps, "onEdit">>;
  readonly stageLabels: DeepReadonly<ApplicationEditorState["labels"]>;
  readonly shadow?: DeepReadonly<ApplicationEditorState["shadow"]>;
  readonly dropOff?: {
    readonly enabled: boolean;
    readonly controls: DeepReadonly<ApplicationEditorState["series"]["controls"]>;
  };
};
export type FunnelEditIntent =
  | Extract<
      ApplicationEditorIntent,
      { panel: "padding" | "background" | "tooltips" | "series" | "shadow" | "labels" }
    >
  | {
      readonly panel: "titles";
      readonly edit: ChartCaptionEdit & { readonly caption: "title" | "subtitle" };
    }
  | { readonly panel: "stageLabels"; readonly edit: ChartLabelsEdit }
  | { readonly panel: "funnelDirection"; readonly value: "vertical" | "horizontal" }
  | { readonly panel: "funnelDropOff"; readonly edit: FunnelDropOffEdit };
