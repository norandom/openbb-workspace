import type { ECharts, EChartsOption } from "echarts";
import { createChartKeyboardBinding } from "./chartKeyboardBinding";
import type { ChartKeyboardBinding } from "./chartKeyboardTypes";
import type { ChartRenderRequest } from "./lifecycleTypes";

interface KeyboardLifecyclePorts {
  readonly container: HTMLDivElement;
  readonly isActive: () => boolean;
  readonly fail: (error: unknown) => void;
}

export function createLifecycleKeyboard(ports: KeyboardLifecyclePorts) {
  let binding: ChartKeyboardBinding | undefined;
  let instance: ECharts | undefined;
  let originalPosition: string | undefined;
  let scope: string | undefined;

  function ensure(chart: ECharts): ChartKeyboardBinding {
    if (
      !getComputedStyle(ports.container).position ||
      getComputedStyle(ports.container).position === "static"
    ) {
      originalPosition = ports.container.style.position;
      ports.container.style.position = "relative";
    }
    if (binding && instance === chart) return binding;
    instance = chart;
    binding = createChartKeyboardBinding({
      ...ports,
      readSelected: () => {
        const legends = (chart.getOption() as EChartsOption).legend;
        return (Array.isArray(legends) ? legends[0] : legends)?.selected ?? {};
      },
      convertToPixel: (finder, value) =>
        chart.convertToPixel(finder, value) as number,
      clear: () => {
        chart.dispatchAction({ type: "downplay" });
        chart.dispatchAction({ type: "hideTip" });
      },
      highlight: (seriesId, dataIndex) => {
        const series = (chart.getOption() as EChartsOption).series;
        const seriesIndex = (
          Array.isArray(series) ? series : [series]
        ).findIndex((item) => item?.id === seriesId);
        if (seriesIndex < 0)
          throw new Error("Chart keyboard series is unavailable");
        chart.dispatchAction({ type: "downplay" });
        chart.dispatchAction({ type: "highlight", seriesId, dataIndex });
        chart.dispatchAction({ type: "showTip", seriesIndex, dataIndex });
      },
    });
    return binding;
  }

  function rendered(chart: ECharts, request: ChartRenderRequest): void {
    if (!request.keyboardNavigation && !binding) return;
    scope = request.legendScope;
    ensure(chart).sync(request.keyboardNavigation, request.legendScope);
  }

  function dispose(): void {
    const previous = binding;
    binding = undefined;
    instance = undefined;
    try {
      previous?.dispose();
    } finally {
      if (originalPosition !== undefined)
        ports.container.style.position = originalPosition;
      originalPosition = undefined;
    }
  }
  return { rendered, clear: () => binding?.sync(undefined, scope), dispose };
}
