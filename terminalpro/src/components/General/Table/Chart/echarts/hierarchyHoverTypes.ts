export interface HierarchyHoverMarker {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly size: number;
  readonly color: string;
}
/** Viewport-derived pixel positions; resize drops the plan until a fresh selection replaces it. */
export interface HierarchyHoverPlan {
  readonly seriesId: string;
  readonly graphicId: string;
  readonly project: (nodeId: string) => HierarchyHoverMarker | undefined;
}
export interface HierarchyHoverBinding {
  setPlan(plan: HierarchyHoverPlan | undefined): void;
  clear(): void;
  dispose(): void;
}
