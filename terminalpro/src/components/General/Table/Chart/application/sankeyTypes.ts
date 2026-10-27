import type {
  SankeyDiagnostic,
  SankeyGraph,
  SankeyMetadataKey,
  SankeySelection,
  SankeySnapshot,
} from "../compatibility/sankeyContracts";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import type { CartesianTranslationResult } from "../echarts/cartesianTypes";
import type { ResolvedApplicationAppearance } from "./appearanceModel";
import type { ChartDisplayPolicy, GridCaptureInput, SessionResult } from "./types";

export interface SankeyGridCaptureInput
  extends Omit<GridCaptureInput, "categoryColumnId" | "snapshotPolicy"> {
  readonly selection: SankeySelection;
}
export type CaptureDisplayedSankey = (
  input: SankeyGridCaptureInput,
) => SessionResult<SankeySnapshot>;
export type SankeySetupEdit =
  | {
      readonly kind: "mapping";
      readonly field: "sourceColumnId" | "targetColumnId" | "valueColumnId";
      readonly value: string | null;
    }
  | {
      readonly kind: "metadata";
      readonly field: SankeyMetadataKey;
      readonly value: string | number | null;
    }
  | {
      readonly kind: "metadata-column";
      readonly field: SankeyMetadataKey;
      readonly value: string | null;
    };
export interface SankeySetupPanelProps {
  readonly columns: readonly SnapshotColumn[];
  readonly selection: SankeySelection;
  readonly diagnostics: readonly SankeyDiagnostic[];
  readonly onEdit: (edit: SankeySetupEdit) => void;
}
export interface SankeyRenderInput {
  readonly graph: SankeyGraph;
  readonly style: Readonly<{
    application: Pick<
      ResolvedApplicationAppearance,
      "title" | "subtitle" | "padding" | "background" | "tooltip"
    >;
    palette: readonly string[];
    textColor: string;
    fontFamily: string;
    fontSize: number;
    linkOpacity: number;
    nodeWidth: number;
    nodeGap: number;
    labels: boolean;
  }>;
  readonly context: Readonly<{
    display: ChartDisplayPolicy;
    viewport: Readonly<{ width: number; height: number }>;
  }>;
}
export type TranslateSankey = (input: SankeyRenderInput) => CartesianTranslationResult;
