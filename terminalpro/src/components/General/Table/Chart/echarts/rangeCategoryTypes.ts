export type RangeCategoryKind = "category" | "number" | "time";
export type RangeCategoryExtent = readonly [] | readonly [number, number];
export interface RangeCategoryTick {
  readonly coordinate: number;
  readonly label: string;
}
export interface RangeCategoryInput {
  readonly kind: RangeCategoryKind;
  readonly fullExtent: RangeCategoryExtent;
  readonly visibleRange?: readonly [number, number];
  readonly ticks: readonly RangeCategoryTick[];
}
export interface RangeCategoryStyle {
  readonly categoryAxis: { readonly fields: { readonly type: string } };
  readonly band: { readonly paddingInner: number; readonly paddingOuter: number };
  readonly categoryCoordinates?: RangeCategoryInput;
}
export interface RangeCategoryData {
  readonly coordinates: readonly (number | null)[];
  readonly observedExtent: RangeCategoryExtent;
  readonly paddedExtent: RangeCategoryExtent;
  readonly minInterval: number | null;
}
export interface RangeCategoryPlan extends RangeCategoryData {
  readonly kind: RangeCategoryKind;
  readonly fullExtent: RangeCategoryExtent;
  readonly visibleExtent: RangeCategoryExtent;
  readonly visibleFraction: number;
  readonly ticks: readonly RangeCategoryTick[];
}
