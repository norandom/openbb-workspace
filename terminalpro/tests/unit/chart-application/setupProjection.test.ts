import { describe, expect, it } from "vitest";
import {
  retainOrdinarySetupCapture,
  projectOrdinarySetup,
} from "../../../src/components/General/Table/Chart/application/setupProjection";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

function capture(): Omit<ChartSnapshot, "rows" | "columns"> & {
  rows: ChartSnapshot["rows"];
  columns: ChartSnapshot["columns"];
} {
  return {
    stateAddress: '["w","s"]',
    dataRevision: 7,
    sourceMode: "flat",
    originalModel: {
      unknown: { keep: true },
      cellRange: { columns: ["period", "revenue", "income"] },
    },
    selectedRange: {
      columns: ["period", "revenue", "income"],
      rowStartIndex: 1,
      rowEndIndex: 5,
    },
    selectedColumnIds: ["period", "revenue", "income"],
    categoryColumnId: "period",
    columns: [
      { id: "period", label: "Period", role: "category" },
      {
        id: "revenue",
        label: "Revenue",
        role: "number",
        unit: "USD",
        scale: 1_000_000,
      },
      { id: "income", label: "Income", role: "number", unit: "USD", scale: 1_000_000 },
    ],
    rows: [
      { id: "a", category: "Q1", values: { revenue: 100, income: 20 } },
      { id: "b", category: "Q1", values: { revenue: 120, income: 25 } },
      { id: "c", category: "Q2", values: { revenue: -4, income: null } },
      { id: "d", category: "Q2", values: { revenue: 0 } },
    ],
  };
}
function project(
  source = capture(),
  aggFunc?: string,
  switched = false,
  seriesIds = ["revenue", "income"],
) {
  return projectOrdinarySetup(source, {
    categoryId: "period",
    seriesIds,
    ...(aggFunc ? { aggFunc } : {}),
    switchCategorySeries: switched,
  } as Parameters<typeof projectOrdinarySetup>[1]);
}
function ready(result: ReturnType<typeof project>) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("not ready");
  return result.value;
}
describe("ordinary source setup", () => {
  it("retains an independent immutable flat source", () => {
    const source = capture();
    const retained = retainOrdinarySetupCapture(source);
    expect(retained.status).toBe("ready");
    if (retained.status !== "ready") return;
    expect(Object.isFrozen(retained.value.rows[0].values)).toBe(true);
    (source.rows[0].values as Record<string, number>).revenue = 999;
    expect(retained.value.rows[0].values.revenue).toBe(100);
    expect(
      retainOrdinarySetupCapture({ ...source, sourceMode: "grouped" }).status,
    ).toBe("invalid");
  });
  it("aggregates independent columns then transposes; off restores duplicate identities", () => {
    const source = capture();
    const before = JSON.stringify(source);
    const sum = ready(project(source, "sum"));
    expect(sum.snapshot.rows.map((r) => [r.category, r.values])).toEqual([
      ["Q1", { revenue: 220, income: 45 }],
      ["Q2", { revenue: -4, income: null }],
    ]);
    expect(sum.snapshot.sourceMode).toBe("grouped");
    expect(sum.setupProjection).toEqual({ kind: "ordinary-aggregate", aggFunc: "sum" });
    const switched = ready(project(source, "sum", true, ["income", "revenue"]));
    expect(switched.snapshot.rows.map((r) => [r.category, r.values])).toEqual([
      ["Income", { "period:0": 45, "period:1": null }],
      ["Revenue", { "period:0": 220, "period:1": -4 }],
    ]);
    expect(switched.snapshot.sourceMode).toBe("transformed");
    expect(switched.setupProjection).toEqual({
      kind: "ordinary-switch",
      aggFunc: "sum",
    });
    expect(switched.snapshot.originalModel).toEqual(source.originalModel);
    expect(switched.snapshot.selectedRange).toEqual(source.selectedRange);
    expect(switched.snapshot.dataRevision).toBe(7);
    expect(ready(project(source)).snapshot.rows).toEqual(source.rows);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("switch alone retains duplicate category labels and positional bindings", () => {
    const result = ready(project(capture(), undefined, true));
    expect(
      result.snapshot.columns
        .filter((c) => c.role === "number")
        .map((c) => [c.id, c.label]),
    ).toEqual([
      ["period:0", "Q1"],
      ["period:1", "Q1"],
      ["period:2", "Q2"],
      ["period:3", "Q2"],
    ]);
    expect(result.snapshot.rows[0].values).toEqual({
      "period:0": 100,
      "period:1": 120,
      "period:2": -4,
      "period:3": 0,
    });
    expect(Object.hasOwn(result.snapshot.rows[1].values, "period:3")).toBe(false);
  });
  it.each([
    ["sum", 6],
    ["first", null],
    ["last", null],
    ["min", -4],
    ["max", 10],
    ["count", 5],
    ["avg", 2],
  ])("matches source %s for null, negative and zero", (operator, expected) => {
    const source = capture();
    source.rows = [null, -4, 0, 10, null].map((revenue, i) => ({
      id: String(i),
      category: "same",
      values: { revenue, income: null },
    }));
    expect(
      ready(project(source, operator as string)).snapshot.rows[0].values.revenue,
    ).toBe(expected);
  });
  it.each([
    "sum",
    "first",
    "last",
    "min",
    "max",
    "avg",
  ])("keeps all-null %s null", (operator) => {
    const source = capture();
    source.rows = [
      { id: "a", category: "x", values: { revenue: null } },
      { id: "b", category: "x", values: {} },
    ];
    const result = ready(project(source, operator));
    if (operator === "last")
      expect(Object.hasOwn(result.snapshot.rows[0].values, "revenue")).toBe(false);
    else expect(result.snapshot.rows[0].values.revenue).toBeNull();
  });
  it("counts absent endpoints and carries per-value count provenance", () => {
    const result = ready(project(capture(), "count", true));
    expect(result.snapshot.rows[1].values).toEqual({ "period:0": 2, "period:1": 2 });
    expect(result.snapshot.columns[1]).toMatchObject({
      unit: "observation-count",
      scale: 1,
    });
    expect(result.valueOrigins[result.snapshot.rows[1].id]["period:1"]).toMatchObject({
      kind: "count",
      sourceColumnId: "income",
      sourceRowIds: ["c", "d"],
    });
  });
  it("preserves a missing first endpoint through aggregation and inversion", () => {
    const source = capture();
    source.rows = [
      { id: "a", category: "x", values: {} },
      { id: "b", category: "x", values: { revenue: 4, income: -2 } },
    ];
    const first = ready(project(source, "first", true));
    expect(Object.hasOwn(first.snapshot.rows[0].values, "period:0")).toBe(false);
    expect(
      first.valueOrigins[first.snapshot.rows[0].id]["period:0"].sourceRowIds,
    ).toEqual(["a", "b"]);
  });
  it("matches safe coerced category grouping without losing the first value", () => {
    const source = capture();
    source.rows = [
      { id: "a", category: 1, values: { revenue: 2 } },
      { id: "b", category: "1", values: { revenue: 3 } },
      { id: "c", category: "__proto__", values: { revenue: 4 } },
    ];
    expect(
      ready(project(source, "sum")).snapshot.rows.map((r) => [
        r.category,
        r.values.revenue,
      ]),
    ).toEqual([
      [1, 5],
      ["__proto__", 4],
    ]);
  });
  it("preserves unknown metadata and rejects known contradictions before inversion", () => {
    const source = capture();
    source.columns = [
      source.columns[0],
      { ...source.columns[1], unit: "USD", scale: 1 },
      { ...source.columns[2], unit: "percent", scale: 1 },
    ];
    expect(project(source, undefined, true).status).toBe("invalid");
    const counts = ready(project(source, "count", true));
    expect(counts.snapshot.rows.map((r) => r.values)).toEqual([
      { "period:0": 2, "period:1": 2 },
      { "period:0": 2, "period:1": 2 },
    ]);
    const unknown = capture();
    unknown.columns = unknown.columns.map(({ unit: _u, scale: _s, ...c }) => c);
    expect(
      ready(project(unknown, "sum", true)).snapshot.columns[1].unit,
    ).toBeUndefined();
    expect(ready(project(unknown)).axisUnits).toBe("unknown");
  });
  it("rejects invalid selection, unknown operator, nonflat source and overflowing arithmetic", () => {
    expect(project(capture(), "median").status).toBe("invalid");
    expect(project(capture(), undefined, false, ["missing"]).status).toBe("invalid");
    expect(project(capture(), undefined, false, ["revenue", "revenue"]).status).toBe(
      "invalid",
    );
    expect(project({ ...capture(), sourceMode: "pivot" }).status).toBe("invalid");
    const huge = capture();
    huge.rows = [1, 2].map((id) => ({
      id: String(id),
      category: "x",
      values: { revenue: Number.MAX_VALUE },
    }));
    expect(project(huge, "sum").status).toBe("invalid");
  });
});
