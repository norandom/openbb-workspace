import type { ChartSnapshot, SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type { CartesianMappingContext } from "../echarts/cartesianTypes";
import type { ChartRenderRequest } from "../echarts/lifecycleTypes";
import type {
  ChartLabelsEdit,
  ChartLabelsPanelProps,
  ChartLabelsState,
} from "../editor/labels/ChartLabelsPanel";
import type { ChartSeriesStylePanelProps } from "../editor/series/ChartSeriesStylePanel";
import type {
  AppearanceInput,
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
  ResolvedFontStyle,
} from "./appearanceModel";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";
import type { RangeResolvedAxis } from "./rangeAxisAppearance";

export type WaterfallSign = "positive" | "negative";
export type WaterfallDirection = "vertical" | "horizontal";
export interface WaterfallThemePaint {
  readonly positive: { readonly fill: string; readonly stroke: string };
  readonly negative: { readonly fill: string; readonly stroke: string };
  readonly total: { readonly fill: string; readonly stroke: string };
  readonly connectorStroke: string;
}
export interface WaterfallLabelStyle
  extends Readonly<ChartLabelsState>,
    ResolvedFontStyle {
  readonly placement: string;
  readonly spacing: number;
}
export interface WaterfallItemStyle {
  readonly name: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly fillOpacity: number;
  readonly lineDash: readonly number[];
  readonly lineDashOffset: number;
  readonly label: WaterfallLabelStyle;
}
export interface WaterfallSeriesStyle {
  readonly direction: WaterfallDirection;
  readonly visible: boolean;
  readonly tooltipEnabled: boolean;
  readonly item: Readonly<Record<WaterfallSign | "total", WaterfallItemStyle>>;
  readonly line: {
    readonly enabled: boolean;
    readonly stroke: string;
    readonly strokeWidth: number;
    readonly strokeOpacity: number;
    readonly lineDash: readonly number[];
    readonly lineDashOffset: number;
  };
}
export interface WaterfallResolvedAppearance {
  readonly application: Omit<ResolvedApplicationAppearance, "axes"> & {
    readonly axes: Readonly<Record<"category" | "number", RangeResolvedAxis>>;
  };
  readonly axisRuntime: ApplicationAxisRuntime;
  readonly series: WaterfallSeriesStyle;
}
export type WaterfallAppearanceInput = Omit<AppearanceInput, "family"> & {
  readonly paint: WaterfallThemePaint;
  readonly legendEnabled?: boolean;
};
export type WaterfallAppearanceResult =
  | { readonly status: "resolved"; readonly value: WaterfallResolvedAppearance }
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };

export type WaterfallEdit =
  | { readonly kind: "direction"; readonly value: WaterfallDirection }
  | { readonly kind: "connector"; readonly field: "stroke"; readonly value: string }
  | {
      readonly kind: "connector";
      readonly field: "strokeWidth" | "strokeOpacity" | "lineDash";
      readonly value: number;
    }
  | {
      readonly kind: "item";
      readonly sign: WaterfallSign;
      readonly field: "strokeWidth" | "strokeOpacity" | "fillOpacity" | "lineDash";
      readonly value: number;
    }
  | {
      readonly kind: "label";
      readonly sign: WaterfallSign;
      readonly edit: ChartLabelsEdit;
    };
export type WaterfallEditIntent = {
  readonly panel: "waterfall";
  readonly edit: WaterfallEdit;
};
export interface WaterfallControlValues {
  readonly direction: WaterfallDirection;
  readonly connector: WaterfallSeriesStyle["line"];
  readonly items: Readonly<
    Record<
      WaterfallSign,
      {
        readonly series: Omit<ChartSeriesStylePanelProps, "onEdit">;
        readonly labels: Omit<ChartLabelsPanelProps, "onEdit">;
      }
    >
  >;
}
export interface WaterfallControlsProps {
  readonly value: WaterfallControlValues;
  readonly onEdit: (edit: WaterfallEdit) => void;
}

/** Transient resolved options; physical zoom axes are mapped before rendering. */
export interface WaterfallNavigationPolicy {
  readonly pagination: boolean;
  readonly showInMiniChart: boolean;
  readonly outsideMinor: boolean;
  readonly hoverRange: "exact" | "nearest" | number;
  readonly clickRange: "exact" | "nearest" | number;
  readonly zoom: {
    readonly enabled: boolean;
    /** Category/data axis, including the physical y axis for horizontal Waterfall. */
    readonly scaleX: boolean;
    /** Numeric axis, including the physical x axis for horizontal Waterfall. */
    readonly scaleY: boolean;
    readonly scrolling: boolean;
    readonly panning: boolean;
  };
  readonly autoScale: {
    readonly enabled: boolean;
    readonly padding: number;
    readonly minVisibleItems: number;
  };
}

export interface WaterfallRenderInput {
  readonly snapshot: ChartSnapshot;
  readonly fieldId: string | undefined;
  readonly appearance: WaterfallResolvedAppearance;
  readonly context: CartesianMappingContext & {
    readonly viewport: { readonly width: number; readonly height: number };
  };
  readonly theme: ApplicationThemeInput;
  readonly navigatorEnabled: boolean;
  readonly miniChartEnabled: boolean;
  readonly navigation: WaterfallNavigationPolicy;
}
export type WaterfallRenderResult =
  | ({ readonly status: "supported" } & Pick<
      ChartRenderRequest,
      "options" | "projectNavigationWindow" | "projectPointer"
    >)
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
