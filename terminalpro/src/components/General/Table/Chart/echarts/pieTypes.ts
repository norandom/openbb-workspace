import type {
  ResolvedApplicationAppearance,
  ResolvedApplicationSeries,
} from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type {
  PieAssignmentResult,
  PieSeriesAssignment,
} from "../compatibility/pieAssignments";
import type {
  ChartSnapshot,
  SnapshotColumn,
} from "../compatibility/snapshotTypes";
import type {
  CartesianTranslationResult,
  ResolvedCartesianStyle,
  SetupAggregation,
} from "./cartesianTypes";

export type PieAssignments = Extract<
  PieAssignmentResult,
  { status: "resolved" }
>;
export type PieFont = Pick<
  ResolvedApplicationSeries["labels"],
  "enabled" | "font" | "size" | "color" | "weight" | "fontWeight" | "fontStyle"
>;
export interface ResolvedPieSeries {
  readonly paint: Pick<
    ResolvedApplicationSeries,
    "strokeWidth" | "strokeOpacity" | "fillOpacity" | "lineDash" | "shadow"
  > & {
    readonly fill?: string;
    readonly stroke?: string;
  };
  readonly rotation: number;
  readonly outerRadiusRatio: number;
  readonly innerRadiusRatio?: number;
  readonly calloutLabel: PieFont & {
    readonly offset: number;
    readonly minAngle: number;
  };
  readonly calloutLine: {
    readonly length: number;
    readonly strokeWidth: number;
    readonly colors?: readonly string[];
  };
  readonly sectorLabel: PieFont & {
    readonly positionRatio: number;
    readonly positionOffset: number;
  };
}
export interface PieMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly assignment: PieAssignments;
  readonly style: {
    readonly common: Pick<
      ResolvedCartesianStyle,
      "textColor" | "fontFamily" | "fontSize" | "precision"
    >;
    readonly application: Omit<
      ResolvedApplicationAppearance,
      "axes" | "series"
    >;
    readonly series: ResolvedPieSeries;
  };
  readonly context: {
    readonly observations: { readonly kind: "raw-observations" };
    readonly display: ChartDisplayPolicy;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly aggFunc?: SetupAggregation;
    readonly legendSelection?: Readonly<Record<string, boolean>>;
  };
}
export type TranslatePie = (
  input: PieMappingInput,
) => CartesianTranslationResult;
export interface PieDatum {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly enabled: boolean;
  readonly legendText: string;
  readonly calloutText: string;
  readonly sectorText: string;
  readonly tooltipText: string;
  readonly metadata: {
    readonly colId: string;
    readonly rowId: string;
    readonly sourceRowIds: readonly string[];
    readonly category: string | number;
    readonly descriptor: SnapshotColumn;
    readonly rawValue: number;
    readonly paletteIndex: number;
  };
}
export interface PieRing {
  readonly id: string;
  readonly assignment: PieSeriesAssignment;
  readonly data: readonly PieDatum[];
  readonly positive: boolean;
}
export interface PieGeometry {
  readonly center: [number, number];
  readonly radius: number;
  readonly rings: readonly {
    readonly inner: number;
    readonly outer: number;
    readonly drawable: boolean;
  }[];
}
