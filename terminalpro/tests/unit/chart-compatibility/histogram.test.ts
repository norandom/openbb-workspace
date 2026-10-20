import type { CustomSeriesOption } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translateHistogram } from "../../../src/components/General/Table/Chart/echarts/histogram";
import { histogramTooltip } from "../../../src/components/General/Table/Chart/echarts/histogramTooltip";
import { histogramAxisPixels } from "../../../src/components/General/Table/Chart/echarts/histogramLayout";
import { histogramNiceExtent } from "../../../src/components/General/Table/Chart/echarts/histogramNiceExtent";
import * as histogramBins from "../../../src/components/General/Table/Chart/compatibility/histogramBins";
import type { CartesianTranslationResult } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import { histogramData, histogramInput, histogramOptions } from "./histogram.fixtures";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D);
});

it("exposes full calculated intervals and validated projection separately from resolved axis bounds with one H1 calculation", () => {
  const input = histogramInput([3, 4]);
  Object.assign(input.style.axes.x, { min: -2, max: 12 });
  input.style.axes.y.max = 8;
  const calculate = vi.spyOn(histogramBins, "calculateHistogramBins");
  try {
    const result = translateHistogram(input);
    const compatible: CartesianTranslationResult = result;
    expect(compatible.status).toBe("supported");
    if (result.status !== "supported") throw Error("Expected histogram projection metadata");
    expect(result.projection.calculation).toEqual({
      status: "resolved", bins: [[0, 2], [2, 5], [5, 10]],
      groups: [{ intervalIndex: 1, frequency: 2, observationIndices: [0, 1] }],
      skippedIndices: [], repair: "none",
    });
    expect(result.domain).toEqual({ x: [-2, 12], y: [0, 8], emptyAxes: [] });
    expect(result.projection.input.snapshot).toEqual(input.snapshot);
    expect(result.projection.input.snapshot).not.toBe(input.snapshot);
    expect(result.projection.field).toBe(result.projection.input.snapshot.columns[2]);
    expect(result.projection.field).not.toBe(input.snapshot.columns[2]);
    input.snapshot.rows[0].values.amount = 100;
    expect(result.projection.input.snapshot.rows[0].values.amount).toBe(3);
    expect(calculate).toHaveBeenCalledTimes(1);
  } finally { calculate.mockRestore(); }
});

