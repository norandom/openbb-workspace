import type { EChartsOption } from "echarts";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { histogramNavigationWindow } from "./histogramNavigationWindow";
import { isHistogramOptions } from "./histogramNavigator";
import { createPieLegendBinding, type PieLegendBinding } from "./pieLegendBinding";
import type { PieLegendPagination } from "./pieLegendTypes";
import { xyNavigationWindow } from "./xyNavigationWindow";
import { isXyNavigator } from "./xyNavigator";

/** Fully resolved renderer options; no storage or provider contracts depend on ECharts. */
export interface ChartRenderRequest {
  readonly options: EChartsOption;
  /** Finite revision supplied by the caller. Only strictly newer revisions replace accepted work. */
  readonly revision: number;
  /** Paired with projectLegendSelection; stable across render revisions, reset per session/family. */
  readonly legendScope?: string;
  readonly legendPagination?: PieLegendPagination;
  /** Keys equal main-series names/IDs. The callback closes over immutable current inputs. */
  readonly projectLegendSelection?: (
    selected: Readonly<Record<string, boolean>>,
  ) => EChartsOption;
  /** Interaction failures invalidate export before reaching the existing host error channel. */
  readonly projectNavigationWindow?: (
    projected: EChartsOption,
    current: EChartsOption,
  ) => EChartsOption;
  readonly onError?: (error: unknown) => void;
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
  exportImage(options?: ChartImageOptions, expectedRevision?: number): string;
  /** Idempotent terminal cleanup; pending work and callbacks cannot revive this owner. */
  dispose(): void;
}
/** One owner per DOM container. A remount after disposal requires a fresh owner. */
export type CreateChartLifecycle = (container: HTMLDivElement) => ChartLifecycle;

import { type ECharts, init } from "echarts";
import { hasNavigator, retainNavigatorExtent } from "./cartesianNavigator";

