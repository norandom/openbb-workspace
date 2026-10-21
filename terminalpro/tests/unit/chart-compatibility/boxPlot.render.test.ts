import * as echarts from "echarts";
import {
  type CustomSeriesOption,
  type EChartsOption,
  type EChartsType,
  graphic,
  init,
} from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import * as summary from "../../../src/components/General/Table/Chart/compatibility/boxSummary";
import { translateBoxPlot } from "../../../src/components/General/Table/Chart/echarts/boxPlot";
import type { BoxPlotMappingInput } from "../../../src/components/General/Table/Chart/echarts/boxPlotTypes";
import { createChartLifecycle } from "../../../src/components/General/Table/Chart/echarts/lifecycle";
import { histogramInput } from "./histogram.fixtures";

vi.mock("echarts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts")>();
  return { ...actual, init: vi.fn(actual.init) };
});

type Previous = [0, 0, 1, 2, 3, 4, 5, 6];
type Mutable<T, D extends number = 6> = D extends 0
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : { -readonly [K in keyof T]: Mutable<T[K], Previous[D]> };
function input(
  direction: "vertical" | "horizontal" = "vertical",
): Mutable<BoxPlotMappingInput> {
  const h = histogramInput([0, 2, 4, 6, 8, null, 10, 12, 14, 16, 18]);
  h.snapshot.rows.forEach((r, n) => {
    r.category = n < 5 ? "first" : n === 5 ? "" : "last";
    r.values.other = n === 5 ? null : n < 5 ? n + 20 : n + 25;
  });
  const category = h.style.axes.x.appearance;
  const number = h.style.axes.y;
  category.fields.type = "category";
  category.fields.position = direction === "vertical" ? "bottom" : "left";
  number.appearance.fields.position = direction === "vertical" ? "left" : "bottom";
  for (const a of [category, number.appearance]) {
    a.title.enabled = false;
    a.labels.rotation = 0;
    a.grid.enabled = false;
  }
  h.style.application.title.enabled =
    h.style.application.subtitle.enabled =
    h.style.application.legend.enabled =
      false;
  h.style.application.padding = { top: 40, bottom: 40, left: 40, right: 40 };
  const stroke = {
    stroke: "#ae1234",
    strokeWidth: 2,
    strokeOpacity: 0.7,
    lineDash: [3, 1],
    lineDashOffset: 1,
  };
  return {
    snapshot: h.snapshot,
    style: {
      common: h.style.common,
      application: h.style.application,
      direction,
      axes: { category, number },
      band: { paddingInner: 0.3, paddingOuter: 0, groupPaddingInner: 0.2 },
      fields: {
        amount: {
          ...stroke,
          fill: "#145da0",
          fillOpacity: 0.4,
          whisker: { ...stroke, stroke: "#cc7766", strokeWidth: 3, strokeOpacity: 0.2 },
          cap: { lengthRatio: 0.5 },
        },
        other: {
          ...stroke,
          fill: "#b33b32",
          fillOpacity: 0.8,
          whisker: { ...stroke },
          cap: { lengthRatio: 1 },
        },
      },
    },
    context: { ...h.context, viewport: { width: 600, height: 500 } },
  };
}
function options(i: BoxPlotMappingInput): EChartsOption {
  const r = translateBoxPlot(i);
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  return r.options;
}
function pixel(chart: EChartsType, x: number, y: number): number[] {
  return chart.convertToPixel({ gridIndex: 0 }, [x, y]) as number[];
}
function filled(chart: EChartsType, color: string) {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter(
      (el): el is InstanceType<typeof graphic.Rect> =>
        el instanceof graphic.Rect && el.style.fill === color,
    );
}
function engine(
  i: BoxPlotMappingInput,
  check: (chart: EChartsType, option: EChartsOption) => void,
) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...i.context.viewport,
  });
  try {
    const option = options(i);
    chart.setOption(option);
    check(chart, option);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);

