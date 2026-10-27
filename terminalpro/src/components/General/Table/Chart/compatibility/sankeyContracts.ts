import type { ChartSnapshot, SnapshotDiagnostic, SnapshotJson } from "./snapshotTypes";

export type SankeyRawId = string | number | boolean;
export type SankeyMetadataKey = "unit" | "currency" | "scale" | "period" | "measure";
export interface SankeyMetadata {
  readonly unit: string | null;
  readonly currency: string | null;
  readonly scale: number | null;
  readonly period: string | null;
  readonly measure: string | null;
}
export interface SankeySelection {
  readonly sourceColumnId: string | null;
  readonly targetColumnId: string | null;
  readonly valueColumnId: string | null;
  readonly metadata: SankeyMetadata;
  readonly metadataColumnIds: Readonly<Partial<Record<SankeyMetadataKey, string>>>;
}
export interface SankeyRow {
  readonly id: string;
  readonly source: SankeyRawId | null;
  readonly target: SankeyRawId | null;
  readonly value: number | null;
  readonly metadata: SankeyMetadata;
  readonly provenance: SnapshotJson;
}
export interface SankeySnapshot
  extends Omit<
    ChartSnapshot,
    "categoryColumnId" | "rows" | "rangeCategory" | "sourceMode"
  > {
  readonly kind: "sankey";
  readonly sourceMode: "flat";
  readonly selection: SankeySelection;
  readonly rows: readonly SankeyRow[];
}
export interface SankeyDiagnostic extends SnapshotDiagnostic {
  readonly severity: "error" | "warning";
  readonly rowIds: readonly string[];
  readonly nodeId?: string;
}
export interface SankeyNode {
  readonly id: string;
  readonly raw: SankeyRawId;
  readonly label: string;
  readonly role: "source" | "internal" | "sink";
  readonly incoming: number;
  readonly outgoing: number;
  readonly residual: number | null;
  readonly tolerance: number | null;
  readonly balanced: boolean | null;
}
export interface SankeyLink {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly value: number;
  readonly rowIds: readonly string[];
}
export interface SankeyGraph {
  readonly snapshot: SankeySnapshot;
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
  readonly metadata: SankeyMetadata;
  readonly reconciliation: "declared-units" | "unspecified-units";
}
export type SankeyGraphResult =
  | {
      readonly status: "ready";
      readonly graph: SankeyGraph;
      readonly diagnostics: readonly SankeyDiagnostic[];
    }
  | {
      readonly status: "empty";
      readonly reason: "no-rows" | "zero-only";
      readonly diagnostics: readonly SankeyDiagnostic[];
    }
  | { readonly status: "invalid"; readonly diagnostics: readonly SankeyDiagnostic[] };
export type ValidateSankeySnapshot = (
  input: unknown,
) =>
  | { readonly valid: true; readonly snapshot: SankeySnapshot }
  | { readonly valid: false; readonly diagnostics: readonly SankeyDiagnostic[] };
export type BuildSankeyGraph = (snapshot: SankeySnapshot) => SankeyGraphResult;
