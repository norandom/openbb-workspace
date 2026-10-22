import { expect, it } from "vitest";
import type { RangeNumericAxisInput } from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
import { planRangeNumericAxis } from "../../../src/components/General/Table/Chart/echarts/rangeNumericAxis";

const plan = (extra: Partial<RangeNumericAxisInput> = {}) =>
  planRangeNumericAxis({
    domain: { mode: "full", dataExtent: [4.53, 6.47] },
    span: 300,
    visibleRange: [0, 1],
    preserveConstant: false,
    policy: { nice: true, reverse: false, interval: {} },
    ...extra,
  });
it("reuses default numerical nicing and retains the semantic endpoints", () => {
  expect(plan()).toMatchObject({
    semanticExtent: [4.53, 6.47],
    fullExtent: [4.5, 6.5],
    rawTicks: [4.5, 5, 5.5, 6, 6.5],
  });
});
it("applies bounds, nice false, and exact explicit steps", () => {
  expect(
    plan({
      policy: {
        min: 4.7,
        max: 6.3,
        nice: false,
        reverse: true,
        interval: { step: 0.5 },
      },
    }),
  ).toMatchObject({
    semanticExtent: [4.7, 6.3],
    fullExtent: [4.7, 6.3],
    rawTicks: [4.7, 5.2, 5.7, 6.2],
  });
});
it("filters, sorts, and deduplicates explicit values without mutating saved values", () => {
  const values = Object.freeze([6, 5, 5, 9, 4.5]);
  expect(
    plan({ policy: { nice: false, reverse: false, interval: { values } } }).rawTicks,
  ).toEqual([5, 6]);
  expect(values).toEqual([6, 5, 5, 9, 4.5]);
});
it("retains the accepted full domain on a crop and permits numerical zero width", () => {
  const input = {
    domain: { mode: "window", fullExtent: [0, 10] },
    visibleRange: [0.4, 0.4],
    policy: { min: -20, max: 20, nice: true, reverse: false, interval: {} },
  } as const;
  expect(plan(input)).toMatchObject({
    semanticExtent: [0, 10],
    fullExtent: [0, 10],
    visibleExtent: [4, 4],
    rawTicks: [4],
  });
});
it("preserves constant value transport while category nicing can expand constants", () => {
  const domain = { mode: "full", dataExtent: [5.5, 5.5] } as const;
  expect(plan({ domain, preserveConstant: true })).toMatchObject({
    fullExtent: [5.5, 5.5],
    rawTicks: [5.5],
  });
  expect(plan({ domain }).fullExtent).toEqual([5, 6]);
  expect(
    plan({
      domain,
      preserveConstant: true,
      policy: { nice: true, reverse: false, interval: { values: [4, 6] } },
    }).rawTicks,
  ).toEqual([]);
});
it("keeps an explicit step from rounding a preserved raw singleton", () => {
  expect(
    plan({
      domain: { mode: "full", dataExtent: [5.5, 5.5] },
      preserveConstant: true,
      policy: { nice: true, reverse: false, interval: { step: 1 } },
    }),
  ).toMatchObject({
    fullExtent: [5.5, 5.5],
    visibleExtent: [5.5, 5.5],
    rawTicks: [5.5],
  });
});
it("uses saved spacing and falls back from an over-dense explicit step", () => {
  expect(
    plan({
      domain: { mode: "full", dataExtent: [0, 100] },
      policy: {
        nice: false,
        reverse: false,
        interval: { minSpacing: 100, maxSpacing: 150 },
      },
    }).density,
  ).toEqual({ minTickCount: 2, maxTickCount: 3, tickCount: 3 });
  const noNice = { nice: false, reverse: false, interval: {} };
  expect(plan({ policy: { ...noNice, interval: { step: 0.0001 } } }).rawTicks).toEqual(
    plan({ policy: noNice }).rawTicks,
  );
});
it("retains source decimal precision and domain-start alignment for explicit steps", () => {
  const policy = { nice: false, reverse: false, interval: { step: 0.25 } };
  expect(
    plan({ domain: { mode: "full", dataExtent: [0.1, 0.9] }, policy }).rawTicks,
  ).toEqual([0.1, 0.35, 0.6, 0.85]);
  expect(
    plan({
      domain: { mode: "full", dataExtent: [0.1, 0.9] },
      policy: { ...policy, nice: true },
    }).fullExtent,
  ).toEqual([0, 1]);
});
it("admits source zero spacing and rejects contradictory saved spacing", () => {
  expect(
    plan({
      policy: {
        nice: false,
        reverse: false,
        interval: { minSpacing: 0, maxSpacing: 100 },
      },
    }).density,
  ).toEqual({ minTickCount: 3, tickCount: 5, maxTickCount: 300 });
  expect(() =>
    plan({
      policy: {
        nice: false,
        reverse: false,
        interval: { minSpacing: 50, maxSpacing: 50 },
      },
    }),
  ).toThrow(/Range/);
});
it.each([
  { policy: { nice: true, reverse: false, interval: { step: 0 } } },
  { policy: { nice: true, reverse: false, interval: { values: [1, Number.NaN] } } },
  { policy: { nice: true, reverse: false, interval: { minSpacing: -1 } } },
  { policy: { nice: true, reverse: false, min: 4, max: 4, interval: {} } },
  { domain: { mode: "full", dataExtent: [-1e308, 1e308] } },
  { visibleRange: [-1, 1] },
  { density: { minTickCount: 1, tickCount: 2.5, maxTickCount: 3 } },
])("rejects malformed policy/arithmetic %j", (input) => {
  expect(() => plan(input as Partial<RangeNumericAxisInput>)).toThrow(/Range/);
});
