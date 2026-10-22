import { describe, expect, it, vi } from "vitest";
import { projectRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBarProjection";
import type { RangeBarProjection } from "../../../src/components/General/Table/Chart/echarts/rangeBarTypes";
import {
  rangeCategoryCell,
  rangeCategoryData,
  rangeCategoryEngineCoordinate,
  rangeCategoryExactSlot,
  rangeCategoryTransport,
  rangeContinuousBandwidth,
  resolveRangeCategory,
} from "../../../src/components/General/Table/Chart/echarts/rangeCategoryCoordinates";
import type {
  RangeCategoryInput,
  RangeCategoryStyle,
} from "../../../src/components/General/Table/Chart/echarts/rangeCategoryTypes";
import { rangeInput } from "./rangeBar.fixtures";

const projection = (keys: readonly (number | string)[]): RangeBarProjection => ({
  groups: keys.map((category, slot) => ({ slot, category, rowIds: [`row-${slot}`] })),
  fields: [],
  dataExtent: [],
});
const labels = (p: RangeBarProjection) => p.groups.map((g) => `raw:${g.category}`);
function style(input?: RangeCategoryInput): RangeCategoryStyle {
  return {
    categoryAxis: { fields: { type: input?.kind ?? "category" } },
    band: { paddingInner: 0.3, paddingOuter: 0.15 },
    ...(input ? { categoryCoordinates: input } : {}),
  };
}
function numeric(
  keys: readonly (number | string)[],
  fullExtent: RangeCategoryInput["fullExtent"],
  extra: Partial<RangeCategoryInput> = {},
) {
  const p = projection(keys);
  return resolveRangeCategory(
    style({ kind: "number", fullExtent, ticks: [], ...extra }),
    p,
    labels(p),
    "bar",
  );
}

describe("Range category coordinate foundation", () => {
  it("retains encounter identities, source intervals and family-specific padding", () => {
    const p = projection([0, 100, 1]);
    const before = structuredClone(p);
    expect(rangeCategoryData(p, "number", "bar")).toEqual({
      coordinates: [0, 100, 1],
      observedExtent: [0, 100],
      paddedExtent: [-49.5, 149.5],
      minInterval: 99,
    });
    expect(rangeCategoryData(p, "time", "area")).toMatchObject({
      paddedExtent: [0, 100],
      minInterval: 99,
    });
    expect(p).toEqual(before);
  });

  it("rejects strings without parsing and resets interval adjacency across invalid keys", () => {
    expect(rangeCategoryData(projection([0, "100", 1]), "number", "bar")).toEqual({
      coordinates: [0, null, 1],
      observedExtent: [0, 1],
      paddedExtent: [0, 1],
      minInterval: null,
    });
    expect(rangeCategoryData(projection(["2026-01-01", "1"]), "time", "area")).toEqual({
      coordinates: [null, null],
      observedExtent: [],
      paddedExtent: [],
      minInterval: null,
    });
    expect(rangeCategoryData(projection([8]), "number", "bar").minInterval).toBeNull();
  });

  it("uses projection's numeric grouping without changing the data helper", () => {
    const input = rangeInput();
    input.snapshot.rows[0].category = 1;
    input.snapshot.rows[1].category = "1";
    input.snapshot.rows[3].category = 1;
    const result = projectRangeBar(input.snapshot);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.projection.groups.map((g) => g.category)).toEqual([
      1,
      "1",
      "",
      "last",
    ]);
    expect(rangeCategoryData(result.projection, "number", "bar").coordinates).toEqual([
      1,
      null,
      null,
      null,
    ]);
  });

  it("preserves ordinal fallback domains and prepared labels including empty and singleton", () => {
    for (const keys of [[], ["a"], ["a", "b", "c"]]) {
      const p = projection(keys);
      const plan = resolveRangeCategory(style(), p, labels(p), "area");
      expect(plan.coordinates).toEqual(keys.map((_, i) => i));
      expect(plan.minInterval).toBeNull();
      expect(plan.paddedExtent).toEqual(plan.observedExtent);
      expect(plan.fullExtent).toEqual(keys.length > 1 ? [-0.5, 2.5] : [-0.5, 0.5]);
      expect(rangeCategoryTransport(plan)).toEqual(plan.fullExtent);
      expect(plan.ticks).toEqual(
        keys.map((k, i) => ({ coordinate: i, label: `raw:${k}` })),
      );
    }
    const p = projection(["a", "b"]);
    const s = style();
    const altered = { ...s, band: { paddingInner: 0.2, paddingOuter: 0.3 } };
    expect(resolveRangeCategory(altered, p, labels(p), "bar").fullExtent).toEqual([
      -0.7, 1.7,
    ]);
  });

  it("keeps supplied effective bounds and calendar ticks, cropping only the visible extent", () => {
    const start = Date.UTC(2026, 0, 1);
    const day = 86_400_000;
    const p = projection([start, start + day * 31, start + day * 32]);
    const input: RangeCategoryInput = {
      kind: "time",
      fullExtent: [start - day, start + day * 39],
      visibleRange: [0.25, 0.75],
      ticks: [
        { coordinate: start + day * 9, label: "Jan 10" },
        { coordinate: start + day * 19, label: "Jan 20" },
      ],
    };
    const before = structuredClone(input);
    const plan = resolveRangeCategory(style(input), p, labels(p), "bar");
    expect(plan.fullExtent).toEqual(input.fullExtent);
    expect(plan.visibleExtent).toEqual([start + day * 9, start + day * 29]);
    expect(plan.visibleFraction).toBe(0.5);
    expect(plan.ticks).toEqual(input.ticks);
    expect(input).toEqual(before);
  });

  it("distinguishes explicit empty from singleton domains and preserves raw identities", () => {
    const empty = numeric([0, 100, 1], []);
    expect(rangeCategoryTransport(empty)).toBeNull();
    expect(rangeCategoryCell(empty, 0)).toBeNull();
    expect(rangeCategoryExactSlot(empty, 0)).toBeNull();
    const plan = numeric([8, 9], [8, 8], {
      ticks: [{ coordinate: 8, label: "eight" }],
    });
    expect(plan.fullExtent).toEqual([8, 8]);
    expect(rangeCategoryTransport(plan)).toEqual([0, 1]);
    expect(rangeCategoryEngineCoordinate(plan, 8)).toBe(0.5);
    expect(() => rangeCategoryEngineCoordinate(plan, 9)).toThrow();
    expect(rangeCategoryExactSlot(plan, 0.5)).toBe(0);
    expect(rangeCategoryExactSlot(plan, 8)).toBeNull();
    expect(rangeCategoryCell(plan, 0)).toEqual([8, 8]);
    expect(rangeCategoryCell(plan, 1)).toBeNull();
  });

  it.each([
    { visibleRange: undefined },
    { visibleRange: [0.5, 1] as const },
  ])("preserves supplied endpoints exactly with cancellation-prone bounds and window %j", ({
    visibleRange,
  }) => {
    const plan = numeric([-1e16, 1], [-1e16, 1], {
      ...(visibleRange ? { visibleRange } : {}),
      ticks: [{ coordinate: 1, label: "upper endpoint" }],
    });
    expect(plan.visibleExtent).toEqual(visibleRange ? [-5e15, 1] : [-1e16, 1]);
    expect(rangeCategoryTransport(plan)).toEqual(plan.visibleExtent);
    expect(rangeCategoryExactSlot(plan, 1)).toBe(1);
    expect(rangeCategoryCell(plan, 1)?.[1]).toBe(1);
    expect(plan.ticks).toEqual([{ coordinate: 1, label: "upper endpoint" }]);
  });

  it("resolves exact coordinates and spatial cells independently of encounter order", () => {
    const plan = numeric([0, 100, 1, "50"], [-50, 150]);
    expect(rangeCategoryExactSlot(plan, 100)).toBe(1);
    expect(rangeCategoryExactSlot(plan, 1)).toBe(2);
    expect(rangeCategoryExactSlot(plan, 50)).toBeNull();
    expect(rangeCategoryCell(plan, 0)).toEqual([-50, 0.5]);
    expect(rangeCategoryCell(plan, 1)).toEqual([50.5, 150]);
    expect(rangeCategoryCell(plan, 2)).toEqual([0.5, 50.5]);
    expect(rangeCategoryCell(plan, 3)).toBeNull();
    const cropped = numeric([0, 100, 1], [-50, 150], { visibleRange: [0.25, 0.75] });
    expect(rangeCategoryCell(cropped, 1)).toEqual([50.5, 100]);
    expect(rangeCategoryCell(cropped, -1)).toBeNull();
    expect(rangeCategoryExactSlot(cropped, Number.NaN)).toBeNull();
    expect(
      rangeCategoryCell(
        numeric([0, 100, 1], [-50, 150], { visibleRange: [0.3, 0.7] }),
        0,
      ),
    ).toBeNull();
  });

  it("calculates source bandwidth from the full domain and expanded range", () => {
    const plan = numeric([0, 100, 1], [-49.5, 149.5], { visibleRange: [0.25, 0.75] });
    expect(rangeContinuousBandwidth(plan, 480)).toBeCloseTo(960 / (199 / 99 + 1));
    const crowded = numeric([0, 1], [0, 1000]);
    expect(rangeContinuousBandwidth(crowded, 10)).toBe(1);
    expect(rangeContinuousBandwidth(crowded, 10, 0)).toBeCloseTo(10 / 1001);
    expect(rangeContinuousBandwidth(numeric([8], [0, 1000]), 480)).toBe(480);
    expect(
      rangeContinuousBandwidth(numeric([], [], { visibleRange: [0.2, 0.7] }), 100),
    ).toBeCloseTo(200);
    expect(() => rangeContinuousBandwidth(plan, Number.MAX_VALUE)).toThrow();
    expect(() => rangeContinuousBandwidth(plan, -1)).toThrow();
    expect(() =>
      rangeContinuousBandwidth(plan, 100, Number.POSITIVE_INFINITY),
    ).toThrow();
  });

  it.each([
    { fullExtent: [10, 0] },
    { fullExtent: [0] },
    { fullExtent: [0, 1, 2] },
    { fullExtent: [0, Number.POSITIVE_INFINITY] },
    { fullExtent: [-Number.MAX_VALUE, Number.MAX_VALUE] },
    { visibleRange: [0.5, 0.5] },
    { visibleRange: [-0.1, 1] },
    { visibleRange: [0, 1.1] },
    { visibleRange: [0, 0.5, 1] },
    {
      ticks: [
        { coordinate: 1, label: "one" },
        { coordinate: 1, label: "again" },
      ],
    },
    {
      ticks: [
        { coordinate: 2, label: "two" },
        { coordinate: 1, label: "one" },
      ],
    },
    { ticks: [{ coordinate: 3, label: "outside" }] },
    { ticks: [{ coordinate: 1, label: 1 }] },
    { fullExtent: [], ticks: [{ coordinate: 0, label: "empty" }] },
    { ticks: new Array(1) },
    { fullExtent: new Array(2) },
  ])("rejects malformed resolved category data: %j", (extra) => {
    expect(() => numeric([0, 1, 2], [0, 2], extra as any)).toThrow();
  });

  it("rejects implicit continuous axes, kind mismatches and non-data without getters or mutation", () => {
    const p = projection([0, 1]);
    expect(() =>
      resolveRangeCategory(
        { ...style(), categoryAxis: { fields: { type: "number" } } },
        p,
        labels(p),
        "bar",
      ),
    ).toThrow();
    const input: RangeCategoryInput = { kind: "number", fullExtent: [0, 1], ticks: [] };
    expect(() =>
      resolveRangeCategory(
        { ...style(input), categoryAxis: { fields: { type: "time" } } },
        p,
        labels(p),
        "bar",
      ),
    ).toThrow();
    const read = vi.fn(() => 1);
    const poisoned = {
      kind: "number",
      fullExtent: [0, 1],
      ticks: [
        {
          get coordinate() {
            return read();
          },
          label: "bad",
        },
      ],
    };
    expect(() =>
      resolveRangeCategory(style(poisoned as any), p, labels(p), "bar"),
    ).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(() =>
      numeric([0, 1], [0, 1], {
        ticks: [{ coordinate: 0, label: "x", extra: new Date() } as any],
      }),
    ).toThrow();
    expect(() =>
      rangeCategoryData(
        projection([-Number.MAX_VALUE, Number.MAX_VALUE]),
        "number",
        "bar",
      ),
    ).toThrow();
  });

  it("rejects malformed projection identities and prepared text without executing accessors", () => {
    const p = projection([0, 1]);
    const read = vi.fn(() => 0);
    const groups = [
      {
        get slot() {
          return read();
        },
        category: 0,
        rowIds: [],
      },
    ];
    expect(() => rangeCategoryData({ ...p, groups } as any, "number", "bar")).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(() =>
      rangeCategoryData({ ...p, groups: new Array(2) }, "number", "bar"),
    ).toThrow();
    expect(() => rangeCategoryData(projection([1, 1]), "number", "bar")).toThrow();
    expect(() => resolveRangeCategory(style(), p, new Array(2), "bar")).toThrow();
    expect(() => resolveRangeCategory(style(), p, ["one"], "bar")).toThrow();
    const s = style({
      kind: "number",
      fullExtent: [0, 2],
      visibleRange: [0.25, 0.75],
      ticks: [{ coordinate: 0, label: "outside crop" }],
    });
    expect(() => resolveRangeCategory(s, p, labels(p), "bar")).toThrow();
    const cyclic: any = { kind: "number", fullExtent: [0, 1], ticks: [] };
    cyclic.extra = cyclic;
    expect(() => resolveRangeCategory(style(cyclic), p, labels(p), "bar")).toThrow();
  });
});
