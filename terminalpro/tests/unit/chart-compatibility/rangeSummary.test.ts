// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calculateRangeSummary } from "../../../src/components/General/Table/Chart/compatibility/rangeSummary";

describe("finite-observation range summary", () => {
  it.each([
    { values: [5, 1, 3, 2, 4], count: 5, min: 1, max: 5 },
    { values: [-8, -4, -12], count: 3, min: -12, max: -4 },
    { values: [0.3, -0.25, 0, 0.1], count: 4, min: -0.25, max: 0.3 },
    { values: [2, 2, 2, 8, 8], count: 5, min: 2, max: 8 },
    { values: [7], count: 1, min: 7, max: 7 },
    { values: [null, 9, null, 1, 5, null], count: 3, min: 1, max: 9 },
    { values: [null, -3, null], count: 1, min: -3, max: -3 },
    {
      values: [-Number.MAX_VALUE, Number.MAX_VALUE],
      count: 2,
      min: -Number.MAX_VALUE,
      max: Number.MAX_VALUE,
    },
    {
      values: [Number.MIN_VALUE, -Number.MIN_VALUE],
      count: 2,
      min: -Number.MIN_VALUE,
      max: Number.MIN_VALUE,
    },
  ])("retains the independent extrema of $values", ({ values, count, min, max }) => {
    expect(calculateRangeSummary(values)).toEqual({
      status: "resolved",
      count,
      summary: { min, max },
    });
  });

  it.each(
    [[], [null], [null, null]].map((values) => ({ values })),
  )("resolves empty observations $values", ({ values }) => {
    expect(calculateRangeSummary(values)).toEqual({
      status: "resolved",
      count: 0,
      summary: null,
    });
  });

  it.each([
    { values: [-0], min: -0, max: -0 },
    { values: [0], min: 0, max: 0 },
    { values: [-0, 0], min: -0, max: 0 },
    { values: [0, -0], min: -0, max: 0 },
    { values: [null, -0, 0, -0, null], min: -0, max: 0 },
  ])("preserves both endpoint zero signs for $values", ({ values, min, max }) => {
    const result = calculateRangeSummary(values);
    if (result.status !== "resolved" || result.summary === null) {
      throw new Error("Expected nonempty summary");
    }
    expect(Object.is(result.summary.min, min)).toBe(true);
    expect(Object.is(result.summary.max, max)).toBe(true);
  });

  it("leaves frozen observations untouched and returns independent summaries", () => {
    const input = Object.freeze([9, null, 1, 5]);
    const first = calculateRangeSummary(input);
    const second = calculateRangeSummary(input);
    expect(input).toEqual([9, null, 1, 5]);
    expect(first).toEqual({
      status: "resolved",
      count: 3,
      summary: { min: 1, max: 9 },
    });
    expect(second).toEqual(first);
    expect(first).not.toBe(second);
    if (first.status !== "resolved" || second.status !== "resolved") {
      throw new Error("Expected summary");
    }
    expect(first.summary).not.toBe(second.summary);
  });

  it.each(
    [undefined, null, {}, "1", 1, true, new Float64Array([1, 2])].map((input) => ({
      input,
    })),
  )("rejects invalid shape $input at the root", ({ input }) => {
    expect(calculateRangeSummary(input)).toEqual({
      status: "invalid",
      diagnostics: [{ code: "invalid-input", path: [], message: expect.any(String) }],
    });
  });

  it.each(
    [
      undefined,
      "2",
      false,
      {},
      [],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ].map((observation) => ({ observation })),
  )("rejects a late invalid observation atomically: $observation", ({
    observation,
  }) => {
    expect(calculateRangeSummary([4, null, -8, observation])).toEqual({
      status: "invalid",
      diagnostics: [{ code: "invalid-input", path: [3], message: expect.any(String) }],
    });
  });

  it.each([
    false,
    true,
  ])("rejects sparse input, inherited value present: %s", (inherited) => {
    const input = [1, 2, 3];
    Reflect.deleteProperty(input, 1);
    if (inherited) Object.setPrototypeOf(input, { 1: 2 });
    expect(calculateRangeSummary(input)).toEqual({
      status: "invalid",
      diagnostics: [{ code: "invalid-input", path: [1], message: expect.any(String) }],
    });
  });

  it.each([
    -1,
    1.5,
    Number.POSITIVE_INFINITY,
    Number.NaN,
    "1",
  ])("rejects an invalid reported array length: %s", (length) => {
    const input = new Proxy([1], { get: () => length });
    expect(calculateRangeSummary(input)).toEqual({
      status: "invalid",
      diagnostics: [{ code: "invalid-input", path: [], message: expect.any(String) }],
    });
  });

  it("catches index, length, own-property and revoked-proxy failures at the boundary", () => {
    const fail = () => {
      throw new Error("unreadable");
    };
    const index = [1, 2];
    Object.defineProperty(index, 1, { get: fail });
    const length = new Proxy([1], { get: fail });
    const own = new Proxy([1], { getOwnPropertyDescriptor: fail });
    const revoked = Proxy.revocable([1], {});
    revoked.revoke();
    for (const input of [index, length, own, revoked.proxy]) {
      expect(calculateRangeSummary(input)).toEqual({
        status: "invalid",
        diagnostics: [{ code: "invalid-input", path: [], message: expect.any(String) }],
      });
    }
  });

  it("imports and runs without browser or renderer initialization", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(calculateRangeSummary([2, 1])).toEqual({
      status: "resolved",
      count: 2,
      summary: { min: 1, max: 2 },
    });
  });
});
