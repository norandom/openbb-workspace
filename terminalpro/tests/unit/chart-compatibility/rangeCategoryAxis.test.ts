import { expect, it } from "vitest";
import type { RangeContinuousCategoryInput } from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
import { planRangeContinuousCategory } from "../../../src/components/General/Table/Chart/echarts/rangeCategoryAxis";

const category = (extra: Partial<RangeContinuousCategoryInput> = {}) =>
  planRangeContinuousCategory({
    kind: "number",
    domain: { mode: "full", dataExtent: [0, 100] },
    policy: { nice: true, reverse: false, interval: {} },
    span: 300,
    visibleRange: [0, 1],
    ...extra,
  });
it("keeps numerical identity, spacing, and reverse metadata independent of financial formatting", () => {
  const result = category({
    policy: { nice: false, reverse: true, interval: { values: [100, 1, 0] } },
  });
  expect(result.rawTicks).toEqual([0, 1, 100]);
  expect(result.category.ticks).toEqual([
    { coordinate: 0, label: "0" },
    { coordinate: 1, label: "1" },
    { coordinate: 100, label: "100" },
  ]);
  expect(result.reverse).toBe(true);
  expect(result.category.reverse).toBe(true);
});
it("applies the saved numeric format directly to raw category ticks", () => {
  const result = category({
    labelFormat: ".1f",
    policy: { nice: false, reverse: false, interval: { values: [0, 1, 100] } },
  });
  expect(result.category.ticks.map((tick) => tick.label)).toEqual([
    "0.0",
    "1.0",
    "100.0",
  ]);
  expect(result.rawTicks).toEqual([0, 1, 100]);
});
it("rejects collapsed category windows and nonnumerical category intervals", () => {
  expect(() => category({ visibleRange: [0.5, 0.5] })).toThrow(/Range/);
  expect(() =>
    category({ policy: { nice: true, reverse: false, interval: { step: "day" } } }),
  ).toThrow(/Range/);
});
