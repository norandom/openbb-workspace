import type { EChartsOption } from "echarts";

/** Fully resolved renderer options; no storage or provider contracts depend on ECharts. */
export interface ChartRenderRequest {
  readonly options: EChartsOption;
  /** Finite revision supplied by the caller. Only strictly newer revisions replace accepted work. */
  readonly revision: number;
}
export type LifecycleResult = "applied" | "deferred" | "stale" | "disposed";
export interface ChartImageOptions {
  readonly pixelRatio?: number;
  readonly backgroundColor?: string;
}
/** Mutations after disposal return disposed. Invalid revisions and library failures throw;
 * failed initialization must release its partial instance. No ECharts instance is exposed. */
export interface ChartLifecycle {
  /** First mount accepts the initial request; repeated mounts follow update ordering.
   * Zero width/height defers initialization until resize. */
  mount(request: ChartRenderRequest): LifecycleResult;
  /** Before mount this throws. Equal/older revisions are stale; deferred work retains
   * only the latest accepted request. A failed update does not advance revision. */
  update(request: ChartRenderRequest): LifecycleResult;
  /** Recheck DOM size, initialize pending work when sized, otherwise defer. */
  resize(): LifecycleResult;
  /** PNG data URL; throws when unsized/unmounted/disposed or public-library export fails. */
  exportImage(options?: ChartImageOptions): string;
  /** Idempotent terminal cleanup; pending work and callbacks cannot revive this owner. */
  dispose(): void;
}
/** One owner per DOM container. A remount after disposal requires a fresh owner. */
export type CreateChartLifecycle = (container: HTMLDivElement) => ChartLifecycle;
