import type { SnapshotDiagnostic } from './snapshotTypes';

export type HistogramInterval = readonly [number, number];
export interface HistogramBinInput {
  readonly values: readonly (number | null)[];
  readonly binCount?: number;
  readonly bins?: readonly HistogramInterval[];
}
export interface HistogramGroup {
  readonly intervalIndex: number;
  readonly frequency: number;
  readonly observationIndices: readonly number[];
}
export type HistogramBinResult =
  | {
      readonly status: 'resolved';
      readonly bins: readonly HistogramInterval[];
      readonly groups: readonly HistogramGroup[];
      readonly skippedIndices: readonly number[];
      readonly repair: 'none' | 'equal-integer-count';
    }
  | {
      readonly status: 'invalid';
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
