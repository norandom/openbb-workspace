import type { HistogramMappingInput } from "../echarts/histogramTypes";
export interface HistogramEditorProjection {
  readonly binCount: number;
  readonly revision: number;
  readonly style: HistogramMappingInput["style"];
}
export type HistogramEditIntent = {
  readonly panel: "histogram";
  readonly edit: { readonly kind: "binCount"; readonly value: number };
};

