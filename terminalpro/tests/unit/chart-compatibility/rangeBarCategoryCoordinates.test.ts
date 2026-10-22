import { expect, it, vi } from "vitest";
import type { ChartDisplayPolicy } from "../../../src/components/General/Table/Chart/application/types";
import { translateRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBar";
import { rangeInput, rangeOptions } from "./rangeBar.fixtures";

function continuous(keys: (string | number)[] = [0, 100, 1]) {
  const i = rangeInput();
  i.style.categoryAxis.fields.type = "number";
  i.style.categoryCoordinates = {
    kind: "number",
    fullExtent: [-49.5, 149.5],
    ticks: [
      { coordinate: 0, label: "zero" },
      { coordinate: 10, label: "ten" },
      { coordinate: 100, label: "hundred" },
    ],
  };
  i.snapshot.rows = keys.flatMap((category, n) => [
    { id: `low-${n}`, category, values: { amount: n + 2, other: n + 4 } },
    { id: `high-${n}`, category, values: { amount: n + 8, other: n + 12 } },
  ]);
  return {
    ...i,
    style: { ...i.style, categoryCoordinates: i.style.categoryCoordinates },
  };
}

it("encodes raw continuous coordinates separately from dense group identity", () => {
  const i = continuous();
  const original = structuredClone(i.snapshot);
  const r = translateRangeBar(i);
  expect(r.status).toBe("supported");
  if (r.status !== "supported") return;
  expect(r.projection.groups.map((g) => g.category)).toEqual([0, 100, 1]);
  const s = (r.options.series as any[])[0];
  expect(s.data.map((d: any) => d.value)).toEqual([
    [0, 2, 8, 0],
    [100, 3, 9, 1],
    [1, 4, 10, 2],
  ]);
  expect(s.data[2].metadata).toMatchObject({
    fieldId: "amount",
    groupSlot: 2,
    summary: { min: 4, max: 10 },
    sourceRowIds: ["low-2", "high-2"],
  });
  expect(i.snapshot).toEqual(original);
  i.snapshot.rows[0].category = 999;
  i.style.categoryCoordinates.ticks[0].label = "changed";
  expect((r.options.xAxis as any).axisLabel.formatter(0)).toBe("zero");
  expect(s.data[0].value[0]).toBe(0);
});

it("uses supplied ticks while axis and item callbacks preserve exact raw identity", () => {
  const i = continuous();
  const o = rangeOptions(i);
  const axis = o.xAxis as any;
  const tooltip = (o.tooltip as any).formatter;
  expect([axis.min, axis.max]).toEqual([-49.5, 149.5]);
  expect(axis.axisLabel.customValues).toEqual([0, 10, 100]);
  expect(axis.axisTick.customValues).toEqual([0, 10, 100]);
  expect(axis.axisLabel.formatter(10)).toBe("ten");
  expect(axis.axisLabel.formatter(1)).toBe("");
  expect(axis.axisPointer.label.formatter({ value: 100 })).toBe("cross:100");
  expect(axis.axisPointer.label.formatter({ value: 50 })).toBe("");
  expect(tooltip({ axisValue: 100 })).toContain("period:100<br/>");
  expect(tooltip({ axisValue: 1 })).toContain("number:4 - number:10");
  expect(tooltip({ axisValue: 50 })).toBe("");
  expect(tooltip({ axisValue: 2 })).toBe("");
  expect(
    tooltip({
      axisValue: 100,
      data: { metadata: { fieldId: "amount", groupSlot: 2 } },
    }),
  ).toContain("period:1<br/>");
});

it("skips numeric strings without invoking their category or endpoint display callbacks", () => {
  const i = continuous([0, "1", 1]);
  const category = vi.fn<ChartDisplayPolicy["category"]>((v) => {
    if (typeof v === "string") throw Error("inadmissible category formatted");
    return `raw:${v}`;
  });
  const crosshair = vi.fn<ChartDisplayPolicy["crosshair"]>(category);
  const label = vi.fn<ChartDisplayPolicy["seriesLabel"]>((v) => `endpoint:${v}`);
  const tooltip = vi.fn<ChartDisplayPolicy["tooltipNumber"]>((v) => `value:${v}`);
  i.context.display.category = category;
  i.context.display.crosshair = crosshair;
  i.context.display.seriesLabel = label;
  i.context.display.tooltipNumber = tooltip;
  const o = rangeOptions(i);
  const data = (o.series as any[])[0].data;
  expect(data.map((d: any) => d.value[3])).toEqual([0, 2]);
  expect(label).toHaveBeenCalledTimes(8);
  expect(tooltip).toHaveBeenCalledTimes(8);
  expect(category.mock.calls.every(([v]) => typeof v === "number")).toBe(true);
  expect((o.tooltip as any).formatter({ axisValue: 1 })).toContain("raw:1<br/>");
  expect(
    (o.tooltip as any).formatter({
      data: { metadata: { fieldId: "amount", groupSlot: 1 } },
    }),
  ).toBe("");
});

it("consumes irregular epoch coordinates and calendar ticks without parsing strings", () => {
  const day = 86_400_000;
  const start = Date.UTC(2024, 0, 1);
  const i = continuous([start, start + day * 31, start + day * 32]);
  i.style.categoryAxis.fields.type = "time";
  i.style.categoryCoordinates = {
    kind: "time",
    fullExtent: [start - day / 2, start + day * 32.5],
    ticks: [
      { coordinate: start, label: "Jan 2024" },
      { coordinate: start + day * 31, label: "Feb 2024" },
    ],
  };
  const o = rangeOptions(i);
  expect((o.series as any[])[0].data.map((d: any) => d.value[0])).toEqual([
    start,
    start + day * 31,
    start + day * 32,
  ]);
  const axis = o.xAxis as any;
  expect(axis.axisLabel.customValues).toEqual([start, start + day * 31]);
  expect(axis.axisLabel.formatter(start + day * 31)).toBe("Feb 2024");
});

it("keeps equal and empty transports finite without admitting outside observations", () => {
  const i = continuous([5, "5", 6]);
  i.style.categoryCoordinates = {
    kind: "number",
    fullExtent: [5, 5],
    ticks: [{ coordinate: 5, label: "five" }],
  };
  let o = rangeOptions(i);
  expect([(o.xAxis as any).min, (o.xAxis as any).max]).toEqual([0, 1]);
  expect((o.xAxis as any).axisLabel.customValues).toEqual([0.5]);
  expect((o.xAxis as any).axisLabel.formatter(0.5)).toBe("five");
  expect((o.tooltip as any).formatter({ axisValue: 0.5 })).toContain("period:5");
  expect((o.tooltip as any).formatter({ axisValue: 5 })).toBe("");
  i.style.categoryCoordinates = { kind: "number", fullExtent: [], ticks: [] };
  o = rangeOptions(i);
  expect((o.xAxis as any).axisLabel.customValues).toEqual([]);
  expect((o.tooltip as any).formatter({ axisValue: 0 })).toBe("");
});

it("rejects malformed continuous boundaries atomically", () => {
  const changes: ((i: ReturnType<typeof continuous>) => void)[] = [
    (i) => {
      i.style.categoryCoordinates!.kind = "time";
    },
    (i) => {
      i.style.categoryCoordinates!.fullExtent = [10, 0];
    },
    (i) => {
      i.style.categoryCoordinates!.fullExtent = [-1e308, 1e308];
    },
    (i) => {
      i.style.categoryCoordinates!.visibleRange = [0.5, 0.5];
    },
    (i) => {
      i.style.categoryCoordinates!.ticks = [{ coordinate: 200, label: "outside" }];
    },
    (i) => {
      i.style.categoryCoordinates!.ticks.reverse();
    },
    (i) => {
      (i.style.categoryCoordinates!.ticks as any)[1] = undefined;
    },
  ];
  for (const change of changes) {
    const i = continuous();
    change(i);
    expect(translateRangeBar(i).status).toBe("invalid");
  }
});
