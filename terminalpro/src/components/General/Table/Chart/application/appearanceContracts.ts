import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";

/** Rendering uses selected baseline.options; model.chartOptions remains stored state. */
export interface AppearanceCompositionInput {
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
}
export type ComposeAppearanceOptions = (
  input: AppearanceCompositionInput,
) => ValidationResult<RuntimeOptions>;

/** Callers resolve aliases; foreground and text need not identify the same color. */
export interface AppearanceColorTokens {
  readonly base: "ag-default" | "ag-default-dark";
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly chartBackgroundColor: string;
}
export type DerivedAppearanceColors =
  | {
      readonly status: "resolved";
      readonly gridLineColor: string;
      readonly subtleTextColor: string;
    }
  | {
      readonly status: "invalid" | "unresolved";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
export type DeriveAppearanceColors = (
  tokens: AppearanceColorTokens,
) => DerivedAppearanceColors;