it("draws source-derived grouped boxes, median strips and independently styled whiskers/caps in both directions with null-slot pointer identity", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = input(direction);
    const vertical = direction === "vertical";
    const calculate = vi.spyOn(summary, "calculateBoxSummary");
    engine(i, (chart, option) => {
      expect(calculate).toHaveBeenCalledTimes(6);
      const b = vertical ? 0 : 1;
      const v = vertical ? 1 : 0;
      const point = (slot: number, value: number) =>
        pixel(
          chart,
          ...((vertical ? [slot, value] : [value, slot]) as [number, number]),
        );
      const plotStart = point(-0.35, 0)[b];
      const plotEnd = point(2.35, 0)[b];
      const span = plotEnd - plotStart;
      const rawStep = span / 2.7;
      const categoryWidth = rawStep * 0.7;
      const step = Math.floor(categoryWidth / 1.8);
      const inset = Math.round((categoryWidth - step * 1.8) / 2);
      const width = Math.round(step * 0.8);
      const boxes = filled(chart, "#145da0");
      expect(boxes).toHaveLength(2);
      expect(filled(chart, "#b33b32")).toHaveLength(2);
      for (const [index, slot] of [0, 2].entries()) {
        const offset = slot === 0 ? 0 : 10;
        const shape = boxes[index].shape;
        const expectedStart = Math.round(plotStart + slot * rawStep) + inset;
        expect(vertical ? shape.x : shape.y).toBe(expectedStart);
        expect(vertical ? shape.width : shape.height).toBe(width);
        const q1 = Math.round(point(slot, offset + 2)[v]);
        const q3 = Math.round(point(slot, offset + 6)[v]);
        expect(vertical ? shape.y : shape.x).toBe(Math.min(q1, q3));
        expect(vertical ? shape.height : shape.width).toBe(Math.abs(q1 - q3));
        expect(boxes[index].style.opacity).toBe(0.4);
      }
      const lines = chart
        .getZr()
        .storage.getDisplayList(true)
        .filter(
          (el): el is InstanceType<typeof graphic.Line> =>
            el instanceof graphic.Line && el.style.stroke === "#cc7766",
        );
      expect(lines).toHaveLength(8);
      expect(
        lines.every(
          (l) => l.style.opacity === 0.2 && l.style.lineWidth === Math.min(3, width),
        ),
      ).toBe(true);
      const cap = lines[2].shape;
      const start = vertical ? boxes[0].shape.x : boxes[0].shape.y;
      expect(vertical ? cap.x1 : cap.y1).toBe(Math.floor(start + width * 0.25));
      expect(vertical ? cap.x2 : cap.y2).toBe(Math.ceil(start + width * 0.75));
      const median = filled(chart, "#ae1234");
      expect(median).toHaveLength(4);
      expect(median.every((r) => r.style.opacity === 0.7)).toBe(true);
      const medianPixel = Math.round(point(0, 4)[v]);
      const qLow = Math.min(Math.round(point(0, 2)[v]), Math.round(point(0, 6)[v]));
      const qHigh = Math.max(Math.round(point(0, 2)[v]), Math.round(point(0, 6)[v]));
      const mStart = Math.max(Math.round(medianPixel - 1), qLow + 2);
      const mEnd = Math.min(Math.round(medianPixel + 1), qHigh - 2);
      expect(vertical ? median[0].shape.y : median[0].shape.x).toBe(mStart);
      expect(vertical ? median[0].shape.height : median[0].shape.width).toBe(
        mEnd - mStart,
      );
      const outlines = chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((el) => el instanceof graphic.Rect && el.style.stroke === "#ae1234");
      expect(outlines).toHaveLength(4);
      expect(outlines[0].style.lineDash).toEqual([3, 1]);
      expect(outlines[0].style.lineDashOffset).toBe(1);
      const pointer: unknown[] = [];
      chart.on("updateAxisPointer", (e) => {
        pointer.push(e);
      });
      for (const slot of [0, 1, 2]) {
        const p = point(slot, 5);
        chart.dispatchAction({ type: "updateAxisPointer", x: p[0], y: p[1] });
        const e = pointer.at(-1) as {
          axesInfo: { axisDim: string; value: number }[];
          dataIndex: number;
        };
        expect(
          e.axesInfo.find((a) => a.axisDim === (vertical ? "x" : "y"))?.value,
        ).toBe(slot);
        const categoryAxis = (vertical ? option.xAxis : option.yAxis) as any;
        expect(categoryAxis.axisPointer.snap).toBe(true);
        expect(categoryAxis.axisLabel.formatter(slot)).toBe(
          `period:${["first", "", "last"][slot]}`,
        );
      }
      expect((option.tooltip as any).formatter({ axisValue: 1 })).toBe("");
      expect(chart.renderToSVGString()).toContain("clip-path=");
      expect(calculate).toHaveBeenCalledTimes(6);
    });
    calculate.mockRestore();
  }
  const singleton = input();
  singleton.snapshot.rows = singleton.snapshot.rows.slice(0, 5);
  singleton.context.legendSelection = { other: false };
  singleton.style.band.paddingOuter = 0.4;
  singleton.style.fields.amount.cap.lengthRatio = 0;
  engine(singleton, (chart) => {
    const left = pixel(chart, -0.5, 0)[0];
    const right = pixel(chart, 0.5, 0)[0];
    const rect = filled(chart, "#145da0")[0];
    expect(rect.shape.width).toBe(Math.round((right - left) * 0.2));
    expect(rect.shape.x).toBe(Math.round((left + right) / 2 - (right - left) * 0.1));
    const caps = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter(
        (e): e is InstanceType<typeof graphic.Line> =>
          e instanceof graphic.Line && e.style.stroke === "#cc7766",
      )
      .slice(2);
    expect(caps.every((c) => c.shape.x2 - c.shape.x1 <= 1)).toBe(true);
  });
});

