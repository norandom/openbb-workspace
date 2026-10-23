// @vitest-environment node
import { describe, expect, it } from "vitest";
import { projectWaterfallTotals } from "../../../src/components/General/Table/Chart/compatibility/waterfallTotals";

describe("cumulative waterfall movements", () => {
  it("bridges the five signed FMP movements to independently specified balances", () => {
    expect(projectWaterfallTotals([
      109_417_000_000, -54_647_000_000, -19_075_000_000,
      572_000_000, -6_478_000_000,
    ])).toEqual({
      status: "resolved",
      count: 5,
      extent: [0, 109_417_000_000],
      points: [
        { index: 0, delta: 109_417_000_000, start: 0, end: 109_417_000_000, kind: "positive" },
        { index: 1, delta: -54_647_000_000, start: 109_417_000_000, end: 54_770_000_000, kind: "negative" },
        { index: 2, delta: -19_075_000_000, start: 54_770_000_000, end: 35_695_000_000, kind: "negative" },
        { index: 3, delta: 572_000_000, start: 35_695_000_000, end: 36_267_000_000, kind: "positive" },
        { index: 4, delta: -6_478_000_000, start: 36_267_000_000, end: 29_789_000_000, kind: "negative" },
      ],
    });
  });

  it("preserves supplied movement order across zero and includes every endpoint", () => {
    expect(projectWaterfallTotals([5, -8, 10, -9])).toEqual({
      status: "resolved", count: 4, extent: [-3, 7],
      points: [
        { index: 0, delta: 5, start: 0, end: 5, kind: "positive" },
        { index: 1, delta: -8, start: 5, end: -3, kind: "negative" },
        { index: 2, delta: 10, start: -3, end: 7, kind: "positive" },
        { index: 3, delta: -9, start: 7, end: -2, kind: "negative" },
      ],
    });
  });

  it("keeps missing positions without advancing the balance or observation count", () => {
    expect(projectWaterfallTotals([null, -4, null, 6, null])).toEqual({
      status: "resolved", count: 2, extent: [-4, 2],
      points: [
        { index: 0, delta: null, start: 0, end: 0, kind: "missing" },
        { index: 1, delta: -4, start: 0, end: -4, kind: "negative" },
        { index: 2, delta: null, start: -4, end: -4, kind: "missing" },
        { index: 3, delta: 6, start: -4, end: 2, kind: "positive" },
        { index: 4, delta: null, start: 2, end: 2, kind: "missing" },
      ],
    });
  });

  it.each([0, -0])("classifies zero as positive while retaining its raw sign: %s", (delta) => {
    const result = projectWaterfallTotals([delta, -2, delta]);
    expect(result).toEqual({
      status: "resolved", count: 3, extent: [-2, 0],
      points: [
        { index: 0, delta, start: 0, end: 0, kind: "positive" },
        { index: 1, delta: -2, start: 0, end: -2, kind: "negative" },
        { index: 2, delta, start: -2, end: -2, kind: "positive" },
      ],
    });
    if (result.status !== "resolved") throw new Error("Expected resolved totals");
    expect(Object.is(result.points[0].delta, delta)).toBe(true);
    expect(Object.is(result.points[2].delta, delta)).toBe(true);
  });

  it.each([[], [null], [null, null]].map((values) => ({ values })))("resolves empty/all-missing input $values", ({ values }) => {
    expect(projectWaterfallTotals(values)).toEqual({
      status: "resolved", count: 0, extent: [0, 0],
      points: values.map((delta, index) => ({ index, delta, start: 0, end: 0, kind: "missing" })),
    });
  });

  it.each([7, -7])("includes zero for a singleton movement %s", (delta) => {
    expect(projectWaterfallTotals([delta])).toEqual({
      status: "resolved", count: 1, extent: [Math.min(0, delta), Math.max(0, delta)],
      points: [{ index: 0, delta, start: 0, end: delta, kind: delta < 0 ? "negative" : "positive" }],
    });
  });

  it("uses ordinary JavaScript addition without decimal rounding", () => {
    const result = projectWaterfallTotals([0.1, 0.2, -0.3]);
    if (result.status !== "resolved") throw new Error("Expected resolved totals");
    expect(result.points.map(({ end }) => end)).toEqual([0.1, 0.30000000000000004, 5.551115123125783e-17]);
    expect(result.extent).toEqual([0, 0.30000000000000004]);
  });

  it("accepts finite numbers outside the safe-integer range and subnormal movements", () => {
    const result = projectWaterfallTotals([Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE]);
    expect(result).toEqual({
      status: "resolved", count: 3, extent: [0, Number.MAX_VALUE],
      points: [
        { index: 0, delta: Number.MAX_VALUE, start: 0, end: Number.MAX_VALUE, kind: "positive" },
        { index: 1, delta: -Number.MAX_VALUE, start: Number.MAX_VALUE, end: 0, kind: "negative" },
        { index: 2, delta: Number.MIN_VALUE, start: 0, end: Number.MIN_VALUE, kind: "positive" },
      ],
    });
  });

  it("leaves frozen input untouched and produces independent immutable geometry", () => {
    const input = Object.freeze([6, null, -2, 1]);
    const first = projectWaterfallTotals(input);
    const second = projectWaterfallTotals(input);
    expect(input).toEqual([6, null, -2, 1]);
    expect(second).toEqual(first);
    if (first.status !== "resolved" || second.status !== "resolved") throw new Error("Expected resolved totals");
    expect(first.points).not.toBe(second.points);
    expect(first.extent).not.toBe(second.extent);
    expect(Object.isFrozen(first.points)).toBe(true);
    expect(Object.isFrozen(first.extent)).toBe(true);
    expect(first.points.every(Object.isFrozen)).toBe(true);
  });

  it.each([undefined, null, {}, "1", 1, true, new Float64Array([1])])("rejects an invalid root %s", (input) => {
    expect(projectWaterfallTotals(input)).toEqual({
      status: "invalid", diagnostics: [{ code: "invalid-input", path: [], message: expect.any(String) }],
    });
  });

  it.each([undefined, "2", false, {}, [], Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1n])("rejects invalid observation %s without partial geometry", (value) => {
    expect(projectWaterfallTotals([4, null, -8, value])).toEqual({
      status: "invalid", diagnostics: [{ code: "invalid-input", path: [3], message: expect.any(String) }],
    });
  });

  it.each([false, true])("rejects sparse input even when a value is inherited: %s", (inherited) => {
    const input = [1, 2, 3];
    Reflect.deleteProperty(input, 1);
    if (inherited) Object.setPrototypeOf(input, { 1: 2 });
    expect(projectWaterfallTotals(input)).toEqual({
      status: "invalid", diagnostics: [{ code: "invalid-input", path: [1], message: expect.any(String) }],
    });
  });

  it.each([Number.MAX_VALUE, -Number.MAX_VALUE])("rejects cumulative overflow at its failing index: %s", (delta) => {
    expect(projectWaterfallTotals([delta, null, delta])).toEqual({
      status: "invalid", diagnostics: [{ code: "invalid-input", path: [2], message: expect.any(String) }],
    });
  });

  it("imports and runs without browser or renderer initialization", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(projectWaterfallTotals([1]).status).toBe("resolved");
  });
});
