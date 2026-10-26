import type { FunnelDataResult, FunnelFamily } from "../compatibility/funnelContracts";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type { ApplicationSessionReady } from "./applicationSessionTypes";
import type { FunnelEditorState } from "./funnelEditorTypes";
import type { ResolvedFunnelStyle } from "./funnelRenderTypes";
import type { SetupProjection, SetupSelection } from "./setupTypes";
import type { ResolvedRange } from "./types";
export interface FunnelSessionSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly data: FunnelDataResult;
  readonly style: ResolvedFunnelStyle;
  readonly editor: FunnelEditorState;
}
export type FunnelNotice = Readonly<{
  kind: "empty" | "invalid-data" | "missing-stages";
  message: string;
  diagnostics?: readonly SnapshotDiagnostic[];
}>;
export type FunnelSessionReady = Omit<ApplicationSessionReady, "editor"> & {
  readonly kind: "funnel";
  readonly family: FunnelFamily;
  readonly editor: FunnelEditorState;
  readonly notice?: FunnelNotice;
};