it("counts the first selected numeric field in raw units and retains independent metadata", () => {
  const input = histogramInput();
  const before = JSON.stringify(input);
  const data = histogramData(input);
  expect(data.map(d => d.value)).toEqual([[0, 2, 2], [2, 5, 1], [5, 10, 3]]);
  expect(data[0].metadata).toEqual({ field: input.snapshot.columns[2], intervalIndex: 0,
    observationIndices: [0, 1], rowIds: ["r0", "r1"] });
  expect(data[0].metadata.field).not.toBe(input.snapshot.columns[2]);
  expect(JSON.stringify(input)).toBe(before);
  input.snapshot.selectedColumnIds = ["period", "other", "amount"];
  expect(histogramData(input).map(d => d.value)).toEqual([]);
});
it("keeps empty outer bins in the automatic domain and sorts drawn intervals only", () => {
  const input = histogramInput([3, 4]);
  expect(histogramData(input).map(d => d.value)).toEqual([[2, 5, 2]]);
  const x = histogramOptions(input).xAxis;
  expect(x).toMatchObject({ min: 0, max: 10 });
  input.binning.bins = [[0, 1], [6, 9], [2, 4]];
  input.snapshot.rows = histogramInput([7, 3]).snapshot.rows;
  expect(histogramData(input).map(d => [d.value, d.metadata.intervalIndex])).toEqual([
    [[2, 4, 1], 2], [[6, 9, 1], 1],
  ]);
  expect(histogramOptions(input).xAxis).toMatchObject({ min: 0, max: 4 });
  input.binning.bins = [[5, 9], [0, 1]];
  expect(translateHistogram(input).status).toBe("invalid");
});
it("preserves signed/repeated H1 membership and the equal integer repair", () => {
  const input = histogramInput([-2, -2, 0, 2, null]);
  input.binning = { bins: [[-3, -1], [0, 1], [1, 2]] };
  expect(histogramData(input).map(d => d.value)).toEqual([[-3, -1, 2], [0, 1, 1], [1, 2, 1]]);
  input.binning = { binCount: 2 };
  input.snapshot.rows = histogramInput([4, 4]).snapshot.rows;
  expect(histogramData(input).map(d => d.value)).toEqual([[4, 5, 2]]);
});
it("retains hidden legend identity and complete resolved data without changing source", () => {
  const input = histogramInput();
  const options = histogramOptions(input);
  expect(options.series).toMatchObject([{ id: JSON.stringify(["histogram", "amount"]), name: "amount",
    type: "custom", coordinateSystem: "cartesian2d", clip: true, animation: false,
    dimensions: ["lower", "upper", "frequency"], encode: { x: [0, 1], y: 2 } }]);
  const legend = options.legend as { formatter: (s: string) => string };
  expect(legend.formatter("amount")).toBe("Frequency");
  input.context.legendSelection = { amount: false };
  expect(histogramData(input).map(d => d.value)).toEqual([[0, 2, 2], [2, 5, 1], [5, 10, 3]]);
  expect(histogramOptions(input).legend).toMatchObject({ data: [{ name: "amount" }], selected: { amount: false } });
  input.context.legendSelection.amount = true;
  expect(histogramData(input)).toHaveLength(3);
});
it("uses escaped numeric range/Frequency item tooltips while saved shared mode stays intact", () => {
  const input = histogramInput();
  input.context.display.numericAxis = v => `<${v}&>`;
  input.context.display.tooltipNumber = () => { throw Error("inactive formatter"); };
  const tooltip = histogramTooltip(input);
  expect(tooltip.trigger).toBe("item");
  expect(tooltip.formatter({ data: histogramData(input)[0] })).toBe(
    "Revenue &lt;USD&gt;: &lt;0&amp;&gt; - &lt;2&amp;&gt;<br/>Frequency: &lt;2&amp;&gt;",
  );
  input.snapshot.columns[2].label = "";
  expect(tooltip.formatter({ data: histogramData(input)[0] })).toContain("amount:");
  input.style.application.tooltip.enabled = false;
  expect(histogramOptions(input).tooltip).toMatchObject({ show: false, trigger: "item" });
  expect(input.style.application.tooltip.mode).toBe("shared");
});
it("supports empty selection and empty viewport, validates bin options and recovers", () => {
  const input = histogramInput();
  input.snapshot.selectedColumnIds = ["period"];
  expect(histogramData(input)).toEqual([]);
  input.binning.binCount = -1;
  const invalid = translateHistogram(input);
  expect(invalid).toMatchObject({ status: "invalid", diagnostics: [{ path: ["binCount"] }] });
  delete input.binning.binCount;
  input.snapshot.selectedColumnIds.push("amount");
  input.context.viewport.width = 0;
  expect(histogramData(input)).toEqual([]);
  input.context.viewport.width = 800;
  expect(histogramData(input)).toHaveLength(3);
});
describe("admission", () => {
  it.each([
    ["negative size", (i: ReturnType<typeof histogramInput>) => { i.style.series.labels.size = -1; }],
    ["inactive shadow", (i: ReturnType<typeof histogramInput>) => { i.style.series.shadow.enabled = false; i.style.series.shadow.blur = NaN; }],
    ["opacity", (i: ReturnType<typeof histogramInput>) => { i.style.series.fillOpacity = 2; }],
    ["dash", (i: ReturnType<typeof histogramInput>) => { i.style.series.lineDash = [-1]; }],
    ["palette", (i: ReturnType<typeof histogramInput>) => { i.style.application.palette.strokes = []; }],
    ["sparse inactive palette", (i: ReturnType<typeof histogramInput>) => { i.style.application.palette.strokes.length = 3; }],
    ["sparse axis dash", (i: ReturnType<typeof histogramInput>) => { Object.assign(i.style.axes.x.appearance.gridStyles[0].lineDash, { length: 3 }); }],
    ["precision", (i: ReturnType<typeof histogramInput>) => { i.style.common.precision = 21; }],
    ["viewport", (i: ReturnType<typeof histogramInput>) => { i.context.viewport.height = Infinity; }],
    ["axis direction", (i: ReturnType<typeof histogramInput>) => { i.style.axes.x.appearance.fields.position = "left"; }],
    ["bounds", (i: ReturnType<typeof histogramInput>) => { Object.assign(i.style.axes.y, { min: 2, max: 2 }); }],
    ["callback", (i: ReturnType<typeof histogramInput>) => { Object.assign(i.context.display, { category: "bad" }); }],
    ["legend", (i: ReturnType<typeof histogramInput>) => { Object.assign(i.context, { legendSelection: { amount: 1 } }); }],
    ["color", (i: ReturnType<typeof histogramInput>) => { Object.assign(i.style.series, { fill: 1 }); }],
  ])("rejects malformed %s", (_label, mutate) => {
    const input = histogramInput();
    mutate(input);
    expect(translateHistogram(input).status).toBe("invalid");
  });
  it("distinguishes unsupported axis types and safely catches getters/callback projections", () => {
    const input = histogramInput();
    input.style.axes.x.appearance.fields.type = "log";
    expect(translateHistogram(input).status).toBe("unsupported");
    Object.defineProperty(input.snapshot, "rows", { get() { throw Error("unsafe"); } });
    expect(translateHistogram(input).status).toBe("invalid");
    const throwing = histogramInput();
    throwing.context.display.seriesLabel = () => { throw Error("unsafe"); };
    expect(translateHistogram(throwing).status).toBe("invalid");
  });
  it("preserves H1 paths without invoking binning accessors", () => {
    const input = histogramInput();
    const getter = vi.fn(() => { throw Error("unsafe"); });
    Object.defineProperty(input.binning, "binCount", { get: getter, enumerable: true });
    expect(translateHistogram(input)).toMatchObject({ status: "invalid", diagnostics: [{ path: ["binCount"] }] });
    expect(getter).not.toHaveBeenCalled();
  });
});
it("never returns a category bar or statistical transform", () => {
  const options = histogramOptions(histogramInput());
  expect(options.dataset).toBeUndefined();
  expect((options.series as CustomSeriesOption[])[0].type).toBe("custom");
});

