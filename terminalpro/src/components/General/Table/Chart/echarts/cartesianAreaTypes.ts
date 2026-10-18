import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";

export type AreaFamily = "area" | "stackedArea" | "normalizedArea";

export function isAreaFamily(family: string): family is AreaFamily {
  return family === "area" || family === "stackedArea" || family === "normalizedArea";
}

export interface AreaPoint {
  /** Repeated indexes preserve distinct boundaries at the same category. */
  readonly rowIndex: number;
  readonly value: number;
}

export interface AreaFillPoint {
  readonly rowIndex: number;
  readonly lower: number;
  readonly upper: number;
}

export interface AreaSeriesProjection {
  readonly id: string;
  /** One endpoint per raw row, independent of financial tooltip values. */
  readonly markers: readonly (number | null)[];
  /** Original area processing can label missing observations as zero. */
  readonly labelValues: readonly (number | null)[];
  readonly strokes: readonly (readonly AreaPoint[])[];
  readonly fills: readonly (readonly AreaFillPoint[])[];
}

export interface AreaProjection {
  readonly series: readonly AreaSeriesProjection[];
  readonly extent: {
    readonly min: number;
    readonly max: number;
    readonly interval?: number;
  };
}

export interface AreaProjectionInput {
  readonly snapshot: ChartSnapshot;
  readonly columns: readonly SnapshotColumn[];
  readonly family: AreaFamily;
  readonly connectMissingData: boolean;
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
