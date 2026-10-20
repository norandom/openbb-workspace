import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { xyNavigator } from "../../../src/components/General/Table/Chart/echarts/xyNavigator";
import { xyNavigationWindow } from "../../../src/components/General/Table/Chart/echarts/xyNavigationWindow";

const theme: any = { colors: { textColor: "#111", foregroundColor: "#fff", backgroundColor: "#fff", chartBackgroundColor: "#fff" } };
const observations = [[365817e6,94680e6],[394328e6,99803e6],[383285e6,96995e6],[391035e6,93736e6],[416161e6,112010e6]];
function source(points = observations): any {
  return { grid: { left: 60, right: 10, top: 20, bottom: 40 },
    xAxis: { type: "value", scale: true }, yAxis: { type: "value", scale: true },
    series: [{ id: "observations", type: "scatter", data: points.map(value => ({ value, diameter: 40 })), symbolSize: 40 }] };
}
const viewport = { width: 381, height: 284 };
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  measureText: (text: string) => ({ width: text.length * 6 }),
} as any));
it("renders original full ranges in the actual ECharts coordinate system", () => {
  const input = source();
  const options = xyNavigator(input, input, true, true, theme, viewport);
  const chart = init(null, undefined, { renderer: "svg", ssr: true, ...viewport });
  try {
    chart.setOption({ ...options, animation: false });
    const series = (chart as any).getModel().getSeries()[0];
    expect(series.coordinateSystem.getAxis("x").scale.getExtent()).toEqual([360e9,420e9]);
    expect(series.coordinateSystem.getAxis("y").scale.getExtent()).toEqual([90e9,120e9]);
    expect(series.getData().count()).toBe(5);
    const miniature = (chart as any).getModel().getSeries()[1];
    expect(miniature.coordinateSystem.getArea().height).toBe(18);
    expect(miniature.getData().count()).toBe(5);
    expect(series.coordinateSystem.getArea().height).toBeGreaterThan(100);
    const mainArea = { ...series.coordinateSystem.getArea() };
    const comparison = init(null, undefined, { renderer: "svg", ssr: true, ...viewport });
    try {
      const baseline: any = { ...options, animation: false,
        grid: (options.grid as any[]).map((grid, index) => index === 1 ? { ...grid, outerBoundsMode: "same" } : grid) };
      comparison.setOption(baseline);
      expect({ ...(comparison as any).getModel().getSeries()[0].coordinateSystem.getArea() }).toEqual(mainArea);
    } finally { comparison.dispose(); }
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally { chart.dispose(); }
});
it.each([false, true])("matches original rounded FMP axes with mini=%s", mini => {
  const input = source();
  const out: any = xyNavigator(input, input, mini, mini, theme, viewport);
  const x = Array.isArray(out.xAxis) ? out.xAxis[0] : out.xAxis;
  const y = Array.isArray(out.yAxis) ? out.yAxis[0] : out.yAxis;
  expect(x).toMatchObject({ min: 360e9, max: 420e9 });
  expect(y).toMatchObject({ min: 90e9, max: 120e9 });
  expect(input.xAxis.min).toBeUndefined();
  expect(out.series[0].data).toEqual(input.series[0].data);
  if (mini) {
    expect(out.grid[1].height).toBe(18);
    expect(out.dataZoom[0].minValueSpan).toBe(28511e6);
    const reset = xyNavigationWindow(out, { dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }] });
    expect(reset?.yAxis).toMatchObject({ min: 90e9, max: 120e9 });
  }
});
it("keeps explicit endpoints through zoom and reset while rounding the free endpoint", () => {
  const input = source(); input.xAxis.min = 350e9; input.yAxis.min = 85e9;
  const out: any = xyNavigator(input, input, true, true, theme, viewport);
  expect(out.xAxis[0]).toMatchObject({ min: 350e9, max: 420e9 });
  for (const [start,end] of [[10,80],[0,100]]) {
    const window = xyNavigationWindow(out, { dataZoom: [{ id: "openbb-navigator", start, end }] });
    expect(window?.yAxis.min).toBe(85e9);
    expect(window?.yAxis.max).toBeGreaterThanOrEqual(99803e6);
  }
});
it("retains the actual-count guard and leaves empty axes empty", () => {
  const input = source();
  const out = xyNavigator(input, input, true, true, theme, viewport);
  const window = xyNavigationWindow(out, { dataZoom: [{ id: "openbb-navigator", start: 48, end: 49 }] });
  expect(window?.changed).toBe(true);
  const low = 360e9 + 60e9 * window!.start / 100;
  const high = 360e9 + 60e9 * window!.end / 100;
  expect(observations.filter(([x]) => x >= low && x <= high)).toHaveLength(4);
  const empty = source([]); empty.xAxis.show = false; empty.yAxis.show = false;
  const blank: any = xyNavigator(empty, empty, true, true, theme, viewport);
  expect(blank.xAxis[0]).toMatchObject({ show: false });
  expect(blank.xAxis[0].min).toBeUndefined();
  expect(blank.yAxis[0].min).toBeUndefined();
});
it("keeps equal-value domains finite", () => {
  const input = source([[10,10],[10,10]]);
  const out: any = xyNavigator(input, input, true, true, theme, viewport);
  for (const axis of [out.xAxis[0],out.yAxis[0]]) {
    expect(Number.isFinite(axis.min)).toBe(true);
    expect(Number.isFinite(axis.max)).toBe(true);
    expect(axis.max).toBeGreaterThan(axis.min);
  }
});