it("rounds the authentic revenue distribution by usable pixels without changing calculated bins", () => {
  const billions = [46.852, 78.351, 52.896, 45.408, 52.579, 88.293, 61.137, 53.265,
    62.9, 84.31, 58.015, 53.809, 64.04, 91.819, 58.313, 59.685, 64.698, 111.439,
    89.584, 81.434, 83.36, 123.945, 97.278, 82.959, 90.146, 117.154, 94.836, 81.797,
    89.498, 119.575, 90.753, 85.777, 94.93, 124.3, 95.359, 94.036, 102.466, 143.756,
    111.184, 109.417];
  const input = histogramInput(billions.map(v => Math.round(v * 1e9)));
  input.binning = {};
  input.context.viewport = { width: 359, height: 284 };
  input.context.display.numericAxis = v => v >= 1e9 ? `${v / 1e9} B` : String(v);
  input.style.application.title.enabled = input.style.application.subtitle.enabled = false;
  input.style.application.legend.enabled = false;
  input.style.application.padding = { top: 20, right: 20, bottom: 20, left: 20 };
  for (const axis of Object.values(input.style.axes)) {
    axis.appearance.title.enabled = false;
    axis.appearance.labels.rotation = 0;
  }
  const result = translateHistogram(input);
  if (result.status !== "supported") throw Error("Expected supported revenue histogram");
  expect(result.domain).toEqual({ x: [40e9, 150e9], y: [0, 9], emptyAxes: [] });
  expect(result.options.xAxis).toMatchObject({ min: 0, max: 150e9, interval: 50e9 });
  expect(result.options.yAxis).toMatchObject({ min: 0, max: 10, interval: 5 });
  expect(result.projection.calculation.bins).toHaveLength(11);
  expect(result.projection.calculation.groups.map(g => [g.intervalIndex, g.frequency])).toEqual([
    [0, 2], [1, 7], [2, 4], [3, 1], [4, 9], [5, 8], [6, 2], [7, 4], [8, 2], [10, 1],
  ]);
  input.context.viewport.width = 1000;
  expect(histogramOptions(input).xAxis).toMatchObject({ min: 40e9, max: 160e9, interval: 20e9 });
  input.context.viewport.width = 359;
  input.binning = { binCount: 4 };
  const four = translateHistogram(input);
  if (four.status !== "supported") throw Error("Expected four-bin numerical projection");
  expect(four.projection.calculation.bins).toEqual([
    [40e9, 64.587e9], [64.587e9, 89.174e9], [89.174e9, 113.761e9], [113.761e9, 143.756e9],
  ]);
  expect(four.projection.calculation.groups.map(g => g.frequency)).toEqual([12, 9, 14, 5]);
  expect(four.options.yAxis).toMatchObject({ min: 0, max: 15, interval: 5 });
});

