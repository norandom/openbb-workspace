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
