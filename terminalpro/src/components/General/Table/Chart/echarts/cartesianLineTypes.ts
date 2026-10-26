import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";

export type LineFamily = "line" | "stackedLine" | "normalizedLine";
export type StackedLineFamily = Exclude<LineFamily, "line">;

export function isLineFamily(family: string): family is LineFamily {
  return family === "line" || isStackedLineFamily(family);
}

export function isStackedLineFamily(family: string): family is StackedLineFamily {
  return family === "stackedLine" || family === "normalizedLine";
}

export interface LineStackInput {
  readonly snapshot: ChartSnapshot;
  readonly columns: readonly SnapshotColumn[];
  readonly family: StackedLineFamily;
  readonly categoryAxisType: "category" | "number" | "time";
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}

export interface LineStackProjection {
  readonly drawn: ChartSnapshot;
  readonly extent: {
    readonly min: number;
    readonly max: number;
    readonly interval?: number;
  };
  /** Empty geometry is distinct from a nonempty axis with an explicit tick interval. */
  readonly empty: boolean;
}

/** An unrepresentable cumulative amount must never become a silently clipped chart. */
export class LineStackOverflowError extends RangeError {
  readonly code = "line-stack-overflow";

  constructor() {
    super("The cumulative line amount exceeds the finite numeric range.");
    this.name = "LineStackOverflowError";
  }
}
