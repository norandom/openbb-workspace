import type { CustomSeriesOption } from "echarts";
import { expect, it, vi } from "vitest";
import * as summary from "../../../src/components/General/Table/Chart/compatibility/rangeSummary";
import { translateRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBar";
import { projectRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBarProjection";
import { rangeInput, rangeOptions } from "./rangeBar.fixtures";

it("groups typed category identity in encounter order and preserves selected field order, raw extrema and source IDs", () => {
  const i = rangeInput();
  i.snapshot.rows[0].category = 1;
  i.snapshot.rows[1].category = "1";
  i.snapshot.rows[3].category = 1;
  delete i.snapshot.rows[4].values.other;
  i.snapshot.selectedColumnIds = ["period", "other", "amount"];
  const original = structuredClone(i.snapshot);
  const r = projectRangeBar(i.snapshot, { other: false });
  expect(r.status).toBe("resolved");
  if (r.status !== "resolved") return;
  expect(r.projection.groups.map((g) => g.category)).toEqual([1, "1", "", "last"]);
  expect(
    r.projection.fields.map((f) => [f.descriptor.id, f.paletteIndex, f.enabled]),
  ).toEqual([
    ["other", 0, false],
    ["amount", 1, true],
  ]);
  expect(r.projection.fields[1].data[0]).toEqual({
    groupSlot: 0,
    count: 2,
    summary: { min: 2, max: 5 },
    sourceRowIds: ["a", "d"],
  });
  expect(r.projection.fields[0].data[3].summary).toBeNull();
  expect(r.projection.groups[0].rowIds).toEqual(["a", "d"]);
  expect(r.projection.dataExtent).toEqual([2, 10]);
  expect(i.snapshot).toEqual(original);
});

it("consumes normalized grouped aggregate observations once through R1 without rescaling USD or reaggregating", () => {
  const i = rangeInput();
  i.snapshot.sourceMode = "grouped";
  i.snapshot.rows = [
    {
      id: "sum-a",
      category: "FY2017",
      values: { amount: 45408000000, other: 8717000000 },
    },
    {
      id: "sum-b",
      category: "FY2017",
      values: { amount: 78351000000, other: 17891000000 },
    },
  ];
  const calculate = vi.spyOn(summary, "calculateRangeSummary");
  const r = projectRangeBar(i.snapshot);
  expect(calculate).toHaveBeenCalledTimes(2);
  expect(calculate.mock.calls[0][0]).toEqual([45408000000, 78351000000]);
  expect(r).toMatchObject({
    status: "resolved",
    projection: {
      dataExtent: [8717000000, 78351000000],
      fields: [
        { data: [{ summary: { min: 45408000000, max: 78351000000 } }] },
        { data: [{ summary: { min: 8717000000, max: 17891000000 } }] },
      ],
    },
  });
  calculate.mockRestore();
});

it("transports equal domains at midpoint while preserving unequal raw summaries, labels and tooltip endpoints", () => {
  const i = rangeInput();
  i.style.valueScale = { min: 5, max: 5, ticks: [5] };
  const result = translateRangeBar(i);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") return;
  expect(result.projection.dataExtent).toEqual([2, 14]);
  const options = result.options;
  expect(
    ((options.series as CustomSeriesOption[])[0].data as unknown[])[0],
  ).toMatchObject({
    value: [0, 0.5, 0.5, 0],
    metadata: { fieldId: "amount", groupSlot: 0, summary: { min: 2, max: 8 } },
  });
  const axis = options.yAxis as any;
  expect([axis.min, axis.max, axis.axisLabel.customValues]).toEqual([0, 1, [0.5]]);
  expect(axis.axisLabel.formatter(0.5)).toBe("axis:5");
  expect((options.tooltip as any).formatter({ axisValue: 0 })).toContain(
    "number:2 - number:8",
  );
});

it("keeps effective scale independent from observations and visibility", () => {
  const i = rangeInput();
  i.snapshot.rows = [];
  let o = rangeOptions(i);
  expect((o.yAxis as any).axisLabel.customValues).toEqual([0, 3, 11, 20]);
  expect((o.yAxis as any).axisLabel.formatter(11)).toBe("axis:11");
  i.snapshot = rangeInput().snapshot;
  i.style.valueScale = null;
  const labels = vi.fn(() => {
    throw Error("unused label");
  });
  const tooltip = vi.fn(() => {
    throw Error("unused tooltip");
  });
  i.context.display.seriesLabel = labels;
  i.context.display.tooltipNumber = tooltip;
  const r = translateRangeBar(i);
  expect(r).toMatchObject({ status: "supported", projection: { dataExtent: [2, 14] } });
  o = rangeOptions(i);
  expect((o.yAxis as any).axisLabel.customValues).toEqual([]);
  expect((o.tooltip as any).formatter({ axisValue: 0 })).toBe("");
  expect(labels).not.toHaveBeenCalled();
  expect(tooltip).not.toHaveBeenCalled();
});

it("precomputes display text, escapes tooltip markup and suppresses unused endpoint callbacks", () => {
  const i = rangeInput();
  const number = vi.fn((v: number) => `<$${v}>`);
  const category = vi.fn((v) => `<${v}>`);
  const label = vi.fn((v) => `$${v}`);
  i.context.display.tooltipNumber = number;
  i.context.display.category = category;
  i.context.display.seriesLabel = label;
  i.context.display.legend = () => {
    throw Error("unused");
  };
  i.context.legendSelection = { other: false };
  const o = rangeOptions(i);
  expect(number).toHaveBeenCalledTimes(4);
  expect(label).toHaveBeenCalledTimes(4);
  const before = [
    category.mock.calls.length,
    number.mock.calls.length,
    label.mock.calls.length,
  ];
  const tooltip = (o.tooltip as any).formatter;
  expect(tooltip({ axisValue: 0 })).toBe(
    "&lt;first&gt;<br/>Revenue &lt;USD&gt;: &lt;$2&gt; - &lt;$8&gt;",
  );
  expect(tooltip({ axisValue: 1 })).toBe("");
  (o.xAxis as any).axisLabel.formatter(0);
  (o.xAxis as any).axisPointer.label.formatter({ value: 0 });
  expect([
    category.mock.calls.length,
    number.mock.calls.length,
    label.mock.calls.length,
  ]).toEqual(before);
  i.style.tooltip.enabled = false;
  i.style.fields.amount.label.enabled = false;
  number.mockClear();
  label.mockClear();
  rangeOptions(i);
  expect(number).not.toHaveBeenCalled();
  expect(label).not.toHaveBeenCalled();
});

it("supports single/shared/compact tooltip modes without mixing hidden measures", () => {
  const i = rangeInput();
  for (const mode of ["single", "shared", "compact"] as const) {
    i.style.tooltip.mode = mode;
    const formatter = (rangeOptions(i).tooltip as any).formatter;
    const text = formatter({ data: { metadata: { fieldId: "other", groupSlot: 0 } } });
    expect(text.includes("Revenue")).toBe(mode === "shared");
    expect(text.includes("period:first")).toBe(mode !== "compact");
    expect(text).toContain("number:4 - number:12");
  }
});

it("rejects malformed boundary data, finite geometry overflow and unsupported semantics atomically", () => {
  const invalid: ((i: ReturnType<typeof rangeInput>) => void)[] = [
    (i) => {
      i.style.valueScale = { min: 2, max: 1, ticks: [] };
    },
    (i) => {
      i.style.valueScale!.ticks = [0, 3, 3];
    },
    (i) => {
      i.style.valueScale = { min: 5, max: 5, ticks: [4] };
    },
    (i) => {
      i.style.valueScale = { min: -1e308, max: 1e308, ticks: [] };
    },
    (i) => {
      i.snapshot.rows[0].values.amount = Number.NaN;
    },
    (i) => {
      delete i.style.fields.amount;
    },
    (i) => {
      i.context.legendSelection = { absent: true };
    },
    (i) => {
      i.style.fields.amount.label.size = -1;
    },
    (i) => {
      i.style.fields.amount.stroke = "";
    },
    (i) => {
      i.context.plot.width = 600;
    },
    (i) => {
      delete (i.snapshot.rows as any)[1];
    },
    (i) => {
      Object.defineProperty(i.style.fields.amount, "fill", {
        get: () => {
          throw Error("getter");
        },
      });
    },
    (i) => {
      (i.style.fields.amount as any).cycle = i.style;
    },
    (i) => {
      i.style.valueScale = { min: 1e-300, max: 2e-300, ticks: [] };
      i.snapshot.rows[0].values.amount = 1e308;
    },
    (i) => {
      i.context.display.category = () => {
        throw Error("callback");
      };
    },
    (i) => {
      i.context.display.tooltipNumber = () => undefined as any;
    },
  ];
  for (const change of invalid) {
    const i = rangeInput();
    change(i);
    expect(translateRangeBar(i).status).toBe("invalid");
  }
  for (const change of [
    (i: ReturnType<typeof rangeInput>) => {
      i.snapshot.sourceMode = "pivot";
    },
    (i: ReturnType<typeof rangeInput>) => {
      i.style.categoryAxis.fields.type = "time";
    },
    (i: ReturnType<typeof rangeInput>) => {
      (i.style.tooltip as any).mode = "unimplemented";
    },
    (i: ReturnType<typeof rangeInput>) => {
      i.style.categoryAxis.labels.autoRotate = true;
      i.style.categoryAxis.labels.rotation = undefined;
    },
  ]) {
    const i = rangeInput();
    change(i);
    expect(translateRangeBar(i).status).toBe("unsupported");
  }
});

it("retains empty categories and supports no numeric or no enabled fields", () => {
  const i = rangeInput();
  expect(projectRangeBar(i.snapshot, { amount: false, other: false })).toMatchObject({
    status: "resolved",
    projection: { dataExtent: [], groups: [{}, { category: "" }, {}] },
  });
  i.snapshot.selectedColumnIds = ["period"];
  i.snapshot.columns = i.snapshot.columns.slice(0, 1);
  i.snapshot.rows.forEach((r) => {
    r.values = {};
  });
  i.style.fields = {};
  expect(translateRangeBar(i)).toMatchObject({
    status: "supported",
    projection: { fields: [], dataExtent: [] },
  });
});

it("copies callback inputs before render and admits only required finite display results", () => {
  const i = rangeInput();
  const axis = vi.fn((v) => `$${v}`);
  i.context.display.numericAxis = axis;
  i.style.valueScale!.ticks = [];
  let o = rangeOptions(i);
  expect(axis).not.toHaveBeenCalled();
  const formatter = (o.xAxis as any).axisLabel.formatter;
  i.snapshot.rows[0].category = "changed";
  i.style.fields.amount.fill = "#ffffff";
  expect(formatter(0)).toBe("period:first");
  for (const name of ["numericAxis", "seriesLabel"] as const) {
    const bad = rangeInput();
    bad.context.display[name] = () => Number.POSITIVE_INFINITY;
    expect(translateRangeBar(bad).status).toBe("invalid");
  }
  i.style.valueScale = { min: 0, max: 20, ticks: [3] };
  o = rangeOptions(i);
  expect(axis.mock.calls.map((args) => args[0])).toEqual([3]);
  (o.yAxis as any).axisLabel.formatter(3);
  expect(axis).toHaveBeenCalledTimes(1);
  i.context.legendSelection = { amount: false, other: false };
  expect(translateRangeBar(i)).toMatchObject({
    status: "supported",
    projection: { dataExtent: [] },
  });
  const poisoned = rangeInput();
  const coerce = vi.fn(() => "normal");
  (poisoned.style.numberAxis.labels as any).weight = { toString: coerce };
  expect(translateRangeBar(poisoned).status).toBe("invalid");
  expect(coerce).not.toHaveBeenCalled();
});
