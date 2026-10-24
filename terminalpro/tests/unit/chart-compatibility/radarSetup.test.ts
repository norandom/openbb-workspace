import { describe, expect, it } from "vitest";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import type {
  ChartSnapshot,
  SnapshotPolicy,
} from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

function project(
  aggFunc?: "sum" | "count" | "first" | "last",
  switched = false,
  seriesIds = ["b", "a"],
  overflow = false,
) {
  const source: ChartSnapshot = {
    stateAddress: "s",
    dataRevision: 1,
    sourceMode: "flat",
    originalModel: {},
    selectedRange: {},
    selectedColumnIds: ["category", "a", "b"],
    categoryColumnId: "category",
    columns: [
      { id: "category", label: "Category", role: "category" },
      { id: "a", label: "A", role: "number", unit: "USD" },
      { id: "b", label: "B", role: "number", unit: "EUR" },
    ],
    rows: [
      {
        id: "x",
        category: 1,
        values: { a: overflow ? Number.MAX_VALUE : 10, b: null },
      },
      { id: "y", category: "1", values: { a: overflow ? Number.MAX_VALUE : -5, b: 3 } },
      { id: "z", category: "Q2", values: { a: 0 } },
    ],
  };
  return projectOrdinarySetup(
    source,
    {
      categoryId: "category",
      seriesIds,
      switchCategorySeries: switched,
      ...(aggFunc ? { aggFunc } : {}),
    },
    "radar-observations" as SnapshotPolicy,
  );
}
function ready(result: ReturnType<typeof project>) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected ready Radar setup");
  return result.value.snapshot;
}
describe("Radar setup projection", () => {
  it("preserves duplicate labels, stable identities and selected field order without unit rejection", () => {
    const snapshot = ready(project());
    expect(snapshot.rows.map((r) => r.id)).toEqual(["x", "y", "z"]);
    expect(snapshot.selectedColumnIds).toEqual(["category", "b", "a"]);
  });
  it("aggregates property keys before inversion and preserves field order", () => {
    const snapshot = ready(project("sum", true));
    expect(snapshot.rows.map((r) => r.category)).toEqual(["B", "A"]);
    expect(snapshot.rows.map((r) => Object.values(r.values))).toEqual([
      [3, null],
      [5, 0],
    ]);
    expect(snapshot.columns.slice(1).map((c) => c.label)).toEqual(["1", "Q2"]);
  });
  it("keeps repeated category series distinct when inverted without aggregation", () => {
    const snapshot = ready(project(undefined, true));
    expect(snapshot.columns.slice(1).map((c) => c.label)).toEqual(["1", "1", "Q2"]);
    expect(new Set(snapshot.columns.map((c) => c.id)).size).toBe(4);
  });
  it.each([false, true])("accepts empty series selection switched=%s", (switched) => {
    const snapshot = ready(project(undefined, switched, []));
    expect(snapshot.selectedColumnIds).toHaveLength(1);
    expect(snapshot.rows.every((r) => !Object.keys(r.values).length)).toBe(true);
  });
  it("keeps aggregation overflow missing rather than rejecting the snapshot", () => {
    expect(ready(project("sum", false, ["a"], true)).rows[0].values.a).toBeNull();
  });
  it("preserves null/absent endpoints and count semantics", () => {
    expect(ready(project("first")).rows[0].values.b).toBeNull();
    expect(ready(project("last")).rows[1].values).not.toHaveProperty("b");
    expect(ready(project("count")).rows[0].values.b).toBe(2);
  });
});
