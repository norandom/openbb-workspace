import type { ApplicationEditorState } from "../compatibility/editorBindings/types";
import type { ChartModel } from "../compatibility/legacyTypes";
import type {
  SankeyDiagnostic,
  SankeySnapshot,
} from "../compatibility/sankeyContracts";
import type { ChartRenderRequest } from "../echarts/lifecycle";
import type {
  HierarchyCommonEditIntent,
  HierarchyTitlesState,
} from "./hierarchyEditorTypes";
import type { SankeySetupPanelProps } from "./sankeyTypes";
import type { SessionStamp } from "./types";

export type SankeyAppearanceIntent = HierarchyCommonEditIntent;
export type SankeyEditorState = Pick<
  ApplicationEditorState,
  "padding" | "background" | "tooltips"
> & {
  readonly titles: HierarchyTitlesState;
};
export interface SankeyEditorProjection {
  readonly setupProps: Omit<SankeySetupPanelProps, "onEdit">;
  readonly editor?: SankeyEditorState;
  readonly diagnostics: readonly SankeyDiagnostic[];
  readonly notice?: string;
}
export interface SankeySessionReady extends ChartRenderRequest {
  readonly kind: "sankey";
  readonly stamp: SessionStamp;
  readonly snapshot: SankeySnapshot;
  readonly model: ChartModel;
  readonly diagnostics: readonly SankeyDiagnostic[];
}