it("keeps explicit sides exact while rounding signed and positive automatic extents", () => {
  const input = histogramInput([42, 149]);
  input.binning = { bins: [[41, 150]] };
  expect(histogramOptions(input).xAxis).toMatchObject({ min: 40, max: 160, interval: 20 });
  input.binning = { bins: [[-41, 149]] };
  expect(histogramOptions(input).xAxis).toMatchObject({ min: -50, max: 150, interval: 50 });
  Object.assign(input.style.axes.x, { min: -43, max: 153 });
  expect(histogramOptions(input).xAxis).toMatchObject({ min: -43, max: 153 });
  delete input.style.axes.x.max;
  expect(histogramOptions(input).xAxis).toMatchObject({ min: -43, max: 150 });
  input.style.axes.x.min = 200;
  expect(histogramOptions(input).xAxis).toMatchObject({ show: false, min: 0, max: 1 });
  delete input.style.axes.x.min;
  expect(histogramOptions(input).xAxis).toMatchObject({ show: true, min: -50, max: 150 });
});

it("budgets endpoint labels, rotation, ticks and titles without changing grid margins", () => {
  const input = histogramInput();
  input.context.viewport = { width: 359, height: 284 };
  input.context.display.numericAxis = String;
  const grid = { left: 20, right: 20, top: 20, bottom: 20 };
  const domain = { x: [40e9, 150e9] as const, y: [0, 9] as const, emptyAxes: [] };
  for (const axis of Object.values(input.style.axes)) {
    axis.appearance.title.enabled = false;
    axis.appearance.labels.padding = 8;
    axis.appearance.labels.rotation = 0;
    axis.appearance.ticks.length = 7;
  }
  const before = JSON.stringify(grid);
  // Provisional nice Y expands 9 to 10, so two glyphs consume twelve pixels.
  expect(histogramAxisPixels(input, grid, domain)).toEqual({ x: 292, y: 223 });
  input.style.axes.y.appearance.labels.rotation = 90;
  expect(histogramAxisPixels(input, grid, domain).x).toBeCloseTo(298);
  input.style.axes.x.appearance.labels.rotation = 90;
  expect(histogramAxisPixels(input, grid, domain).y).toBeLessThan(223);
  input.style.axes.y.appearance.title.enabled = true;
  expect(histogramAxisPixels(input, grid, domain).x).toBeLessThan(298);
  expect(JSON.stringify(grid)).toBe(before);
  expect(histogramAxisPixels(input, { ...grid, bottom: 100 }, domain).y)
    .toBeCloseTo(histogramAxisPixels(input, grid, domain).y - 80);
  input.context.viewport = { width: 0, height: 1 };
  expect(histogramAxisPixels(input, grid, domain)).toEqual({ x: 0, y: 0 });
});

it("falls back to validated extents for unusable budgets, subnormal steps and overflowing rounding", () => {
  for (const pixels of [0, -1, NaN, Infinity])
    expect(histogramNiceExtent(41, 149, pixels)).toEqual({ min: 41, max: 149 });
  expect(histogramNiceExtent(Number.MIN_VALUE, Number.MIN_VALUE * 2, 295))
    .toEqual({ min: Number.MIN_VALUE, max: Number.MIN_VALUE * 2 });
  expect(histogramNiceExtent(1.6e308, 1.79e308, 100)).toEqual({ min: 1.6e308, max: 1.79e308 });
  for (const [min, max] of [[-1e-300, 1e-300], [1e-20, 9e-20], [-149, -41]]) {
    const nice = histogramNiceExtent(min, max, 295);
    expect(Object.values(nice).every(Number.isFinite)).toBe(true);
    expect(nice.min).toBeLessThanOrEqual(min);
    expect(nice.max).toBeGreaterThanOrEqual(max);
    expect(nice.min).toBeLessThan(nice.max);
  }
  const input = histogramInput([1]);
  input.binning = { bins: [[0, 2]] };
  input.context.viewport = { width: 1, height: 1 };
  const options = histogramOptions(input);
  expect(options.xAxis).toMatchObject({ min: 0, max: 2 });
  expect(options.yAxis).toMatchObject({ min: 0, max: 1 });
  expect(options.xAxis).not.toHaveProperty("interval");
  expect(options.yAxis).not.toHaveProperty("interval");
});
