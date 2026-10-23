import { graphic } from "echarts";
import { expect, it, vi } from "vitest";
import * as totals from "../../../src/components/General/Table/Chart/compatibility/waterfallTotals";
import { projectWaterfall } from "../../../src/components/General/Table/Chart/echarts/waterfall";
import { bars, engine, projected, waterfallInput } from "./waterfall.fixtures";

it("computes the immutable full prefix once across repeated navigation and pointer projections", () => {
  const spy = vi.spyOn(totals, "projectWaterfallTotals");
  const result = projected(waterfallInput());
  const options = result.projectNavigationWindow!(result.options, {
    dataZoom: [{ id: "openbb-navigator", start: 40, end: 100 }],
  });
  engine(options, () => result.projectPointer!(options));
  result.projectNavigationWindow!(result.options, {
    dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }],
  });
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});

it.each([
  { values: [] },
  { values: [null] },
  { values: [0] },
  { values: [2] },
])("handles empty, missing, zero and singleton input $values in the real engine", ({
  values,
}) => {
  const input = waterfallInput(values);
  engine(projected(input).options, (chart) =>
    expect(bars(chart)).toHaveLength(values[0] === 2 ? 1 : 0),
  );
});

it("renders source-ordered signed floating bars, no zero/missing glyph, and breaks both missing edges", () => {
  const input = waterfallInput();
  engine(projected(input).options, (chart) => {
    const rects = bars(chart);
    expect(rects).toHaveLength(3);
    const pixel = (i: number, value: number) =>
      chart.convertToPixel({ gridIndex: 0 }, [i, value]) as number[];
    for (const [slot, index, start, end] of [
      [0, 0, 0, 10],
      [1, 1, 10, 7],
      [2, 4, 7, 9],
    ]) {
      const shape = rects[slot].shape;
      expect(shape.y).toBeCloseTo(
        Math.min(pixel(index, start)[1], pixel(index, end)[1]),
      );
      expect(shape.height).toBeCloseTo(
        Math.abs(pixel(index, end)[1] - pixel(index, start)[1]),
      );
    }
    const connectors = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((e) => e instanceof graphic.Line && e.style.stroke === "#919191");
    expect(connectors).toHaveLength(2);
  });
});
it.each([
  [
    [2, -1],
    ["positive", "negative"],
  ],
  [[-2, -1], []],
  [[0], ["positive", "negative"]],
  [[2], ["positive", "negative"]],
])("retains original nonnegative-domain legend predicate %j", (values, names) => {
  const input = waterfallInput(values as number[]);
  input.appearance.application.legend.enabled = true;
  const options: any = projected(input).options;
  expect(options.legend.selectedMode).toBe(false);
  expect(options.legend.data.map((d: any) => d.name)).toEqual(names);
  engine(options, (chart) => expect(chart.renderToSVGString()).toContain("<svg"));
});
it("renders the retained five FMP movements to independently known endpoints", () => {
  // Captured AAPL FY2026 Q3 movements; browser verification checks raw FMP provenance.
  const values = [109417000000, -54647000000, -19075000000, 572000000, -6478000000];
  const input = waterfallInput(values);
  const data: any = projected(input).options.series;
  expect(data[0].data.map((d: any) => d.value.slice(1, 3))).toEqual([
    [0, 109417000000],
    [109417000000, 54770000000],
    [54770000000, 35695000000],
    [35695000000, 36267000000],
    [36267000000, 29789000000],
  ]);
  engine(projected(input).options, (chart) => expect(bars(chart)).toHaveLength(5));
});
it("rejects absent observations, extra effective fields, and missing aggregation witnesses", () => {
  const input = waterfallInput();
  delete input.snapshot.rows[0].values.revenue;
  expect(projectWaterfall(input).status).toBe("invalid");
  const extra = waterfallInput();
  extra.snapshot.selectedColumnIds.push("costs");
  expect(projectWaterfall(extra).status).toBe("unsupported");
  const grouped = waterfallInput();
  grouped.snapshot.sourceMode = "grouped";
  expect(projectWaterfall(grouped).status).toBe("unsupported");
  grouped.context.setupProjection = { kind: "ordinary-aggregate", aggFunc: "sum" };
  expect(projectWaterfall(grouped).status).toBe("supported");
});
it("supports a genuinely unbound empty selection without fabricated movement series or pointer state", () => {
  const input = waterfallInput();
  const empty = {
    ...input,
    fieldId: undefined,
    snapshot: {
      ...input.snapshot,
      selectedColumnIds: ["period"],
      columns: input.snapshot.columns.filter((column) => column.role === "category"),
      rows: input.snapshot.rows.map((row) => ({ ...row, values: {} })),
    },
  };
  const result = projectWaterfall(empty);
  expect(result.status, JSON.stringify(result)).toBe("supported");
  if (result.status !== "supported") return;
  expect(result.options.series).toEqual([]);
  expect(result.projectPointer?.(result.options)).toBeUndefined();
  expect(result.projectNavigationWindow).toBeUndefined();
  engine(result.options, (chart) => expect(bars(chart)).toHaveLength(0));
  expect(projectWaterfall({ ...empty, fieldId: "revenue" }).status).toBe("unsupported");
  expect(projectWaterfall({ ...input, fieldId: undefined }).status).toBe("unsupported");
});
it.each([
  "number",
  "time",
])("uses raw %s category coordinates without changing movement order", (type) => {
  const input = waterfallInput([10, -3, 2]);
  input.appearance.application.axes.category.fields.type = type;
  input.snapshot.rows.forEach((row, index) => {
    row.category =
      type === "number"
        ? [20, 5, 10][index]
        : ["2026-10-20", "2026-10-05", "2026-10-10"][index];
  });
  const result = projected(input);
  const values = (result.options.series as any)[0].data;
  expect(values.map((d: any) => d.value[0])).toEqual(
    input.snapshot.rows.map((row) =>
      type === "number" ? row.category : new Date(row.category).getTime(),
    ),
  );
  expect(values.map((d: any) => d.value[2])).toEqual([10, 7, 9]);
  engine(result.options, (chart) => {
    expect(bars(chart)).toHaveLength(3);
    expect(bars(chart)[0].shape.x).toBeGreaterThan(bars(chart)[1].shape.x);
  });
});
it("retains configured outlines, independent connector paint, raw labels and zero stroke extent", () => {
  const input = waterfallInput([10, -3, 0]);
  const positive = input.appearance.series.item.positive;
  positive.strokeWidth = 4;
  positive.strokeOpacity = 0.3;
  positive.fillOpacity = 0.6;
  positive.lineDash = [3, 2];
  positive.lineDashOffset = 1;
  positive.label.enabled = true;
  input.appearance.series.line.strokeWidth = 3;
  input.appearance.series.line.strokeOpacity = 0.4;
  input.appearance.series.line.lineDash = [4, 2];
  input.appearance.series.line.lineDashOffset = 2;
  input.miniChartEnabled = true;
  engine(projected(input).options, (chart) => {
    const rects = bars(chart);
    expect(rects).toHaveLength(6);
    expect(rects[0].style).toMatchObject({
      lineWidth: 4,
      strokeOpacity: 0.3,
      fillOpacity: 0.6,
      lineDash: [3, 2],
      lineDashOffset: 1,
    });
    expect(rects[2].shape.height).toBe(4);
    const svg = chart.renderToSVGString();
    expect(svg.match(/label:10/g)).toHaveLength(1);
    expect(svg).toContain("label:0");
    const line = chart
      .getZr()
      .storage.getDisplayList(true)
      .find((e) => e instanceof graphic.Line && e.style.stroke === "#919191")!;
    expect(line.style).toMatchObject({
      lineWidth: 3,
      strokeOpacity: 0.4,
      lineDash: [4, 2],
      lineDashOffset: 2,
    });
  });
});
