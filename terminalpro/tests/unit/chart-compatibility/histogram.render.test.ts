import { graphic, init, type CustomSeriesOption, type EChartsOption, type EChartsType } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import type { HistogramDatum, HistogramMappingInput } from "../../../src/components/General/Table/Chart/echarts/histogramTypes";
import { createHistogramRenderer } from "../../../src/components/General/Table/Chart/echarts/histogramSeries";
import * as histogramBins from "../../../src/components/General/Table/Chart/compatibility/histogramBins";
import { histogramData, histogramInput, histogramOptions } from "./histogram.fixtures";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D);
});
function render(input: HistogramMappingInput, check: (chart: EChartsType, rects: InstanceType<typeof graphic.Rect>[], svg: string) => void,
  configure?: (options: EChartsOption) => void) {
  const chart = init(null, undefined, { renderer: "svg", ssr: true, ...input.context.viewport });
  try {
    const options = histogramOptions(input);
    configure?.(options);
    chart.setOption(options);
    const rects = chart.getZr().storage.getDisplayList().filter(
      (el): el is InstanceType<typeof graphic.Rect> => el instanceof graphic.Rect && el.style.fill === "rgba(20,93,160,0.6)",
    );
    const svg = chart.renderToSVGString();
    expect(svg).not.toMatch(/NaN|Infinity/);
    check(chart, rects, svg);
  } finally { chart.dispose(); }
}
function pixel(chart: EChartsType, x: number, y: number): number[] {
  const result: unknown = chart.convertToPixel({ gridIndex: 0 }, [x, y]);
  if (!Array.isArray(result) || !result.every(v => typeof v === "number")) throw Error("Expected numeric point");
  return result;
}
it("renders unequal contiguous numeric widths and count heights at independent expected endpoints", () => {
  const input = histogramInput();
  Object.assign(input.style.axes.x, { min: 0, max: 10 });
  Object.assign(input.style.axes.y, { min: 0, max: 4 });
  render(input, (chart, rects, svg) => {
    expect(rects).toHaveLength(3);
    const [left, bottom] = pixel(chart, 0, 0), [right, top] = pixel(chart, 10, 4);
    const width = right - left, height = bottom - top;
    const expected = [[0, 2, 2], [2, 5, 1], [5, 10, 3]];
    rects.forEach((rect, i) => {
      const [lower, upper, count] = expected[i];
      expect(rect.shape.x).toBeCloseTo(left + lower / 10 * width, 5);
      expect(rect.shape.width).toBeCloseTo((upper - lower) / 10 * width, 5);
      expect(rect.shape.y).toBeCloseTo(bottom - count / 4 * height, 5);
      expect(rect.shape.height).toBeCloseTo(count / 4 * height, 5);
      const label = rect.getTextContent();
      expect(label?.style.text).toBe(`label:${count}`);
      expect(label?.style.fill).toBe("#123456");
      expect(label?.style.opacity ?? 1).toBe(1);
      const bounds = label!.getBoundingRect().clone();
      bounds.applyTransform(label!.getComputedTransform());
      expect(bounds.x + bounds.width / 2).toBeCloseTo(rect.shape.x + rect.shape.width / 2, 5);
      expect(bounds.y + bounds.height / 2).toBeCloseTo(rect.shape.y + rect.shape.height / 2, 5);
    });
    expect(rects[0].shape.x + rects[0].shape.width).toBeCloseTo(rects[1].shape.x, 5);
    expect(rects[0].style.stroke).toBe("rgba(18,52,86,0.4)");
    expect(rects[0].style.lineWidth).toBe(3);
    expect(rects[0].style.lineDash).toEqual([5, 2]);
    expect(rects[0].style.shadowBlur).toBe(4);
    expect(svg).toContain("Frequency");
    expect(svg).toContain("fill-opacity=\"0.6\"");
    expect(svg).toContain("stroke-opacity=\"0.4\"");
  });
});
it("retains the full rectangle and label anchor while native plot clipping trims bounds", () => {
  const input = histogramInput();
  Object.assign(input.style.axes.x, { min: 1, max: 9 });
  Object.assign(input.style.axes.y, { min: 0, max: 2 });
  render(input, (chart, rects, svg) => {
    expect(rects).toHaveLength(3);
    expect(rects[0].shape.x).toBeLessThan(pixel(chart, 1, 0)[0]);
    expect(rects[2].shape.x + rects[2].shape.width).toBeGreaterThan(pixel(chart, 9, 0)[0]);
    expect(rects[2].shape.y).toBeLessThan(pixel(chart, 1, 2)[1]);
    const label = rects[2].getTextContent()!;
    const b = label.getBoundingRect().clone();
    b.applyTransform(label.getComputedTransform());
    expect(b.y + b.height / 2).toBeCloseTo((pixel(chart, 5, 3)[1] + pixel(chart, 5, 0)[1]) / 2, 5);
    expect(svg).toContain("clip-path=");
    expect(svg).toContain("<clipPath");
  });
});
it.each(["x", "y"] as const)("renders %s extension, endpoint equality, exclusion and restoration", id => {
  const domain = id === "x" ? [0, 10] : [0, 3];
  for (const bounds of [{ min: -10 }, { max: 20 }, { min: domain[0] }, { max: domain[1] }, { min: domain[1] }, { max: domain[0] }]) {
    const input = histogramInput();
    Object.assign(input.style.axes[id], bounds);
    render(input, (chart, rects) => {
      expect(rects.length).toBeGreaterThan(0);
      const axis = chart.getOption()[id === "x" ? "xAxis" : "yAxis"] as { min: number; max: number }[];
      if (bounds.min !== undefined) expect(axis[0].min).toBe(bounds.min);
      if (bounds.max !== undefined) expect(axis[0].max).toBe(bounds.max);
    });
  }
  for (const bounds of [{ min: domain[1] + 1 }, { max: domain[0] - 1 }]) {
    const input = histogramInput();
    Object.assign(input.style.axes[id], bounds);
    render(input, (chart, rects) => {
      expect(rects).toHaveLength(0);
      const axis = chart.getOption()[id === "x" ? "xAxis" : "yAxis"] as { show: boolean }[];
      expect(axis[0].show).toBe(false);
    });
    delete input.style.axes[id].min;
    delete input.style.axes[id].max;
    render(input, (_chart, rects) => expect(rects).toHaveLength(3));
  }
});
it("renders top/right axes, gapped bins, hidden/restored legend and empty selection recovery", () => {
  const input = histogramInput([1, 7]);
  input.binning.bins = [[0, 2], [5, 10]];
  input.style.axes.x.appearance.fields.position = "top";
  input.style.axes.y.appearance.fields.position = "right";
  render(input, (chart, rects, svg) => {
    expect(rects).toHaveLength(2);
    expect(rects[0].shape.x + rects[0].shape.width).toBeLessThan(rects[1].shape.x);
    expect(chart.getOption().xAxis).toMatchObject([{ position: "top" }]);
    expect(chart.getOption().yAxis).toMatchObject([{ position: "right" }]);
    expect(svg).toContain("Frequency");
  });
  input.context.legendSelection = { amount: false };
  render(input, (_chart, rects, svg) => { expect(rects).toHaveLength(0); expect(svg).toContain("Frequency"); });
  input.context.legendSelection.amount = true;
  render(input, (_chart, rects) => expect(rects).toHaveLength(2));
  input.snapshot.selectedColumnIds = ["period"];
  render(input, (_chart, rects) => expect(rects).toHaveLength(0));
  input.snapshot.selectedColumnIds.push("amount");
  render(input, (_chart, rects) => expect(rects).toHaveLength(2));
});
it("applies saved colors independently and does not fade labels with the fill", () => {
  const input = histogramInput();
  input.style.series.fill = "#ff0000";
  input.style.series.stroke = "#00ff00";
  input.style.series.fillOpacity = 0;
  render(input, (chart, _rects, svg) => {
    const rect = chart.getZr().storage.getDisplayList().find(el => el instanceof graphic.Rect && el.style.fill === "rgba(255,0,0,0)");
    expect(rect).toBeDefined();
    expect(svg).toContain('stroke="rgb(0,255,0)"');
    expect(svg).toContain("label:3");
    if (!(rect instanceof graphic.Rect)) throw Error("missing rectangle");
    expect(rect.getTextContent()?.style.opacity ?? 1).toBe(1);
  });
});
it("builds an overview renderer from retained resolved data with identical geometry and no labels", () => {
  const input = histogramInput();
  const retained = histogramData(input);
  let shapes: object[] = [];
  render(input, (_chart, rects) => {
    shapes = rects.map(rect => ({ ...rect.shape }));
    expect(rects.every(rect => rect.getTextContent())).toBe(true);
  });
  render(input, (_chart, rects, svg) => {
    expect(rects.map(rect => rect.shape)).toEqual(shapes);
    expect(rects.every(rect => !rect.getTextContent())).toBe(true);
    expect(svg).not.toContain("label:");
  }, options => {
    const series = (options.series as CustomSeriesOption[])[0];
    series.data = retained;
    series.renderItem = createHistogramRenderer(input, retained, false);
    expect(series.data).toBe(retained);
    expect(retained.map(d => d.value)).toEqual([[0, 2, 2], [2, 5, 1], [5, 10, 3]]);
  });
});
it("renders empty outer intervals in the X extent and H1 repaired repeated counts", () => {
  const input = histogramInput([3, 4]);
  render(input, (chart, rects) => {
    expect(rects).toHaveLength(1);
    const left = pixel(chart, 0, 0)[0], right = pixel(chart, 10, 0)[0];
    expect(rects[0].shape.x).toBeCloseTo(left + (right - left) * 0.2, 5);
    expect(rects[0].shape.width).toBeCloseTo((right - left) * 0.3, 5);
  });
  input.snapshot.rows = histogramInput([4, 4]).snapshot.rows;
  input.binning = { binCount: 2 };
  render(input, (chart, rects) => {
    expect(rects).toHaveLength(1);
    expect(rects[0].shape.x).toBeCloseTo(pixel(chart, 4, 0)[0], 5);
    expect(rects[0].shape.width).toBeCloseTo(pixel(chart, 5, 0)[0] - pixel(chart, 4, 0)[0], 5);
    expect(rects[0].getTextContent()?.style.text).toBe("label:2");
  });
});
it("retains histogram tooltip data and appearance effects in the actual engine", () => {
  const input = histogramInput();
  input.style.application.background.fill = "#101010";
  input.style.application.title.text = "Histogram title";
  input.style.application.subtitle.text = "Quarterly revenue";
  input.style.application.legend.position = "right";
  input.style.axes.x.appearance.gridStyles = [
    { stroke: "#abcdef", lineDash: [2, 3] }, { stroke: "#fedcba", lineDash: [6, 1] },
  ];
  render(input, (chart, rects, svg) => {
    expect(rects).toHaveLength(3);
    expect(svg).toContain("Histogram title");
    expect(svg).toContain("Quarterly revenue");
    expect(svg).toContain("#101010");
    expect(svg).toContain("#abcdef");
    expect(svg).toContain("#fedcba");
    expect(svg).toContain('stroke-dasharray="2,3"');
    expect(chart.getOption().xAxis).toMatchObject([{ splitLine: { show: false } }]);
    const tooltip = chart.getOption().tooltip as { formatter: (params: unknown) => string }[];
    const series = chart.getOption().series as CustomSeriesOption[];
    expect(tooltip[0].formatter({ data: (series[0].data as HistogramDatum[])[0] })).toBe(
      "Revenue &lt;USD&gt;: axis:0 - axis:2<br/>Frequency: axis:2",
    );
    expect(chart.getOption().legend).toMatchObject([{ orient: "vertical" }]);
  });
});
it("restores initially hidden full data through native legend actions on the same chart without recalculation", () => {
  const input = histogramInput();
  input.context.legendSelection = { amount: false };
  const binning = vi.spyOn(histogramBins, "calculateHistogramBins");
  let renderCalls = 0;
  let retained: CustomSeriesOption["data"];
  try {
    render(input, (chart, rects, svg) => {
      const visibleRectangles = () => chart.getZr().storage.getDisplayList().filter(
        el => el instanceof graphic.Rect && el.style.fill === "rgba(20,93,160,0.6)",
      );
      expect(rects).toHaveLength(0);
      expect(renderCalls).toBe(0);
      expect(svg).toContain("Frequency");
      chart.dispatchAction({ type: "legendSelect", name: "amount" });
      expect(chart.renderToSVGString()).toContain("label:3");
      expect(visibleRectangles()).toHaveLength(3);
      expect(renderCalls).toBe(3);
      expect((retained as HistogramDatum[]).map(d => d.value)).toEqual([[0, 2, 2], [2, 5, 1], [5, 10, 3]]);
      const current = chart.getOption().series as CustomSeriesOption[];
      expect(current[0].data).toEqual(retained);
      chart.dispatchAction({ type: "legendUnSelect", name: "amount" });
      expect(chart.renderToSVGString()).not.toContain("label:");
      expect(visibleRectangles()).toHaveLength(0);
      expect(renderCalls).toBe(3);
      chart.dispatchAction({ type: "legendSelect", name: "amount" });
      expect(chart.renderToSVGString()).toContain("label:3");
      expect(visibleRectangles()).toHaveLength(3);
      expect(renderCalls).toBe(6);
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
      expect(binning).toHaveBeenCalledTimes(1);
    }, options => {
      const series = (options.series as CustomSeriesOption[])[0];
      retained = series.data;
      const renderer = series.renderItem;
      if (!renderer) throw Error("Expected native custom renderer");
      series.renderItem = (params, api) => { renderCalls++; return renderer(params, api); };
    });
  } finally { binning.mockRestore(); }
});