it("uses native stable-ID legend events and remapping to recompute widths/domain through resize and SVG export", () => {
  const i = input();
  i.style.application.legend.enabled = true;
  engine(i, (chart) => {
    const before = filled(chart, "#145da0")[0].shape.width;
    let selected: Record<string, boolean> | undefined;
    chart.on("legendselectchanged", (event) => {
      selected = (event as { selected: Record<string, boolean> }).selected;
    });
    chart.dispatchAction({ type: "legendToggleSelect", name: "other" });
    expect(selected).toEqual({ amount: true, other: false });
    i.context.legendSelection = selected;
    const remapped = options(i);
    chart.setOption(remapped, { notMerge: true });
    expect(filled(chart, "#b33b32")).toHaveLength(0);
    expect(filled(chart, "#145da0")[0].shape.width).toBeGreaterThan(before);
    expect(translateBoxPlot(i)).toMatchObject({ domain: { value: [0, 18] } });
    expect(chart.getOption().series).toMatchObject([
      { id: "amount", name: "amount" },
      { id: "other", name: "other" },
    ]);
    chart.resize({ width: 900, height: 600 });
    expect(filled(chart, "#145da0")[0].shape.width).toBeGreaterThan(before * 1.5);
    expect(chart.getSvgDataURL()).toMatch(/^data:image\/svg\+xml/);
    chart.dispatchAction({ type: "legendToggleSelect", name: "other" });
    i.context.legendSelection = selected;
    chart.setOption(options(i), { notMerge: true });
    expect(filled(chart, "#b33b32")).toHaveLength(2);
    expect(chart.getOption().legend).toMatchObject([
      { data: [{ name: "amount" }, { name: "other" }] },
    ]);
  });
});

it("renders constant raw-value ticks, empty and clipped recovery, zero-width boxes and propagates engine errors through lifecycle mount", () => {
  const i = input();
  i.context.legendSelection = { other: false };
  i.snapshot.rows = i.snapshot.rows.slice(0, 1);
  i.snapshot.rows[0].values.amount = 5.5;
  engine(i, (chart, option) => {
    const rect = filled(chart, "#145da0")[0];
    expect(rect.shape.height).toBe(0);
    expect(rect.shape.y).toBe(Math.round(pixel(chart, 0, 0.5)[1]));
    expect(filled(chart, "#ae1234")).toHaveLength(0);
    expect(chart.renderToSVGString()).toContain("axis:5.5");
    expect(chart.renderToSVGString()).not.toContain("axis:0.5");
    expect((option.yAxis as any).axisPointer.label.formatter({ value: 0.5 })).toBe(
      "cross:5.5",
    );
    expect((option.tooltip as any).formatter({ axisValue: 0 })).toContain(
      "Median: number:5.5",
    );
    i.style.axes.number.min = 6;
    chart.setOption(options(i), { notMerge: true });
    expect(filled(chart, "#145da0")).toHaveLength(0);
    expect(chart.renderToSVGString()).not.toContain("axis:0");
    i.style.axes.number.max = 8;
    chart.setOption(options(i), { notMerge: true });
    expect(chart.renderToSVGString()).toContain("axis:6");
    const outside = filled(chart, "#145da0")[0];
    expect(outside.shape.y).toBeGreaterThan(pixel(chart, 0, 6)[1]);
    delete i.style.axes.number.min;
    delete i.style.axes.number.max;
    i.snapshot.rows = [];
    chart.setOption(options(i), { notMerge: true });
    expect(filled(chart, "#145da0")).toHaveLength(0);
    expect(chart.renderToSVGString()).not.toMatch(/axis:[01]</);
  });
  const tiny = input();
  tiny.context.viewport.width = 1;
  tiny.style.application.padding = { top: 0, right: 0, bottom: 0, left: 0 };
  const tinyOptions = options(tiny);
  (tinyOptions.grid as any).containLabel = false;
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 1,
    height: 500,
  });
  try {
    chart.setOption(tinyOptions);
    expect(filled(chart, "#145da0").every((r) => r.shape.width === 0)).toBe(true);
  } finally {
    chart.dispose();
  }
  const broken = input();
  const brokenOption = options(broken);
  const series = (brokenOption.series as CustomSeriesOption[])[0];
  const original = series.renderItem!;
  series.renderItem = (params, api) =>
    original(params, { ...api, coord: () => [Number.NaN, 1] });
  const actual = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...broken.context.viewport,
  });
  vi.mocked(echarts.init).mockReturnValueOnce(actual);
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: 600 },
    clientHeight: { value: 500 },
  });
  const lifecycle = createChartLifecycle(container);
  try {
    expect(() => lifecycle.mount({ revision: 1, options: brokenOption })).toThrow(
      /Nonfinite Box Plot renderer geometry/,
    );
  } finally {
    lifecycle.dispose();
    if (!actual.isDisposed()) actual.dispose();
  }
});
