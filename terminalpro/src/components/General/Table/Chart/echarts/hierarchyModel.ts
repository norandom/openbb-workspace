import type { ResolvedHierarchyStyle } from "../application/hierarchyAppearanceTypes";
import type { HierarchySetupProjection } from "../application/hierarchySetupTypes";
import type { ChartDisplayPolicy } from "../application/types";
import type { HierarchyChartType } from "../compatibility/hierarchyContracts";
import type { CartesianTranslationResult } from "./cartesianTypes";

export interface HierarchyMappingInput {
  readonly family: HierarchyChartType;
  readonly projection: HierarchySetupProjection;
  readonly style: ResolvedHierarchyStyle;
  readonly context: {
    readonly display: ChartDisplayPolicy;
    readonly viewport: { readonly width: number; readonly height: number };
  };
}
export type TranslateHierarchy = (
  input: HierarchyMappingInput,
) => CartesianTranslationResult;