it("uses rounded native ticks and rectangle endpoints for the reference-sized revenue distribution", () => {
  const frequencies = [2, 7, 4, 1, 9, 8, 2, 4, 2, 0, 1];
  const input = histogramInput(frequencies.flatMap((count, i) => Array(count).fill((45 + i * 10) * 1e9)));
  input.binning = { bins: frequencies.map((_, i) => [(40 + i * 10) * 1e9, (50 + i * 10) * 1e9]) };
  input.context.viewport = { width: 359, height: 284 };
  input.context.display.numericAxis = v => v >= 1e9 ? `${v / 1e9} B` : String(v);
  input.style.application.title.enabled = input.style.application.subtitle.enabled = false;
  input.style.application.legend.enabled = false;
  input.style.application.padding = { top: 20, right: 20, bottom: 20, left: 20 };
  for (const axis of Object.values(input.style.axes)) {
    axis.appearance.title.enabled = false;
    axis.appearance.labels.rotation = 0;
  }
  render(input, (chart, rects) => {
    const model = (chart as any).getModel();
    expect(model.getComponent("xAxis").axis.scale.getTicks().map((tick: any) => tick.value))
      .toEqual([0, 50e9, 100e9, 150e9]);
    expect(model.getComponent("yAxis").axis.scale.getTicks().map((tick: any) => tick.value))
      .toEqual([0, 5, 10]);
    expect(rects).toHaveLength(10);
    const [left, bottom] = pixel(chart, 0, 0), [right, top] = pixel(chart, 150e9, 10);
    const occupied = frequencies.flatMap((count, index) => count ? [{ count, index }] : []);
    rects.forEach((rect, i) => {
      expect(rect.shape.x).toBeCloseTo(left + (40 + occupied[i].index * 10) / 150 * (right - left));
      expect(rect.shape.width).toBeCloseTo((right - left) / 15);
      expect(rect.shape.height).toBeCloseTo(occupied[i].count / 10 * (bottom - top));
    });
  });
});
