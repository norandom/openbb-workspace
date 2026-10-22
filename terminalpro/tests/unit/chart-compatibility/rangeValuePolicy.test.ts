import { expect, it } from "vitest";
import { planRangeValueAxis } from "../../../src/components/General/Table/Chart/echarts/rangeValueAxis";
it("applies saved nice, numeric intervals and reverse in the value scale", () => {
  const result = planRangeValueAxis({
    dataExtent: [1, 8],
    bounds: {},
    span: 400,
    policy: { nice: false, reverse: true, interval: { step: 2 } },
  });
  expect(result.fullExtent).toEqual([1, 8]);
  expect(result.valueScale).toEqual({
    min: 1,
    max: 8,
    ticks: [1, 3, 5, 7],
    reverse: true,
  });
});
it("retains explicit tick values without mutating saved order or expanding a constant", () => {
  const values = [5.5, 6, 5.5, 1];
  const result = planRangeValueAxis({
    dataExtent: [5.5, 5.5],
    bounds: {},
    span: 400,
    policy: { nice: true, reverse: false, interval: { values } },
  });
  expect(result.valueScale).toEqual({
    min: 5.5,
    max: 5.5,
    ticks: [5.5],
    reverse: false,
  });
  expect(values).toEqual([5.5, 6, 5.5, 1]);
});
it("retains policy bounds when legacy optional bounds are undefined", () => {
  const result = planRangeValueAxis({
    dataExtent: [2, 8],
    bounds: { min: undefined, max: undefined },
    span: 400,
    policy: { min: 0, max: 10, nice: false, reverse: false, interval: {} },
  });
  expect(result.fullExtent).toEqual([0, 10]);
});
