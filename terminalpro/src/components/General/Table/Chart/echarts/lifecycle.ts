import type { EChartsOption } from "echarts";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import type { ChartPointerBinding } from "./chartPointerTypes";
import { histogramNavigationWindow } from "./histogramNavigationWindow";
import { isHistogramOptions } from "./histogramNavigator";
import { createLifecycleHierarchyHover } from "./lifecycleHierarchyHover";
import { createLifecycleKeyboard } from "./lifecycleKeyboard";
import { bindLifecycleLegend } from "./lifecycleLegendBinding";
import {
  projectLifecycleLegend,
  projectLifecycleOptions,
} from "./lifecycleLegendProjection";
import type {
  ChartImageOptions,
  ChartRenderRequest,
  CreateChartLifecycle,
  LifecycleResult,
} from "./lifecycleTypes";
import { createRangePointerBinding } from "./rangePointerBinding";
import { xyNavigationWindow } from "./xyNavigationWindow";
import { isXyNavigator } from "./xyNavigator";

export type {
  ChartImageOptions,
  ChartLifecycle,
  ChartRenderRequest,
  CreateChartLifecycle,
  LifecycleResult,
} from "./lifecycleTypes";

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
  let navigatorListener: (() => void) | undefined;
  let pieLegend: ReturnType<typeof bindLifecycleLegend> | undefined;
  let pointer: ChartPointerBinding | undefined;
  const hierarchyHover = createLifecycleHierarchyHover();
  let applying = false;
  let generation = 0;
  const keyboard = createLifecycleKeyboard({
    container,
    isActive: active,
    fail: interactionFailure,
  });

  function active(): boolean {
    return (
      !disposed &&
      !applying &&
      sized() &&
      !!instance &&
      appliedRevision === pending?.revision
    );
  }
  const resetXy = (event: MouseEvent) => {
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
      const activeInstance = instance;
      const activeGeneration = generation;
      const rect = container.getBoundingClientRect();
      if (
        pointer?.consumeDoubleClick({
          x: ((event.clientX - rect.left) * container.clientWidth) / rect.width,
          y:
            ((event.clientY - rect.top) * container.clientHeight) / rect.height,
        })
      )
        return;
      if (
        disposed ||
        instance !== activeInstance ||
        generation !== activeGeneration
      )
        return;
      activeInstance.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
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
    const owners = [pointer, pieLegend];
    pointer = undefined;
    pieLegend = undefined;
    const cleanup = [
      () => keyboard.dispose(),
      () => hierarchyHover.dispose(),
      ...owners.map((owner) => () => owner?.dispose()),
      () => previous?.off?.("datazoom", navigatorListener),
      () => previous?.dispose(),
    ];
    let failure: unknown;
    for (const action of cleanup) {
      try {
        action();
      } catch (error) {
        failure ??= error;
      }
    }
    navigatorListener = undefined;
    if (failure) throw failure;
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
    pieLegend = bindLifecycleLegend(instance, {
      container,
      isActive: () => active() && generation === current,
      repaint: () => {
        if (pending) render(pending, true);
      },
      fail: interactionFailure,
    });
  }

  function refreshNavigatorMask(): void {
    if (
      disposed ||
      applying ||
      !instance ||
      !pending ||
      !hasNavigator(pending.options)
    )
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
            projectLifecycleLegend(
              pending,
              instance.getOption() as EChartsOption,
              appliedScope,
              appliedRevision,
            ),
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
            yAxis: [
              window.yAxis,
              ...navigatorAxes(pending.options.yAxis).slice(1),
            ],
          });
        } finally {
          applying = false;
        }
      }
      const options = retainNavigatorExtent(
        pending.options,
        instance.getOption(),
      );
      if (options.graphic) instance.setOption({ graphic: options.graphic });
    } catch (error) {
      interactionFailure(error);
    }
  }

  function render(request: ChartRenderRequest, force = false): void {
    if (!instance || (!force && appliedRevision === request.revision)) return;
    applying = true;
    pointer?.clear();
    hierarchyHover.clearPlan();
    try {
      let options = projectLifecycleOptions(
        request,
        (request.projectLegendSelection && request.legendScope !== undefined) ||
          (appliedRevision !== undefined &&
            appliedScope === request.legendScope &&
            (request.projectNavigationWindow ||
              (pending &&
                hasNavigator(pending.options) &&
                hasNavigator(request.options))))
          ? (instance.getOption() as EChartsOption)
          : undefined,
        appliedScope,
        appliedRevision,
        pending,
      );
      options =
        pieLegend?.project(
          options,
          request.legendPagination,
          request.legendScope,
        ) ?? options;
      // ECharts 6 retains a resize hover timer after notMerge disposes its tooltip view.
      instance.dispatchAction({ type: "hideTip" });
      instance.setOption(options, { notMerge: true });
      pointer?.setPlan(request.projectPointer?.(options));
      pieLegend?.sync();
      keyboard.rendered(instance, request);
      appliedRevision = request.revision;
      appliedScope = request.legendScope;
      hierarchyHover.rendered(request.revision, request.hierarchyHover);
    } finally {
      applying = false;
    }
  }

  function apply(
    request: ChartRenderRequest,
    resizing = false,
  ): LifecycleResult {
    try {
      if (!sized()) {
        pointer?.clear();
        keyboard.clear();
        hierarchyHover.clearPlan();
        return "deferred";
      }
      instance ??= init(container);
      if (request.projectPointer)
        pointer ??= createRangePointerBinding(container, interactionFailure);
      bindPieLegend();
      if (request.hierarchyHover) {
        const current = generation;
        hierarchyHover.ensure(
          instance,
          () =>
            !disposed &&
            !applying &&
            sized() &&
            !!instance &&
            current === generation &&
            appliedRevision === pending?.revision,
          interactionFailure,
        );
      }
      if (hasNavigator(request.options) && !navigatorListening) {
        const current = generation;
        navigatorListener = () => {
          if (generation === current) refreshNavigatorMask();
        };
        instance.on("datazoom", navigatorListener);
        navigatorListening = true;
      }
      if (request.projectLegendSelection && request.legendScope !== undefined)
        pieLegend?.listen();
      if (resizing) instance.resize();
      render(
        request,
        resizing &&
          (!!request.projectLegendSelection ||
            !!request.legendPagination ||
            !!request.keyboardNavigation ||
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
    pointer?.clear();
    try {
      hierarchyHover.expire(pending?.revision);
    } catch (error) {
      interactionFailure(error);
      return "deferred";
    }
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
