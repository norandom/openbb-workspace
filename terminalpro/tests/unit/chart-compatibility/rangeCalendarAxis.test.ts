// @vitest-environment node
import { expect, it } from "vitest";
import type {
  CalendarStep,
  RangeContinuousCategoryInput,
} from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
import {
  planRangeCalendar,
  rangeNumericCategoryFormatter,
} from "../../../src/components/General/Table/Chart/echarts/rangeCalendarAdapter";
import { planRangeContinuousCategory } from "../../../src/components/General/Table/Chart/echarts/rangeCategoryAxis";

const date = (y: number, m: number, d = 1) => new Date(y, m - 1, d).getTime();
const plan = (
  start: number,
  stop: number,
  step?: CalendarStep,
  extra: Partial<RangeContinuousCategoryInput> = {},
) =>
  planRangeContinuousCategory({
    kind: "time",
    domain: { mode: "full", dataExtent: [start, stop] },
    span: 600,
    visibleRange: [0, 1],
    policy: { nice: false, reverse: false, interval: { step } },
    ...extra,
  });
it("imports and plans with no browser/renderer globals", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  expect(rangeNumericCategoryFormatter(".1f")(1234.56)).toBe("1234.6");
  const weekly = planRangeCalendar({
    kind: "time",
    domain: { mode: "full", dataExtent: [date(2024, 1, 3), date(2024, 2, 10)] },
    span: 300,
    visibleRange: [0, 1],
    policy: { nice: true, reverse: false, interval: {} },
  });
  expect(typeof weekly.interval?.epoch).toBe("number");
  expect(plan(date(2024, 1), date(2024, 4), "month").rawTicks).toEqual(
    [1, 2, 3, 4].map((m) => date(2024, m)),
  );
});
it("advances calendar months across leap year with unequal epoch spacing", () => {
  const result = plan(date(2024, 1, 31), date(2024, 4, 1), "month");
  expect(result.rawTicks).toEqual([date(2024, 2), date(2024, 3), date(2024, 4)]);
  expect(result.category.ticks.map((t) => t.label)).toEqual(["Feb", "Mar", "Apr"]);
});
it.each([
  [3, 30, 4, 2, 23],
  [10, 26, 10, 29, 25],
])("retains local DST calendar days %j", (m, d, endM, endD, hours) => {
  const ticks = plan(date(2024, m, d), date(2024, endM, endD), "day").rawTicks;
  expect(ticks).toHaveLength(4);
  expect(ticks[2] - ticks[1]).toBe(hours * 3600000);
});
it("uses UTC interval advancement and the explicit date label format", () => {
  const first = Date.UTC(2024, 2, 30);
  const result = plan(
    first,
    Date.UTC(2024, 3, 2),
    { unit: "day", utc: true },
    { labelFormat: "%Y-%m-%d" },
  );
  expect(result.rawTicks).toEqual([0, 1, 2, 3].map((i) => first + i * 86400000));
  expect(result.category.ticks[0].label).toBe("2024-03-30");
});
it("aligns multi-month ticks to domain start unless an epoch is supplied", () => {
  const start = date(2024, 2, 15);
  const end = date(2024, 9, 15);
  expect(plan(start, end, { unit: "month", step: 3 }).rawTicks).toEqual([
    date(2024, 5),
    date(2024, 8),
  ]);
  expect(
    plan(start, end, { unit: "month", step: 3, epoch: date(2024, 1) }).rawTicks,
  ).toEqual([date(2024, 4), date(2024, 7)]);
});
it("keeps full nicing stable under navigation and automatic weekly Sunday epochs", () => {
  const full = plan(date(2024, 1, 3), date(2024, 2, 10), undefined, {
    span: 300,
    policy: { nice: true, reverse: false, interval: {} },
  });
  expect(full.rawTicks.every((epoch) => new Date(epoch).getDay() === 0)).toBe(true);
  expect(full.rawTicks.length).toBeGreaterThan(2);
  const cropped = plan(0, 1, undefined, {
    domain: { mode: "window", fullExtent: full.category.fullExtent },
    visibleRange: [0.25, 0.75],
    policy: { min: 1, max: 2, nice: true, reverse: false, interval: {} },
  });
  expect(cropped.category.fullExtent).toEqual(full.category.fullExtent);
  expect(
    cropped.rawTicks.every(
      (v) => v >= full.category.fullExtent[0]! && v <= full.category.fullExtent[1]!,
    ),
  ).toBe(true);
});
it("admits empty/singleton dates and sorts saved explicit dates without mutation", () => {
  expect(
    plan(0, 1, undefined, { domain: { mode: "full", dataExtent: [] } }).rawTicks,
  ).toEqual([]);
  expect(plan(date(2024, 1), date(2024, 1)).rawTicks).toEqual([date(2024, 1)]);
  const values = Object.freeze([date(2024, 3), date(2024, 2), date(2024, 2)]);
  const result = plan(date(2024, 1), date(2024, 4), undefined, {
    policy: { nice: false, reverse: false, interval: { values } },
  });
  expect(result.rawTicks).toEqual([date(2024, 2), date(2024, 3)]);
  expect(values).toHaveLength(3);
});
it.each([
  "week",
  "bananas",
  { unit: "day", step: 0 },
  { unit: "day", epoch: 8.65e15 },
  { unit: "day", every: () => true },
])("rejects unsupported calendar policy %j", (step) => {
  expect(() => plan(0, 100, step as CalendarStep)).toThrow(/Range/);
});
it("rejects invalid Date endpoints and pathological allocation before traversal", () => {
  expect(() => plan(0, 8.65e15)).toThrow(/Range/);
  expect(() => plan(date(1900, 1), date(2024, 1), "millisecond")).toThrow(/Range/);
  expect(() => plan(0, 1, { unit: "millisecond", step: 0.1 })).toThrow(/Range/);
});
it("chooses the coarser automatic interval on an equal duration distance", () => {
  const result = plan(0, 30000, undefined, {
    density: { minTickCount: 1, tickCount: 10, maxTickCount: 50 },
  });
  expect(result.rawTicks).toEqual([0, 5000, 10000, 15000, 20000, 25000, 30000]);
});
it("uses exact-divisor calendar units and domain-start millisecond fallback", () => {
  expect(plan(123, 3123, 1000).rawTicks).toEqual([1000, 2000, 3000]);
  expect(plan(1000, 1111, 37).rawTicks).toEqual([1000, 1037, 1074, 1111]);
});
it("falls back automatically when an explicit interval reaches a tick per pixel", () => {
  expect(plan(0, 1000, 1, { span: 10 }).rawTicks).toEqual([0, 1000]);
  expect(plan(0, 1000000, 1).rawTicks).toEqual([0, 300000, 600000, 900000]);
});
it.each([
  1, 2,
])("keeps the source nice count %s endpoint path and filters its crop", (count) => {
  const policy = { nice: true, reverse: false, interval: {} } as const;
  const density = { minTickCount: count, tickCount: count, maxTickCount: count };
  const full = plan(0, 1000, undefined, { policy, density });
  expect(full.rawTicks).toEqual(count === 1 ? [0] : [0, 1000]);
  const cropped = plan(0, 1, undefined, {
    policy,
    density,
    domain: { mode: "window", fullExtent: [0, 1000] },
    visibleRange: [0.25, 0.75],
  });
  expect(cropped.rawTicks).toEqual([]);
});
it("nices a monthly full domain once and formats month/year hierarchy automatically", () => {
  const result = plan(date(2024, 1, 15), date(2024, 6, 15), undefined, {
    policy: { nice: true, reverse: false, interval: {} },
  });
  expect(result.category.fullExtent).toEqual([date(2024, 1), date(2024, 7)]);
  expect(result.rawTicks).toEqual(
    [1, 2, 3, 4, 5, 6, 7].map((month) => date(2024, month)),
  );
  expect(result.category.ticks.map((tick) => tick.label)).toEqual([
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
  ]);
  expect(
    plan(date(2023, 1), date(2025, 1), "year").category.ticks.map((tick) => tick.label),
  ).toEqual(["2023", "2024", "2025"]);
});
it("filters a singleton against its explicit interval instead of inventing a tick", () => {
  const point = date(2024, 1) + 3600000;
  expect(plan(point, point, "day").rawTicks).toEqual([]);
  expect(
    plan(point, point, undefined, {
      policy: { nice: false, reverse: false, interval: { values: [point] } },
      density: { minTickCount: 0, tickCount: 0, maxTickCount: 0 },
    }).rawTicks,
  ).toEqual([point]);
});
