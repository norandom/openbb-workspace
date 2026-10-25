import type { HierarchyChartType } from "../compatibility/hierarchyContracts";
import type {
  RuntimeOptions,
  ValidationResult,
} from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { ResolvedCartesianStyle } from "../echarts/cartesianTypes";
import type {
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
} from "./appearanceModel";
import type {
  HierarchyAutoLabel,
  HierarchyFill,
  HierarchyFont,
  HierarchyGroupLabel,
  HierarchyTreemapPaint,
} from "./hierarchyPaintTypes";
import type { HierarchyAssignments } from "./hierarchyTypes";

export interface HierarchyPalette {
  readonly fills: readonly HierarchyFill[];
  readonly strokes: readonly string[];
  readonly hierarchyColors: readonly string[];
  readonly secondHierarchyColors: readonly string[];
  readonly colorRange: readonly string[];
}
export interface HierarchyGradientLegend {
  readonly enabled: boolean;
  readonly position: "top" | "right" | "bottom" | "left";
  readonly reverseOrder: boolean;
  readonly spacing: number;
  readonly gradient: {
    readonly thickness: number;
    readonly preferredLength: number;
  };
  readonly label: HierarchyFont;
}
export interface HierarchyStyleBase {
  readonly common: Pick<
    ResolvedCartesianStyle,
    "textColor" | "fontFamily" | "fontSize" | "precision"
  >;
  readonly application: Readonly<
    Pick<
      ResolvedApplicationAppearance,
      "title" | "subtitle" | "padding" | "background"
    >
  >;
  readonly tooltip: {
    readonly enabled: boolean;
    readonly mode: "single" | "shared" | "compact";
  };
  readonly palette: HierarchyPalette;
  readonly gradientLegend: HierarchyGradientLegend;
}
export type ResolvedHierarchyStyle = HierarchyStyleBase &
  (
    | {
        readonly family: "treemap";
        readonly group: HierarchyTreemapPaint & {
          readonly padding: number;
          readonly gap: number;
          readonly interactive: boolean;
          readonly label: HierarchyGroupLabel;
        };
        readonly tile: HierarchyTreemapPaint & {
          readonly padding: number;
          readonly gap: number;
          readonly verticalAlign: "top" | "middle" | "bottom";
          readonly label: HierarchyAutoLabel;
        };
      }
    | {
        readonly family: "sunburst";
        readonly series: {
          readonly label: HierarchyAutoLabel;
          readonly fillOpacity: number;
          readonly strokeWidth: number;
          readonly strokeOpacity: number;
          readonly cornerRadius: number;
          readonly sectorSpacing: number;
          readonly padding: number;
        };
      }
  );
export interface HierarchyAppearanceInput {
  readonly family: HierarchyChartType;
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
  readonly theme: ApplicationThemeInput;
  /** Effective stock/custom hierarchy tokens; no competing theme state owner. */
  readonly themePalette: HierarchyPalette;
  readonly precision: number;
  readonly assignments: HierarchyAssignments;
}
export type ResolveHierarchyAppearance = (
  input: HierarchyAppearanceInput,
) => ValidationResult<ResolvedHierarchyStyle>;
