import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeRangeApplication } from "../../../src/components/General/Table/Chart/echarts/rangeApplication";
import {
  rangeNavigationAutoscale,
  rangeHorizontalAutoscale,
  rangeOrdinalScale,
} from "../../../src/components/General/Table/Chart/echarts/rangeNavigationAutoscale";
import { rangeNavigationPolicy } from "../../../src/components/General/Table/Chart/echarts/rangeNavigationPolicy";
import { rangeLiveInput } from "./rangeLive.fixtures";
import type { RangeApplicationInput } from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function source(horizontal = false) {
  const base = rangeLiveInput();
  return {
    ...base,
    baseline: {
      ...base.baseline,
      options: {
        "range-bar": {
          zoom: { enabled: true },
          series: { direction: horizontal ? "horizontal" : "vertical" },
        },
      },
    },
  };
}
function full(input: RangeApplicationInput = source()) {
  const c = composeRangeApplication(input);
  if (c.status !== "supported") throw Error(JSON.stringify(c));
  return c;
}
describe("Range source conditional dependent-axis autoscaling", () => {
  it("converts numerical ordinal endpoints at source band leading edges including singleton padding", () => {
    const base = source(true);
    const input = {
      ...base,
      snapshot: {
        ...base.snapshot,
        rows: [0, 1, 2].flatMap((category, n) => [
          { id: `l${n}`, category, values: { amount: 0, other: 0 } },
          { id: `h${n}`, category, values: { amount: 1, other: 1 } },
        ]),
      },
      baseline: {
        ...base.baseline,
        options: {
          "range-bar": {
            series: { direction: "horizontal" },
            zoom: { enabled: true, autoScaling: { padding: 0 } },
          },
        },
      },
    };
    const c = full(input);
    const converted = rangeHorizontalAutoscale(
      input,
      c,
      [0, 0.2],
      rangeNavigationPolicy(input),
    );
    expect(converted?.[0]).toBeCloseTo(0.05);
    expect(converted?.[1]).toBeCloseTo(0.3833333333333333);
    const singleton = {
      ...c,
      projection: {
        ...c.projection,
        groups: [{ slot: 0, category: 0, rowIds: [] }],
        fields: c.projection.fields.map((f) => ({
          ...f,
          data: [{ ...f.data[0], summary: { ...f.data[0].summary!, min: 0, max: 0 } }],
        })),
      },
      category: { ...c.category, fullExtent: [-0.5, 0.5] as const, coordinates: [0] },
    };
    expect(rangeOrdinalScale(singleton).convert(0)).toBeCloseTo(0.15);
  });
  it("selects the actual ascending crop envelope before reversing its pixels", () => {
    const base = source();
    const input = {
      ...base,
      snapshot: {
        ...base.snapshot,
        rows: ["A", "B", "C"].flatMap((category, n) => [
          {
            id: `l${n}`,
            category,
            values: { amount: [1, 50, 100][n], other: [2, 60, 110][n] },
          },
          {
            id: `h${n}`,
            category,
            values: { amount: [5, 90, 200][n], other: [6, 95, 210][n] },
          },
        ]),
      },
      baseline: {
        ...base.baseline,
        options: {
          "range-bar": {
            zoom: { enabled: true },
            axes: { category: { reverse: true } },
          },
        },
      },
    };
    const c = full(input);
    const extent = rangeNavigationAutoscale(
      input,
      c,
      [0, 0.3],
      rangeNavigationPolicy(input),
    );
    expect(extent?.length).toBe(2);
    expect(extent![1]).toBeLessThan(20);
  });
  it("resets full windows, keeps empty envelopes, and does not constrain inherited Infinity visible-item counts", () => {
    const input = source();
    const c = full(input);
    const policy = rangeNavigationPolicy(input);
    expect(policy.autoScale).toEqual({
      enabled: true,
      padding: 0.05,
      minVisibleItems: 2,
    });
    expect(rangeNavigationAutoscale(input, c, [0, 1], policy)).toBeUndefined();
    expect(rangeNavigationAutoscale(input, c, [0.45, 0.55], policy)).toBeUndefined();
    const one = rangeNavigationAutoscale(input, c, [0, 0.2], policy);
    expect(one?.length).toBe(2);
    expect(one![0]).toBe(c.valueAxis.fullExtent[0]);
    expect(one![1]).toBeGreaterThan(12);
  });
  it("preserves configured bounds and honors padding only on free ends", () => {
    const base = source();
    const input = {
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-bar": {
            zoom: { enabled: true, autoScaling: { padding: 0.1 } },
            axes: { number: { min: 0, max: 20, nice: false } },
          },
        },
      },
    };
    expect(
      rangeNavigationAutoscale(
        input,
        full(input),
        [0, 0.2],
        rangeNavigationPolicy(input),
      ),
    ).toEqual([0, 20]);
  });
  it("runs literal horizontal endpoint-through-category conversion and retains invalid string category domain", () => {
    const input = source(true);
    const c = full(input);
    const policy = rangeNavigationPolicy(input);
    expect(rangeHorizontalAutoscale(input, c, [0, 0.2], policy)).toBeUndefined();
    const numeric = {
      ...c,
      category: {
        ...c.category,
        kind: "number" as const,
        fullExtent: [0, 20] as const,
        coordinates: [0, 10, 20],
      },
    };
    expect(rangeHorizontalAutoscale(input, numeric, [0, 0.2], policy)).toBeDefined();
  });
});
