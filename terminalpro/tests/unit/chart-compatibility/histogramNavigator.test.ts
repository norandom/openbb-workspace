import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { histogramInput, histogramOptions } from "./histogram.fixtures";
import { histogramNavigator } from "../../../src/components/General/Table/Chart/echarts/histogramNavigator";
import { histogramNavigationWindow } from "../../../src/components/General/Table/Chart/echarts/histogramNavigationWindow";
import { retainNavigatorExtent } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigator";
import { createChartLifecycle } from "../../../src/components/General/Table/Chart/echarts/lifecycle";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import * as bins from "../../../src/components/General/Table/Chart/compatibility/histogramBins";
const mocks = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("echarts", async importOriginal => ({ ...await importOriginal<typeof import("echarts")>(), init: mocks.init }));
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any));
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const input = histogramInput([1, 1, 3, 6, 7, 8]);
  input.style.series.labels.enabled = true;
  const options = histogramNavigator(histogramOptions(input), input, true, true,
    projectCallerTheme("light", [], {}), { width: 800 });
  return { input, options };
}
function current(start: number, end: number, selected = true): any {
  return { dataZoom: [{ id: "openbb-navigator", start, end }], legend: [{ selected: { amount: selected } }] };
}
it("includes partial and boundary-touching bins without an observation minimum; empty windows recover", () => {
  const { options } = fixture();
  const original = JSON.stringify((options.series as any[]).map(s => s.data));
  expect(histogramNavigationWindow(options, current(19, 21))).toMatchObject({ start: 19, end: 21, changed: false, yAxis: { min: 0, max: 2 } });
  expect(histogramNavigationWindow(options, current(20, 20))).toMatchObject({ yAxis: { max: 2 } });
  expect(histogramNavigationWindow(options, current(49, 51))).toMatchObject({ yAxis: { max: 3 } });
  expect(histogramNavigationWindow(options, current(110, 120))).toMatchObject({ yAxis: { show: false, min: 0, max: 1 } });
  expect(histogramNavigationWindow(options, current(0, 100))).toMatchObject({ yAxis: { show: true, max: 3 } });
  expect(JSON.stringify((options.series as any[]).map(s => s.data))).toBe(original);
  const retained: any = retainNavigatorExtent(options, current(10, 20));
  expect(retained.dataZoom.map((z: any) => [z.start, z.end, z.xAxisIndex, z.filterMode])).toEqual([
    [10, 20, [0], "none"], [10, 20, [0], "none"],
  ]);
});
it("uses full overview values and suppresses captured custom labels only in the miniature", () => {
  const { options } = fixture();
  const [main, mini]: any[] = options.series as any[];
  expect(mini.data).toEqual(main.data);
  expect([main.id, mini.id, mini.xAxisIndex, mini.yAxisIndex, mini.silent]).toEqual([main.id, expect.stringContaining("openbb-mini-"), 1, 1, true]);
  const api: any = { value: (index: number) => main.data[0].value[index], coord: ([x, y]: number[]) => [x * 10, 100 - y * 10] };
  expect(main.renderItem({ dataIndex: 0 }, api).textContent).toBeDefined();
  expect(mini.renderItem({ dataIndex: 0 }, api).textContent).toBeUndefined();
  expect(mini.tooltip).toEqual({ show: false });
});
it("honors outward Y bounds and direction-specific exclusions", () => {
  const { options } = fixture();
  const outward = { ...options, openbbHistogram: { yMin: -5, yMax: 20 } };
  expect(histogramNavigationWindow(outward, current(0, 100))).toMatchObject({ yAxis: { min: -5, max: 20, show: true } });
  expect(histogramNavigationWindow({ ...options, openbbHistogram: { yMin: 4 } }, current(0, 100))).toMatchObject({ yAxis: { show: false } });
  expect(histogramNavigationWindow(options, current(0, 100, false))).toMatchObject({ yAxis: { show: false } });
});
it("host zoom, pan, reset, legend, resize and refresh retain geometry and current-revision export", () => {
  const calculate = vi.spyOn(bins, "calculateHistogramBins");
  const { options } = fixture();
  const calculated = calculate.mock.calls.length;
  let native: any = options;
  const listeners = new Map<string, () => void>();
  const chart = {
    setOption: vi.fn((next: any, replace?: any) => { native = replace?.notMerge ? next : { ...native, ...next }; }),
    getOption: vi.fn(() => native), resize: vi.fn(), dispose: vi.fn(),
    getDataURL: vi.fn(() => "data:image/png;base64,current"),
    on: vi.fn((event: string, fn: () => void) => listeners.set(event, fn)),
    off: vi.fn((event: string) => listeners.delete(event)),
    dispatchAction: vi.fn((action: any) => { native = { ...native, dataZoom: (native.dataZoom as any[]).map(z => ({ ...z, start: action.start, end: action.end })) }; listeners.get("datazoom")?.(); }),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { value: 800 }, clientHeight: { value: 500 } });
  const legend = vi.fn((selected: any) => ({ ...options, legend: [{ ...(options.legend as any), selected }] }));
  const owner = createChartLifecycle(container);
  owner.mount({ options, revision: 1, legendScope: "histogram-1", projectLegendSelection: legend });
  const legendCalls = legend.mock.calls.length;
  native = { ...native, ...current(19, 21) };
  listeners.get("datazoom")!();
  expect(native.yAxis[0].max).toBe(2);
  expect(legend.mock.calls.length).toBe(legendCalls);
  native = { ...native, ...current(60, 80) };
  listeners.get("datazoom")!();
  expect(native.yAxis[0].max).toBe(3);
  container.dispatchEvent(new MouseEvent("dblclick"));
  expect(native.dataZoom[0]).toMatchObject({ start: 0, end: 100 });
  native = { ...native, legend: [{ selected: { amount: false } }] };
  listeners.get("legendselectchanged")!();
  expect(native.yAxis[0].show).toBe(false);
  expect(native.series[1].data).toEqual((options.series as any[])[1].data);
  native = { ...native, legend: [{ selected: { amount: true } }] };
  listeners.get("legendselectchanged")!();
  expect(native.yAxis[0].show).toBe(true);
  owner.resize();
  expect(chart.on).toHaveBeenCalledTimes(2);
  expect(calculate.mock.calls.length).toBe(calculated);
  owner.update({ options, revision: 2, legendScope: "histogram-1", projectLegendSelection: legend });
  expect(() => owner.exportImage(undefined, 1)).toThrow();
  expect(owner.exportImage(undefined, 2)).toBe("data:image/png;base64,current");
  owner.dispose();
  expect(listeners.size).toBe(0);
  expect(chart.dispose).toHaveBeenCalledOnce();
});
it("keeps endpoint-equal supplied Y bounds finite and nondegenerate", () => {
  const { options } = fixture();
  expect(histogramNavigationWindow({ ...options, openbbHistogram: { yMin: 3 } }, current(0, 100))).toMatchObject({ yAxis: { show: true, min: 3, max: 4 } });
  expect(histogramNavigationWindow({ ...options, openbbHistogram: { yMax: 0 } }, current(0, 100))).toMatchObject({ yAxis: { show: true, min: -1, max: 0 } });
});
it("native ECharts retains frequencies under interval zoom and native legend hide/restore", async () => {
  const engine = await vi.importActual<typeof import("echarts")>("echarts");
  const { options } = fixture();
  const chart = engine.init(null, undefined, { renderer: "svg", ssr: true, width: 800, height: 500 });
  try {
    chart.setOption(options);
    const frequencies = () => (chart as any).getModel().getSeries()[0].getData().mapArray("frequency", (v: number) => v);
    expect(frequencies()).toEqual([2, 1, 3]);
    chart.dispatchAction({ type: "dataZoom", start: 19, end: 21 });
    expect(frequencies()).toEqual([2, 1, 3]);
    chart.dispatchAction({ type: "legendUnSelect", name: "amount" });
    expect((chart.getOption().legend as any[])[0].selected.amount).toBe(false);
    chart.dispatchAction({ type: "legendSelect", name: "amount" });
    expect(frequencies()).toEqual([2, 1, 3]);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally { chart.dispose(); }
});

it("uses the decorated main-grid pixel budget and clears intervals for hidden or empty windows", () => {
  const input = histogramInput(Array.from({ length: 9 }, () => 3));
  input.context.viewport = { width: 359, height: 284 };
  input.style.application.title.enabled = input.style.application.subtitle.enabled = false;
  input.style.application.legend.enabled = false;
  input.style.application.padding = { top: 20, right: 20, bottom: 20, left: 20 };
  for (const axis of Object.values(input.style.axes)) {
    axis.appearance.title.enabled = false;
    axis.appearance.labels.rotation = 0;
  }
  const calculate = vi.spyOn(bins, "calculateHistogramBins");
  const options = histogramNavigator(histogramOptions(input), input, true, true,
    projectCallerTheme("light", [], {}), { width: 359 });
  const count = calculate.mock.calls.length;
  expect(options.openbbHistogram?.yPixels).toBeGreaterThan(0);
  expect(options.openbbHistogram?.yPixels).toBeLessThan(200);
  expect(histogramNavigationWindow(options, current(0, 100))).toMatchObject({ yAxis: { min: 0, max: 10, interval: 5 } });
  for (const window of [current(0, 100, false), current(110, 120)]) {
    const empty = histogramNavigationWindow(options, window);
    expect(empty?.yAxis).toMatchObject({ show: false, min: 0, max: 1 });
    expect(empty?.yAxis.interval).toBeUndefined();
  }
  const exhausted = { ...options, openbbHistogram: { yPixels: 0 } };
  expect(histogramNavigationWindow(exhausted, current(0, 100))?.yAxis).toMatchObject({ min: 0, max: 9 });
  expect(histogramNavigationWindow(exhausted, current(0, 100))?.yAxis.interval).toBeUndefined();
  expect(histogramNavigationWindow(options, current(0, 100))?.yAxis.interval).toBe(5);
  expect(calculate.mock.calls.length).toBe(count);
});

it("clears a retained native interval through ECharts merge for empty and fallback windows", async () => {
  const engine = await vi.importActual<typeof import("echarts")>("echarts");
  const { options } = fixture();
  const chart = engine.init(null, undefined, { renderer: "svg", ssr: true, width: 800, height: 500 });
  try {
    chart.setOption(options);
    const nativeY = () => {
      const axes = chart.getOption().yAxis;
      return Array.isArray(axes) ? axes[0] : axes;
    };
    for (const [retained, window] of [[options, current(0, 100, false)],
      [options, current(110, 120)], [{ ...options, openbbHistogram: { yPixels: 0 } }, current(0, 100)]] as const) {
      chart.setOption({ yAxis: [{ type: "value", min: 0, max: 10, interval: 5 }] });
      expect(nativeY()).toHaveProperty("interval", 5);
      const update = histogramNavigationWindow(retained, window);
      if (!update) throw Error("Expected retained histogram window");
      chart.setOption({ yAxis: [update.yAxis] });
      expect(nativeY()).toHaveProperty("interval", undefined);
      const restored = histogramNavigationWindow(options, current(0, 100));
      if (!restored) throw Error("Expected restored histogram window");
      chart.setOption({ yAxis: [restored.yAxis] });
      expect(nativeY()).toHaveProperty("interval", restored.yAxis.interval);
      expect(nativeY()).toMatchObject({ show: true, min: 0, max: 3 });
    }
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally { chart.dispose(); }
});

it("updates endpoint labels through native zoom, reset and resize while isolating overview and Y", async () => {
  const engine = await vi.importActual<typeof import("echarts")>("echarts");
  const input = histogramInput();
  input.context.display.numericAxis = value => `X-value-${value}-long`;
  input.style.axes.x.appearance.labels.color = "#b12345";
  input.style.application.padding.right = 20;
  Object.assign(input.style.axes.x, { min: 0, max: 10 });
  const options = histogramNavigator(histogramOptions(input), input, true, true,
    projectCallerTheme("light", [], {}), { width: 800 });
  for (const axis of options.xAxis as any[]) axis.interval = 2;
  const data = JSON.stringify((options.series as any[]).map(series => series.data));
  const calculate = vi.spyOn(bins, "calculateHistogramBins");
  const chart = engine.init(null, undefined, { renderer: "svg", ssr: true, width: 800, height: 500 });
  try {
    const axis = (dimension: "xAxis" | "yAxis", index = 0) => (chart as any).getModel().getComponent(dimension, index).axis;
    const labels = () => [...chart.renderToSVGString().matchAll(/<text[^>]*fill="#b12345"[^>]*>X-value-([^<]+)-long<\/text>/g)]
      .map(match => Number(match[1])).sort((a, b) => a - b);
    const native = (index = 0) => axis("xAxis", index).scale.getTicks().map((tick: any) => tick.value);
    const isolated = () => {
      expect(axis("xAxis", 1).getViewLabels().map((label: any) => label.tickValue)).toEqual([0, 2, 4, 6, 8, 10]);
      expect((chart.getOption().xAxis as any[])[1].axisLabel.customValues).toBeUndefined();
      expect((chart.getOption().yAxis as any[])[0].axisLabel.customValues).toBeUndefined();
      expect(axis("yAxis").getViewLabels().map((label: any) => label.tickValue))
        .toEqual(axis("yAxis").scale.getTicks().map((tick: any) => tick.value));
      expect(JSON.stringify((chart.getOption().series as any[]).map(series => series.data))).toBe(data);
    };
    chart.setOption(options);
    expect(labels()).toEqual([2, 4, 6, 8]);
    expect(native()).toEqual([0, 2, 4, 6, 8, 10]);
    isolated();
    chart.dispatchAction({ type: "dataZoom", start: 20, end: 80 });
    expect(native()).toEqual([2, 4, 6, 8]);
    expect(labels()).toEqual([2, 4, 6]);
    isolated();
    chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
    expect(labels()).toEqual([2, 4, 6, 8]);
    chart.resize({ width: 640, height: 400 });
    expect(labels()).toEqual([2, 4, 6, 8]);
    isolated();
    const main = (options.xAxis as any[])[0];
    chart.setOption({ xAxis: [{ openbbHistogramLabels: { ...main.openbbHistogramLabels, paddingRight: 100 } }] });
    expect(labels()).toEqual(native());
    expect((chart.getOption().xAxis as any[])[0].axisLabel.customValues).toBeUndefined();
    expect(calculate).not.toHaveBeenCalled();
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally { chart.dispose(); }
});
