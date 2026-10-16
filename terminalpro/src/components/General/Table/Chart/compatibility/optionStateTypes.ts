import type { ChartModel, RuntimeOptions, ValidationResult } from "./legacyTypes";

/** Stored baseline only; effective render options require later theme resolution. */
export interface OptionBaseline {
  readonly stateAddress: string;
  readonly model: ChartModel;
  readonly options: RuntimeOptions;
  readonly chartType: string;
}
export interface InitializeOptionBaselineInput {
  readonly kind: "initialize";
  readonly stateAddress: string;
  readonly partitionModel?: ChartModel | null | undefined;
  readonly rootModel?: ChartModel | null | undefined;
  readonly rootOptions?: RuntimeOptions | null | undefined;
  readonly initialChartType: string;
}
export interface SynchronizeOptionBaselineInput {
  readonly kind: "synchronize";
  readonly stateAddress: string;
  readonly partitionModel?: ChartModel | null | undefined;
  readonly previous: OptionBaseline;
}
export type OptionBaselineInput =
  | InitializeOptionBaselineInput
  | SynchronizeOptionBaselineInput;
export type SelectOptionBaseline = (input: unknown) => ValidationResult<OptionBaseline>;
export type ColumnEditorEvent =
  | { readonly kind: "title-text"; readonly value: string }
  | { readonly kind: "title-enabled"; readonly value: boolean }
  | {
      readonly kind: "legend-position";
      readonly value: "top" | "bottom" | "left" | "right";
    }
  | { readonly kind: "stroke-width"; readonly value: number };
export interface ColumnEditorInput {
  readonly chartType: "groupedColumn" | "stackedColumn";
  readonly event: ColumnEditorEvent;
}
export type MapColumnEditorEvent = (input: unknown) => ValidationResult<RuntimeOptions>;
