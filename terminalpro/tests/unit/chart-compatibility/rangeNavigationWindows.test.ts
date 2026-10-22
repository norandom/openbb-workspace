import { init, type EChartsOption } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectRangeLiveApplication } from "../../../src/components/General/Table/Chart/echarts/rangeLiveProjection";
import { rangeLiveMetadata } from "../../../src/components/General/Table/Chart/echarts/rangeLiveMetadata";
import {
  readRangeWindow,
  retainRangeWindows,
} from "../../../src/components/General/Table/Chart/echarts/rangeNavigationWindow";
import { rangePointerCandidates } from "../../../src/components/General/Table/Chart/echarts/rangePointerCandidates";
import { rangeLiveInput } from "./rangeLive.fixtures";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function live(auto = false, horizontal = true) {
  const base = rangeLiveInput();
  const input = {
    ...base,
    baseline: {
      ...base.baseline,
      options: {
        "range-bar": {
          zoom: { enabled: true, autoScaling: { enabled: auto } },
          series: { direction: horizontal ? "horizontal" : "vertical" },
        },
      },
    },
  };
  const result = projectRangeLiveApplication(input, {
    navigatorEnabled: true,
    miniChartEnabled: true,
  });
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return { result, input };
}
function current(x: readonly [number, number], y: readonly [number, number]) {
  return {
    dataZoom: [
      { id: "openbb-navigator", start: x[0] * 100, end: x[1] * 100 },
      { id: "openbb-range-x-inside", start: x[0] * 100, end: x[1] * 100 },
      { id: "openbb-range-inside", start: y[0] * 100, end: y[1] * 100 },
    ],
  };
}
describe("Range independent native x/y transport", () => {
  it("autoscales reversed asymmetric crops from their actually visible raw extrema", () => {
    const base = rangeLiveInput();
    const input = {
      ...base,
      snapshot: {
        ...base.snapshot,
        rows: ["A", "B", "C"].flatMap((category, n) => [
          {
            id: `l${n}`,
            category,
            values: { amount: [1, 50, 100][n], other: [2, 60, 110][n] },
          },
          {
            id: `h${n}`,
            category,
            values: { amount: [5, 90, 200][n], other: [6, 95, 210][n] },
          },
        ]),
      },
      baseline: {
        ...base.baseline,
        options: {
          "range-bar": {
            zoom: { enabled: true },
            axes: { category: { reverse: true } },
          },
        },
      },
    };
    const result = projectRangeLiveApplication(input, {
      navigatorEnabled: true,
      miniChartEnabled: true,
    });
    if (result.status !== "supported") throw Error(JSON.stringify(result));
    const applied = result.projectNavigationWindow(
      result.options,
      current([0, 0.3], [0, 1]),
    );
    const c = rangeLiveMetadata(applied).composed;
    expect(c.valueAxis.visibleExtent[1]).toBeLessThan(20);
    const candidates = rangePointerCandidates(c)
      .flat()
      .filter((candidate) => candidate.majorVisible);
    expect(candidates.map((candidate) => candidate.rawIdentity?.category)).toEqual([
      "A",
      "A",
    ]);
    expect(candidates.every((candidate) => candidate.minorVisible)).toBe(true);
  });
  it("retains horizontal slider/value and wheel/category independently and resets both", () => {
    const { result } = live();
    const options = result.projectNavigationWindow(
      result.options,
      current([0.25, 0.75], [0.1, 0.9]),
    );
    const composed = rangeLiveMetadata(options).composed;
    expect(composed.category.visibleFraction).toBeCloseTo(0.8);
    expect(composed.valueAxis.visibleExtent).not.toEqual(
      result.composed.valueAxis.fullExtent,
    );
    const zoom = options.dataZoom as any[];
    expect(zoom.find((z) => z.id === "openbb-range-x-inside").zoomOnMouseWheel).toBe(
      false,
    );
    expect(zoom.find((z) => z.id === "openbb-range-inside").zoomOnMouseWheel).toBe(
      true,
    );
    const retained = retainRangeWindows(result.options, options);
    expect(readRangeWindow(retained, "x")).toEqual([0.25, 0.75]);
    expect(readRangeWindow(retained, "y")).toEqual([0.1, 0.9]);
    const reset = result.projectNavigationWindow(options, current([0, 1], [0, 1]));
    expect(rangeLiveMetadata(reset).composed.category.visibleExtent).toEqual(
      result.composed.category.fullExtent,
    );
    expect(rangeLiveMetadata(reset).composed.valueAxis.visibleExtent).toEqual(
      result.composed.valueAxis.fullExtent,
    );
  });
  it("applies full-x autoscale reset and preserves prior y when source conversion has no result", () => {
    const { result } = live(true);
    const fullX = result.projectNavigationWindow(
      result.options,
      current([0, 1], [0.2, 0.8]),
    );
    expect(readRangeWindow(fullX, "y")).toEqual([0, 1]);
    const noResult = result.projectNavigationWindow(
      result.options,
      current([0.25, 0.75], [0.2, 0.8]),
    );
    expect(readRangeWindow(noResult, "y")).toEqual([0.2, 0.8]);
  });
  it("installed ECharts applies independent carrier zoom without cropping financial axes a second time", () => {
    const { result, input } = live();
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...input.viewport,
    });
    try {
      chart.setOption(result.options);
      chart.dispatchAction({
        type: "dataZoom",
        batch: [
          { dataZoomId: "openbb-navigator", start: 25, end: 75 },
          { dataZoomId: "openbb-range-inside", start: 10, end: 90 },
        ],
      });
      const applied = result.projectNavigationWindow(
        result.options,
        chart.getOption() as EChartsOption,
      );
      chart.setOption(applied, { notMerge: true });
      const c = rangeLiveMetadata(applied).composed;
      expect(
        chart.convertToPixel({ xAxisIndex: 0 }, c.valueAxis.visibleExtent[0]!),
      ).toBeCloseTo(c.plot.left);
      expect(
        chart.convertToPixel({ yAxisIndex: 0 }, c.category.visibleExtent[0]!),
      ).toBeCloseTo(c.plot.top);
      expect(rangePointerCandidates(c)).not.toEqual(
        rangePointerCandidates(result.composed),
      );
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  });
});
