import type { GridApi } from "ag-grid-community";
import type { ComboSeriesAssignment } from "../compatibility/comboAssignments";
import type {
  ApplicationEditorCommand,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import type {
  ChartModel,
  ChartStorageOutput,
  RuntimeOptions,
} from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type {
  ChartSnapshot,
  SnapshotColumn,
} from "../compatibility/snapshotTypes";
import type { CartesianFamily } from "../echarts/cartesianTypes";
import type { ComboGeometry } from "../echarts/comboTypes";
import type { ChartRenderRequest } from "../echarts/lifecycle";
import type {
  ChartSetupEdit,
  ChartSetupPanelProps,
} from "../editor/setup/ChartSetupPanel";
import type {
  ApplicationAxisId,
  ApplicationResolvedStyle,
  ApplicationThemeInput,
} from "./appearanceModel";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";
import type { ComboConcreteAxis } from "./comboAppearance";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import type { SetupProjection, SetupSelection } from "./setupTypes";
import type {
  ChartDisplayPolicy,
  ResolvedRange,
  SessionAddress,
  SessionStamp,
} from "./types";

export interface ApplicationSessionInputs<
  F extends ApplicationChartFamily = CartesianFamily,
> {
  readonly address: SessionAddress;
  readonly api: GridApi<Record<string, unknown>> | undefined;
  readonly dataRevision: number;
  readonly family: F;
  readonly range: ResolvedRange;
  readonly categoryColumnId: string;
  readonly columns: readonly SnapshotColumn[];
  readonly theme: ApplicationThemeInput;
  readonly generated: RuntimeOptions;
  readonly display: ChartDisplayPolicy;
  readonly precision: number;
  readonly initialAxes: ApplicationAxisRuntime;
  readonly rangePolicy?: {
    readonly generatedColumnIds: readonly string[];
    readonly definitionColumnIds: readonly string[];
    readonly configuredColumnIds?: readonly string[];
  };
}
/** Transient concrete axes and control state stay outside Widget storage. */
export interface ApplicationSessionLocal {
  readonly stamp: SessionStamp;
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly axes: ApplicationAxisRuntime;
  readonly manualRotations: Readonly<
    Record<ApplicationAxisId, number | undefined>
  >;
  readonly legendEnabled?: boolean;
  /** Identifies a live accepted Set Up range, never a serialized preference. */
  readonly rangeFrameKey?: string;
  readonly comboGeometry?: ComboGeometry;
  readonly comboAxes?: readonly ComboConcreteAxis[];
  readonly savedCustomSeriesChartTypes?: readonly ComboSeriesAssignment[];
}
export interface ApplicationSessionContext<
  F extends ApplicationChartFamily = CartesianFamily,
> {
  readonly inputs: ApplicationSessionInputs<F>;
  readonly local: ApplicationSessionLocal;
  readonly capture: ChartSnapshot;
}
export interface ApplicationSessionSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly style: ApplicationResolvedStyle;
  readonly editor: ApplicationEditorState;
}
export interface ApplicationSessionCommit {
  readonly storage: ChartStorageOutput;
  readonly local: ApplicationSessionLocal;
  readonly capture: ChartSnapshot;
  readonly change: "render" | "data";
}
export interface ApplicationSessionState {
  readonly sourceFamily?: ApplicationChartFamily;
  readonly pendingFamily?: ApplicationChartFamily;
  readonly assignmentKey?: string;
  readonly local: ApplicationSessionLocal;
  readonly capture?: ChartSnapshot;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly dataKey: string;
  readonly appearanceKey: string;
  readonly actionKey: string;
  readonly appearance: Pick<
    ApplicationSessionInputs,
    "theme" | "generated" | "precision"
  >;
  readonly error?: string;
}
export type ApplicationSessionCommand =
  | ApplicationEditorCommand
  | {
      readonly stamp: SessionStamp;
      readonly family: CartesianFamily;
      readonly intent: {
        readonly panel: "setup";
        readonly edit: ChartSetupEdit;
      };
    };
export interface ApplicationSessionReady extends ChartRenderRequest {
  readonly stamp: SessionStamp;
  readonly editor: ApplicationEditorState;
  readonly setupProps: Omit<ChartSetupPanelProps, "onEdit">;
  readonly model: ChartModel;
  readonly snapshot: ChartSnapshot;
}
