import type { ResolvedApplicationSeries } from "./appearanceModel";

export type HierarchyFont = Pick<
  ResolvedApplicationSeries["labels"],
  "font" | "weight" | "size" | "color" | "fontWeight" | "fontStyle"
>;
export type HierarchyWrap = "never" | "always" | "hyphenate" | "on-space";
export type HierarchyOverflow = "ellipsis" | "hide";

/** Lossless saved paint data; declaring a fill does not establish native rendering support. */
export type HierarchyFill =
  | string
  | HierarchyGradientFill
  | HierarchyPatternFill
  | HierarchyImageFill;
export interface HierarchyGradientFill {
  readonly type: "gradient";
  readonly colorStops?: readonly {
    readonly color?: string;
    readonly stop?: number;
  }[];
  readonly rotation?: number;
  readonly gradient?: "linear" | "radial" | "conic";
  readonly bounds?: "axis" | "item" | "series";
  readonly reverse?: boolean;
}
export interface HierarchyPatternFill {
  readonly type: "pattern";
  readonly pattern?:
    | "vertical-lines"
    | "horizontal-lines"
    | "forward-slanted-lines"
    | "backward-slanted-lines"
    | "circles"
    | "squares"
    | "triangles"
    | "diamonds"
    | "stars"
    | "hearts"
    | "crosses";
  readonly path?: string;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly scale?: number;
  readonly fillOpacity?: number;
  readonly backgroundFillOpacity?: number;
  readonly strokeOpacity?: number;
  readonly strokeWidth?: number;
  readonly padding?: number;
  readonly fill?: string;
  readonly backgroundFill?: string;
  readonly stroke?: string;
}
export interface HierarchyImageFill {
  readonly type: "image";
  readonly url: string;
  readonly backgroundFill?: string;
  readonly backgroundFillOpacity?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly fit?: "stretch" | "contain" | "cover" | "none";
  readonly repeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat";
}
export interface HierarchyOutline {
  readonly stroke?: string;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
}
export interface HierarchyLabelBox {
  readonly fill?: HierarchyFill;
  readonly fillOpacity?: number;
  readonly border?: Readonly<Partial<HierarchyOutline> & { enabled?: boolean }>;
  readonly cornerRadius?: number;
  readonly padding?:
    | number
    | Readonly<Partial<Record<"top" | "right" | "bottom" | "left", number>>>;
}
export interface HierarchyGroupLabel extends HierarchyFont, HierarchyLabelBox {
  readonly enabled: boolean;
  readonly spacing: number;
}
export interface HierarchyAutoLabel extends HierarchyGroupLabel {
  readonly minimumFontSize: number;
  readonly lineHeight?: number;
  readonly wrapping: HierarchyWrap;
  readonly overflowStrategy: HierarchyOverflow;
}
export interface HierarchyTreemapPaint extends HierarchyOutline {
  readonly fill?: HierarchyFill;
  readonly fillOpacity: number;
  readonly cornerRadius: number;
  readonly textAlign: "left" | "center" | "right";
}
