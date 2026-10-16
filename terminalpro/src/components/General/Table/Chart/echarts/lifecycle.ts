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

import { type ECharts, init } from "echarts";

export const createChartLifecycle: CreateChartLifecycle = (container) => {
  let instance: ECharts | undefined;
  let pending: ChartRenderRequest | undefined;
  let appliedRevision: number | undefined;
  let mounted = false;
  let disposed = false;

  function sized(): boolean {
    return container.clientWidth > 0 && container.clientHeight > 0;
  }

  function release(): void {
    const previous = instance;
    instance = undefined;
    appliedRevision = undefined;
    previous?.dispose();
  }

  function apply(request: ChartRenderRequest, resizing = false): LifecycleResult {
    if (!sized()) return "deferred";
    try {
      instance ??= init(container);
      if (resizing) instance.resize();
      if (appliedRevision !== request.revision) {
        instance.setOption(request.options, { notMerge: true });
        appliedRevision = request.revision;
      }
      return "applied";
    } catch (error) {
      // A partial option/resize failure cannot leave a usable rendering owner.
      // Preserve the original failure even if public cleanup also fails.
      try {
        release();
      } catch {
        // The instance reference has already been detached.
      }
      throw error;
    }
  }

  function accept(request: ChartRenderRequest): LifecycleResult {
    if (!Number.isFinite(request.revision)) throw new Error("Chart revision must be finite");
    if (pending && request.revision <= pending.revision) return "stale";
    const result = apply(request);
    pending = request;
    return result;
  }

  function mount(request: ChartRenderRequest): LifecycleResult {
    if (disposed) return "disposed";
    if (mounted) return accept(request);
    if (!Number.isFinite(request.revision)) throw new Error("Chart revision must be finite");
    mounted = true;
    pending = request;
    return apply(request);
  }

  function update(request: ChartRenderRequest): LifecycleResult {
    if (disposed) return "disposed";
    if (!mounted) throw new Error("Chart is not mounted");
    return accept(request);
  }

  function resize(): LifecycleResult {
    if (disposed) return "disposed";
    if (!pending) throw new Error("Chart is not mounted");
    return apply(pending, true);
  }

  function exportImage(options: ChartImageOptions = {}): string {
    if (disposed || !instance || !sized()) throw new Error("Chart image is unavailable");
    return instance.getDataURL({ ...options, type: "png" });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pending = undefined;
    release();
  }

  return { mount, update, resize, exportImage, dispose };
};
