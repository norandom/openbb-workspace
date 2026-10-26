import type { SetupValueOrigin } from "../application/setupTypes";
import type { SnapshotColumn, SnapshotDiagnostic } from "./snapshotTypes";

export type FunnelFamily = "funnel" | "coneFunnel" | "pyramid";
export type NativeFunnelType = "funnel" | "cone-funnel" | "pyramid";
export function isFunnelFamily(value: unknown): value is FunnelFamily {
  return value === "funnel" || value === "coneFunnel" || value === "pyramid";
}
export function nativeFunnelType(family: FunnelFamily): NativeFunnelType {
  return { funnel: "funnel", coneFunnel: "cone-funnel", pyramid: "pyramid" }[
    family
  ] as NativeFunnelType;
}
export interface FunnelStageIdentity {
  readonly index: number;
  readonly rowId: string;
  readonly category: string | number;
  readonly label: string;
}
export type FunnelStage = FunnelStageIdentity &
  (
    | {
        readonly kind: "missing";
        readonly reason: "absent" | "null";
        readonly origin?: SetupValueOrigin;
      }
    | {
        readonly kind: "value";
        readonly value: number;
        readonly magnitude: number;
        readonly origin: SetupValueOrigin;
      }
  );
export interface FunnelData {
  readonly family: FunnelFamily;
  readonly field: SnapshotColumn;
  readonly observationKind: "raw-observations" | "count";
  readonly stages: readonly FunnelStage[];
}
export interface FunnelMagnitudeData extends FunnelData {
  readonly family: "funnel" | "coneFunnel";
  readonly maxAbs: number;
  readonly magnitudeRatios: readonly (number | null)[];
}
export interface PyramidData extends FunnelData {
  readonly family: "pyramid";
  readonly maxValue: number;
  readonly scaledTotal: number;
  readonly axialRanges: readonly ({
    readonly start: number;
    readonly end: number;
  } | null)[];
}
export type FunnelDataResult =
  | { readonly status: "ready"; readonly value: FunnelMagnitudeData | PyramidData }
  | {
      readonly status: "empty";
      readonly reason: "no-series" | "no-rows" | "no-values";
      readonly stages: readonly FunnelStageIdentity[];
      readonly field?: SnapshotColumn;
    }
  | { readonly status: "invalid"; readonly diagnostics: readonly SnapshotDiagnostic[] };
