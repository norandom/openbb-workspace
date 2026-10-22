import type { ChartPointerMatch } from "./chartPointerTypes";
export interface RangePickCandidate extends ChartPointerMatch {
  readonly fieldSlot: number;
  readonly groupSlot: number;
  readonly endpoint: "bar" | "high" | "low";
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly majorVisible: boolean;
  readonly minorVisible: boolean;
  readonly rawIdentity?: {
    readonly category: string | number;
    readonly sourceRowIds: readonly string[];
  };
  readonly rect?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
export type RangePickRange = "nearest" | "exact" | number;
