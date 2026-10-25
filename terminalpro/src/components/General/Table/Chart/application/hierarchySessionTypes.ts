import type {
  HierarchyChartType,
  HierarchySnapshot,
} from "../compatibility/hierarchyContracts";
import type { ChartModel, ChartStorageOutput } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { HierarchyMappingInput } from "../echarts/hierarchyModel";
import type { HierarchyHoverPlan } from "../echarts/hierarchyHoverTypes";
import type { ChartRenderRequest } from "../echarts/lifecycleTypes";
import type { HierarchySetupPanelProps } from "../editor/hierarchy/HierarchySetupPanel";
import type {
  ApplicationSessionInputs,
  ApplicationSessionLocal,
} from "./applicationSessionTypes";
import type { HierarchyPalette } from "./hierarchyAppearanceTypes";
import type {
  HierarchyAcceptedEditIntent,
  HierarchyEditorState,
} from "./hierarchyEditorTypes";
import type { HierarchySetupProjection } from "./hierarchySetupTypes";
import type { HierarchySetupSelection } from "./hierarchyTypes";
import type { ResolvedRange, SessionStamp } from "./types";

export interface HierarchySessionInputs
  extends Omit<
    ApplicationSessionInputs,
    "family" | "categoryColumnId" | "rangePolicy"
  > {
  readonly family: HierarchyChartType;
  readonly hierarchyThemePalette: HierarchyPalette;
  readonly rangePolicy?: {
    readonly generatedColumnIds: readonly string[];
    readonly definitionColumnIds: readonly string[];
    readonly configuredColumnIds?: readonly string[];
    readonly numericCollectionIds: readonly string[];
  };
}
export interface HierarchySessionContext {
  readonly inputs: HierarchySessionInputs;
  readonly local: ApplicationSessionLocal;
  readonly capture: HierarchySnapshot;
}
export interface HierarchySessionState {
  readonly local: ApplicationSessionLocal;
  readonly capture?: HierarchySnapshot;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly error?: string;
}
export interface HierarchyPreparedSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: HierarchySetupSelection;
  readonly projection: HierarchySetupProjection;
  readonly mapping: HierarchyMappingInput;
  readonly editor: HierarchyEditorState;
}
export interface HierarchySessionReady extends ChartRenderRequest {
  readonly kind: "hierarchy";
  readonly family: HierarchyChartType;
  readonly stamp: SessionStamp;
  readonly editor: HierarchyEditorState;
  readonly setupProps: Omit<HierarchySetupPanelProps, "onEdit">;
  readonly model: ChartModel;
  readonly snapshot: HierarchySnapshot;
  readonly hierarchyHover?: HierarchyHoverPlan;
}
export interface HierarchySessionCommit {
  readonly storage: ChartStorageOutput;
  readonly local: ApplicationSessionLocal;
  readonly capture: HierarchySnapshot;
  readonly change: "render" | "data";
}
export interface HierarchyAppearanceCommand {
  readonly family: HierarchyChartType;
  readonly stamp: SessionStamp;
  readonly intent: HierarchyAcceptedEditIntent;
}
