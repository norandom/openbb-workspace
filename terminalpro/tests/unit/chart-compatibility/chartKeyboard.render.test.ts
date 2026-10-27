import { init, type EChartsType } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import {
  groupedBarBounds,
  groupedBarSeriesGeometry,
} from "../../../src/components/General/Table/Chart/echarts/chartKeyboardGeometry";
import type { GroupedBarKeyboardPlan } from "../../../src/components/General/Table/Chart/echarts/chartKeyboardTypes";
import { createLifecycleKeyboard } from "../../../src/components/General/Table/Chart/echarts/lifecycleKeyboard";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as CanvasRenderingContext2D),
);

it("shows the native HTML tooltip for a keyboard-focused series through the public action contract", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const chart = init(container, undefined, {
    renderer: "svg",
    width: 600,
    height: 400,
  });
  const plan: GroupedBarKeyboardPlan = {
    kind: "grouped-bar",
    label: "Sample",
    gridId: "grid",
    xAxisId: "categories",
    yAxisId: "values",
    categories: ["Peter", "Mary"],
    series: [{ id: "tm", name: "TM", values: [60, 57] }],
    geometry: { barWidth: 12, barGap: 0.25 },
    focus: { color: "blue", backgroundColor: "white", borderWidth: 2 },
  };
  const options = {
    animation: false,
    grid: { id: "grid" },
    tooltip: {
      trigger: "item" as const,
      renderMode: "html" as const,
      className: "keyboard-tooltip",
      formatter: (item: any) => `${item.name}/${item.seriesName}/${item.value}`,
    },
    xAxis: {
      id: "categories",
      type: "category" as const,
      data: [...plan.categories],
    },
    yAxis: { id: "values", type: "value" as const },
    series: [
      {
        id: "tm",
        name: "TM",
        type: "bar" as const,
        ...groupedBarSeriesGeometry(plan.geometry),
        data: [60, 57],
      },
    ],
  };
  const binding = createLifecycleKeyboard({
    container,
    isActive: () => true,
    fail: (error) => {
      throw error;
    },
  });
  try {
    chart.setOption(options);
    binding.rendered(chart, { options, revision: 1, keyboardNavigation: plan });
    const plot = container.querySelector<HTMLElement>(
      '[data-chart-keyboard="plot"]',
    )!;
    plot.focus();
    expect(container.querySelector(".keyboard-tooltip")?.textContent).toBe(
      "Peter/TM/60",
    );
    plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(container.querySelector(".keyboard-tooltip")?.textContent).toBe(
      "Mary/TM/57",
    );
  } finally {
    binding.dispose();
    chart.dispose();
    container.remove();
  }
});

it("matches native bar graphic bounds after legend filtering and resize using only public coordinates in production", () => {
  const plan: GroupedBarKeyboardPlan = {
    kind: "grouped-bar",
    label: "Sample",
    gridId: "grid",
    xAxisId: "categories",
    yAxisId: "values",
    categories: ["Peter", "Mary"],
    series: [
      { id: "tm", name: "TM", values: [60, 57] },
      { id: "ym", name: "YM", values: [64, 93] },
      { id: "duration", name: "Duration", values: [120, 135] },
    ],
    geometry: { barWidth: 12, barGap: 0.25 },
    focus: { color: "blue", backgroundColor: "white", borderWidth: 2 },
  };
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 400,
  });
  chart.setOption({
    animation: false,
    grid: { id: "grid", left: 50, right: 30, top: 20, bottom: 40 },
    legend: { data: plan.series.map((s) => s.name) },
    xAxis: { id: "categories", type: "category", data: [...plan.categories] },
    yAxis: { id: "values", type: "value" },
    series: plan.series.map((s) => ({
      id: s.id,
      name: s.name,
      type: "bar",
      ...groupedBarSeriesGeometry(plan.geometry),
      data: [...s.values],
    })),
  });
  function check(selected: Record<string, boolean>) {
    for (const series of plan.series.filter(
      (s) => selected[s.name] !== false,
    )) {
      for (let index = 0; index < plan.categories.length; index++) {
        const bounds = groupedBarBounds(
          plan,
          selected,
          series.id,
          index,
          (finder, value) => chart.convertToPixel(finder, value) as number,
        );
        // The independent oracle is the native painted rectangle, not another geometry helper.
        const model = (chart as EChartsType & { getModel(): any })
          .getModel()
          .queryComponents({ mainType: "series", id: series.id })[0];
        const shape = model.getData().getItemGraphicEl(index).shape;
        expect(bounds?.x).toBeCloseTo(shape.x);
        expect(bounds?.width).toBeCloseTo(shape.width);
        expect(bounds?.y).toBeCloseTo(
          Math.min(shape.y, shape.y + shape.height),
        );
        expect(bounds?.height).toBeCloseTo(Math.abs(shape.height));
      }
    }
  }
  try {
    check({});
    chart.dispatchAction({ type: "legendUnSelect", name: "YM" });
    check({ YM: false });
    chart.resize({ width: 350, height: 260 });
    check({ YM: false });
    chart.dispatchAction({ type: "legendSelect", name: "YM" });
    check({});
  } finally {
    chart.dispose();
  }
});
