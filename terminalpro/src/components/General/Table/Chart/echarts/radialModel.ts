/** Draft destination echarts/radialModel.ts; controller owns this shared boundary. */
import type { RadialMappingInput } from "../compatibility/radialContracts";

export interface RadialDatumIdentity {
  readonly rowId: string;
  readonly rowIndex: number;
  readonly category: string | number;
  readonly rawValue: number;
  readonly startValue: number;
  readonly endValue: number;
  /** Center-relative pixel anchors computed from the original series label midpoint. */
  readonly labelX: number;
  readonly labelY: number;
}
export interface RadialColumnMark extends RadialDatumIdentity {
  readonly kind: "column";
  readonly startRadius: number;
  readonly endRadius: number;
  readonly width: number;
  readonly connectBaseline: boolean;
  /** Clockwise radians from top; ECharts local-path rotation is its negative. */
  readonly rotation: number;
}
export interface RadialBarMark extends RadialDatumIdentity {
  readonly kind: "bar";
  readonly innerRadius: number;
  readonly outerRadius: number;
  /** Unwrapped canvas radians from right, increasing clockwise; ordered endpoints. */
  readonly startAngle: number;
  readonly endAngle: number;
}
export interface RadialPreparedSeries {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  readonly paletteIndex: number;
  readonly marks: readonly (RadialColumnMark | RadialBarMark)[];
}
export interface RadialAxisAnchor {
  readonly align?: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "middle" | "bottom";
  readonly value: string | number;
  readonly x: number;
  readonly y: number;
  /** For angular orientation; undefined on radial labels. */
  readonly angle?: number;
}
/** Center-relative geometry; axis selects the independently resolved paint. */
export type RadialAxisStroke =
  | {
      readonly axis: "category" | "numerical";
      readonly kind: "circle";
      readonly radius: number;
    }
  | {
      readonly axis: "category" | "numerical";
      readonly kind: "line";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    };
export interface RadialPreparedModel {
  readonly center: readonly [number, number];
  readonly outerRadius: number;
  readonly holeRadius: number;
  readonly domain: readonly [number, number];
  readonly ticks: readonly number[];
  readonly numericalGridRadii: readonly number[];
  readonly categoryGridRadii: readonly number[];
  readonly axisStrokes: readonly RadialAxisStroke[];
  readonly categoryLabels: readonly RadialAxisAnchor[];
  readonly numericalLabels: readonly RadialAxisAnchor[];
  readonly series: readonly RadialPreparedSeries[];
}
/** Throws on malformed/nonfinite geometry; translation owns the invalid envelope. */
export type PrepareRadialModel = (
  input: RadialMappingInput,
) => RadialPreparedModel;
