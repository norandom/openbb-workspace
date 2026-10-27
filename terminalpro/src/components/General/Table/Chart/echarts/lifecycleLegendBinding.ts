import type { ECharts, EChartsOption } from "echarts";
import { createPieLegendBinding } from "./pieLegendBinding";

interface LegendLifecyclePorts {
  readonly container: HTMLDivElement;
  readonly isActive: () => boolean;
  readonly repaint: () => void;
  readonly fail: (error: unknown) => void;
}

/** Bridge selection through public engine actions; the existing binding owns page/DOM state. */
export function bindLifecycleLegend(
  chart: ECharts,
  ports: LegendLifecyclePorts,
) {
  let listening = false;
  const selectionListener = () => {
    if (!ports.isActive()) return;
    try {
      ports.repaint();
    } catch (error) {
      ports.fail(error);
    }
  };
  const binding = createPieLegendBinding({
    ...ports,
    readSelected: () => {
      const legends = (chart.getOption() as EChartsOption).legend;
      return (Array.isArray(legends) ? legends[0] : legends)?.selected ?? {};
    },
    toggle: (key) => {
      chart.dispatchAction({ type: "legendToggleSelect", name: key });
    },
    select: (selected) => {
      for (const [name, enabled] of Object.entries(selected))
        chart.dispatchAction({
          type: enabled ? "legendSelect" : "legendUnSelect",
          name,
        });
      ports.repaint();
    },
    emphasize: (key) => {
      chart.dispatchAction({ type: "downplay" });
      if (key !== undefined)
        chart.dispatchAction({ type: "highlight", seriesName: key });
    },
  });
  const listener = (event: unknown) => binding.handleClick(event);
  chart.on?.("click", listener);
  return {
    ...binding,
    listen: () => {
      if (listening) return;
      chart.on("legendselectchanged", selectionListener);
      listening = true;
    },
    dispose: () => {
      let failure: unknown;
      for (const cleanup of [
        () => binding.dispose(),
        () => chart.off?.("click", listener),
        () => chart.off?.("legendselectchanged", selectionListener),
      ]) {
        try {
          cleanup();
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },
  };
}
