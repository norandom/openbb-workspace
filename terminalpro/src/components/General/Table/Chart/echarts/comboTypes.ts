import type {
  ApplicationResolvedStyle,
  ResolvedApplicationAppearance,
  ResolvedApplicationAxis,
  ResolvedApplicationSeries,
} from "../application/appearanceModel";
import type { ComboSeriesAssignment } from "../compatibility/comboAssignments";
import type {
  ChartSnapshot,
  SnapshotColumn,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import type {
  CartesianMappingContext,
  CartesianSeriesStyle,
  CartesianTranslationResult,
  ResolvedCartesianStyle,
} from "./cartesianTypes";
export type ComboGeometry = "area" | "bar" | "line";
export interface ComboGeometryStyle {
  readonly series: ResolvedApplicationSeries;
  readonly overrides: Readonly<Record<string, CartesianSeriesStyle>>;
}
export interface ResolvedComboStyle {
  readonly common: Omit<
    ApplicationResolvedStyle,
    "application" | "series" | "line"
  >;
  readonly application: Omit<ResolvedApplicationAppearance, "series" | "axes">;
  readonly axes: {
    readonly category: ResolvedApplicationAxis;
    readonly primary?: ResolvedApplicationAxis;
    readonly secondary: Readonly<Record<string, ResolvedApplicationAxis>>;
  };
  readonly geometry: Partial<
    Readonly<Record<ComboGeometry, ComboGeometryStyle>>
  >;
}
export interface ComboMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly assignments: readonly Readonly<ComboSeriesAssignment>[];
  readonly style: ResolvedComboStyle;
  readonly context: CartesianMappingContext;
}
export type TranslateCombo = (
  input: ComboMappingInput,
) => CartesianTranslationResult;
export interface ComboSelectedSeries {
  readonly column: SnapshotColumn;
  readonly assignment: Readonly<ComboSeriesAssignment>;
  readonly geometry: ComboGeometry;
  readonly paletteIndex: number;
  readonly yAxisIndex: number;
}
export interface ComboAxisGroup {
  readonly index: number;
  readonly axis: ResolvedApplicationAxis;
  readonly selected: readonly ComboSelectedSeries[];
}
/** Transient drawing plan. Index and palette identity precede legend filtering. */
export interface ComboPlan extends ComboMappingInput {
  readonly selected: readonly ComboSelectedSeries[];
  readonly axisGroups: readonly ComboAxisGroup[];
  readonly views: Partial<
    Readonly<Record<ComboGeometry, ResolvedCartesianStyle>>
  >;
  readonly coordinates: readonly (string | number)[];
}
export type ComboAdmissionResult =
  | { readonly status: "admitted"; readonly plan: ComboPlan }
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