export const createChartLifecycle: CreateChartLifecycle = (container) => {
  let instance: ECharts | undefined;
  let pending: ChartRenderRequest | undefined;
  let appliedRevision: number | undefined;
  let appliedScope: string | undefined;
  let mounted = false;
  let disposed = false;
  let navigatorListening = false;
  let legendListening = false;
  let legendListener: (() => void) | undefined;
  let navigatorListener: (() => void) | undefined;
  let pieLegend: PieLegendBinding | undefined;
  let clickListener: ((event: unknown) => void) | undefined;
  let applying = false;
  let generation = 0;
  const resetXy = () => {
    if (
      disposed ||
      applying ||
      !instance ||
      !pending ||
      !(
        pending.projectNavigationWindow ||
        isXyNavigator(pending.options) ||
        isHistogramOptions(pending.options)
      )
    )
      return;
    try {
      instance.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
    } catch (error) {
      interactionFailure(error);
    }
  };
  container.addEventListener("dblclick", resetXy);

  function sized(): boolean {
    return container.clientWidth > 0 && container.clientHeight > 0;
  }

  function release(): void {
    const previous = instance;
    generation += 1;
    instance = undefined;
    appliedRevision = undefined;
    appliedScope = undefined;
    navigatorListening = false;
    legendListening = false;
    try {
      pieLegend?.dispose();
      pieLegend = undefined;
      previous?.off?.("datazoom", navigatorListener);
      previous?.off?.("legendselectchanged", legendListener);
      previous?.off?.("click", clickListener);
    } finally {
      legendListener = undefined;
      navigatorListener = undefined;
      clickListener = undefined;
      previous?.dispose();
    }
  }

  function interactionFailure(error: unknown): void {
    const request = pending;
    try {
      release();
    } catch {
      /* Preserve the interaction failure. */
    }
    if (request?.onError) request.onError(error);
    else throw error;
  }

  function bindPieLegend(): void {
    if (!instance || pieLegend) return;
    const current = generation;
    pieLegend = createPieLegendBinding({
      container,
      isActive: () =>
        !disposed &&
        !applying &&
        sized() &&
        !!instance &&
        generation === current &&
        appliedRevision === pending?.revision,
      readSelected: () => {
        const legends = (instance?.getOption() as EChartsOption | undefined)?.legend;
        return (Array.isArray(legends) ? legends[0] : legends)?.selected ?? {};
      },
      toggle: (key) => {
        instance?.dispatchAction({ type: "legendToggleSelect", name: key });
      },
      repaint: () => {
        if (pending) render(pending, true);
      },
      fail: interactionFailure,
    });
    clickListener = (event) => {
      if (generation === current) pieLegend?.handleClick(event);
    };
    instance.on?.("click", clickListener);
  }

  function refreshNavigatorMask(): void {
    if (disposed || applying || !instance || !pending || !hasNavigator(pending.options))
      return;
    try {
      if (pending.projectNavigationWindow) {
        render(pending, true);
        return;
      }
      const window = isHistogramOptions(pending.options)
        ? histogramNavigationWindow(
            pending.options,
            instance.getOption() as EChartsOption,
          )
        : xyNavigationWindow(
            legendOptions(pending),
            instance.getOption() as EChartsOption,
          );
      if (window) {
        applying = true;
        try {
          if (window.changed)
            instance.dispatchAction({
              type: "dataZoom",
              start: window.start,
              end: window.end,
            });
          instance.setOption({
            yAxis: [window.yAxis, ...navigatorAxes(pending.options.yAxis).slice(1)],
          });
        } finally {
          applying = false;
        }
      }
      const options = retainNavigatorExtent(pending.options, instance.getOption());
      if (options.graphic) instance.setOption({ graphic: options.graphic });
    } catch (error) {
      interactionFailure(error);
    }
  }

  function legendOptions(request: ChartRenderRequest): EChartsOption {
    if (!request.projectLegendSelection || request.legendScope === undefined)
      return request.options;
    const legend = Array.isArray(request.options.legend)
      ? request.options.legend[0]
      : request.options.legend;
    const native = instance?.getOption();
    const nativeLegend = Array.isArray(native?.legend)
      ? native.legend[0]
      : native?.legend;
    const retained =
      appliedScope === request.legendScope && appliedRevision !== undefined;
    const selected: Record<string, boolean> = {};
    for (const entry of legend?.data ?? []) {
      const id = typeof entry === "string" ? entry : entry.name;
      if (id && !id.startsWith("openbb-mini-"))
        selected[id] =
          (retained ? nativeLegend?.selected?.[id] : undefined) ??
          legend?.selected?.[id] ??
          true;
    }
    const projected = request.projectLegendSelection(Object.freeze(selected));
    const legends = Array.isArray(projected.legend)
      ? projected.legend
      : [projected.legend ?? {}];
    return { ...projected, legend: legends.map((item) => ({ ...item, selected })) };
  }

  function render(request: ChartRenderRequest, force = false): void {
    if (!instance || (!force && appliedRevision === request.revision)) return;
    applying = true;
    try {
      let options = legendOptions(request);
      const sameScope = appliedScope === request.legendScope;
      if (
        appliedRevision !== undefined &&
        pending &&
        sameScope &&
        hasNavigator(pending.options) &&
        hasNavigator(options)
      )
        options = retainNavigatorExtent(options, instance.getOption());
      if (request.projectNavigationWindow)
        options = request.projectNavigationWindow(options, options);
      const histogramWindow = request.projectNavigationWindow
        ? undefined
        : histogramNavigationWindow(options, options);
      if (histogramWindow)
        options = {
          ...options,
          yAxis: [histogramWindow.yAxis, ...navigatorAxes(options.yAxis).slice(1)],
        };
      options =
        pieLegend?.project(options, request.legendPagination, request.legendScope) ??
        options;
      // ECharts 6 retains a resize hover timer after notMerge disposes its tooltip view.
      instance.dispatchAction({ type: "hideTip" });
      instance.setOption(options, { notMerge: true });
      pieLegend?.sync();
      appliedRevision = request.revision;
      appliedScope = request.legendScope;
    } finally {
      applying = false;
    }
  }

  function refreshLegend(): void {
    if (
      disposed ||
      applying ||
      !sized() ||
      !instance ||
      !pending?.projectLegendSelection
    )
      return;
    const request = pending;
    try {
      render(request, true);
    } catch (error) {
      interactionFailure(error);
    }
  }

  function apply(request: ChartRenderRequest, resizing = false): LifecycleResult {
    if (!sized()) return "deferred";
    try {
      instance ??= init(container);
      bindPieLegend();
      if (hasNavigator(request.options) && !navigatorListening) {
        const current = generation;
        navigatorListener = () => {
          if (generation === current) refreshNavigatorMask();
        };
        instance.on("datazoom", navigatorListener);
        navigatorListening = true;
      }
      if (
        request.projectLegendSelection &&
        request.legendScope !== undefined &&
        !legendListening
      ) {
        const current = generation;
        legendListener = () => {
          if (generation === current) refreshLegend();
        };
        instance.on("legendselectchanged", legendListener);
        legendListening = true;
      }
      if (resizing) instance.resize();
      render(
        request,
        resizing &&
          (!!request.projectLegendSelection ||
            !!request.legendPagination ||
            !!request.projectNavigationWindow),
      );
      return "applied";
    } catch (error) {
      try {
        release();
      } catch {
        // Preserve the original failure after detaching the instance.
      }
      throw error;
    }
  }

  function accept(request: ChartRenderRequest): LifecycleResult {
    if (!Number.isFinite(request.revision))
      throw new Error("Chart revision must be finite");
    if (pending && request.revision <= pending.revision) return "stale";
    const result = apply(request);
    if (result === "deferred" && pending?.legendScope !== request.legendScope) {
      // An accepted session boundary expires native state even before the next draw.
      appliedRevision = undefined;
      appliedScope = undefined;
      pieLegend?.project({}, undefined, request.legendScope);
      pieLegend?.sync();
    }
    pending = request;
    return result;
  }

  function mount(request: ChartRenderRequest): LifecycleResult {
    if (disposed) return "disposed";
    if (mounted) return accept(request);
    if (!Number.isFinite(request.revision))
      throw new Error("Chart revision must be finite");
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

  function exportImage(
    options: ChartImageOptions = {},
    expectedRevision?: number,
  ): string {
    if (
      disposed ||
      !instance ||
      !sized() ||
      !pending ||
      appliedRevision !== pending.revision ||
      (expectedRevision !== undefined && expectedRevision !== appliedRevision)
    )
      throw new Error("Chart image is unavailable");
    return instance.getDataURL({ ...options, type: "png" });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    container.removeEventListener("dblclick", resetXy);
    pending = undefined;
    release();
  }

  return { mount, update, resize, exportImage, dispose };
};
