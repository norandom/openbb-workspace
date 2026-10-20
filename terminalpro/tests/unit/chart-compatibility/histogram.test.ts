import type { CustomSeriesOption } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translateHistogram } from "../../../src/components/General/Table/Chart/echarts/histogram";
import { histogramTooltip } from "../../../src/components/General/Table/Chart/echarts/histogramTooltip";
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
