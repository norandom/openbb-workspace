import { describe, expect, it } from "vitest";
import { transitionHierarchySetup } from "../../../src/components/General/Table/Chart/application/hierarchySetupTransitions";
import { selectHierarchySetup } from "../../../src/components/General/Table/Chart/application/hierarchySetupSelection";
import type { HierarchySetupTransitionInput } from "../../../src/components/General/Table/Chart/application/hierarchySetupTypes";
function input(): HierarchySetupTransitionInput {
  const columns = [
    { id: "region", label: "Region", role: "category" },
    { id: "desk", label: "Desk", role: "category" },
    { id: "size", label: "Size", role: "number" },
    { id: "color", label: "Color", role: "number" },
    { id: "third", label: "Third", role: "number" },
  ] as const;
  return {
    capture: {
      kind: "hierarchy",
      sourceMode: "flat",
      stateAddress: "s",
      dataRevision: 1,
      originalModel: {},
      selectedRange: {},
      columns: [columns[0], columns[2], columns[3]],
      categoryColumnIds: ["region"],
      selectedColumnIds: ["region", "size", "color"],
      rows: [
        {
          id: "a",
          rawCategoryValues: ["West"],
          categoryPath: ["West"],
          values: { size: 8, color: -4 },
        },
      ],
    },
    availableColumns: columns,
    selection: { categoryIds: ["region"], seriesIds: ["size"], aggFunc: "sum" },
    model: {
      chartType: "treemap",
      aggFunc: "sum",
      switchCategorySeries: true,
      extra: { enabled: true },
      chartOptions: { keep: 4 },
      cellRange: {
        columns: ["region", "size"],
        rowStartIndex: 2,
        rowEndIndex: 8,
        keep: "yes",
      },
    },
    range: {
      columnIds: ["region", "size"],
      rowStartIndex: 2,
      rowEndIndex: 8,
      originalRange: { keep: 42 },
    },
  };
}
function ready<T>(result: { status: string; value?: T }): T {
  expect(result.status).toBe("ready");
  return result.value!;
}
describe("pure hierarchy setup transitions", () => {
  it("selects ordered roles, empty selection and ignores persisted inversion", () => {
    const i = input();
    expect(
      ready(
        selectHierarchySetup(
          i.model,
          { ...i.range, columnIds: ["color", "desk", "region", "size"] },
          i.availableColumns,
        ),
      ),
    ).toEqual({
      categoryIds: ["desk", "region"],
      seriesIds: ["color", "size"],
      aggFunc: "sum",
    });
    expect(
      ready(
        selectHierarchySetup(
          { chartType: "sunburst" },
          { columnIds: [], originalRange: {} },
          i.availableColumns,
        ),
      ),
    ).toEqual({ categoryIds: [], seriesIds: [] });
    for (const model of [
      { chartType: "pie" },
      { chartType: "treemap", aggFunc: false },
      { chartType: "treemap", sourceMode: "grouped" },
    ])
      expect(
        selectHierarchySetup(model as never, i.range, i.availableColumns).status,
      ).toBe("invalid");
    expect(
      selectHierarchySetup(
        i.model,
        { ...i.range, columnIds: ["size", "size"] },
        i.availableColumns,
      ).status,
    ).toBe("invalid");
    expect(
      selectHierarchySetup(i.model, i.range, [
        ...i.availableColumns,
        i.availableColumns[0],
      ]).status,
    ).toBe("invalid");
  });
  it("writes exact range fields and retains numeric capture on category edits", () => {
    const i = input();
    const before = JSON.stringify(i);
    const next = ready(
      transitionHierarchySetup(i, { kind: "category-add", id: "desk" }),
    );
    expect(next.selection.categoryIds).toEqual(["region", "desk"]);
    expect(next.range).toEqual({ ...i.range, columnIds: ["region", "desk", "size"] });
    expect(next.model).toEqual({
      ...i.model,
      cellRange: {
        ...(i.model.cellRange as object),
        columns: ["region", "desk", "size"],
      },
    });
    expect(next.recapture).toEqual({
      categoryColumnIds: ["region", "desk"],
      columnIds: ["region", "desk", "size", "color"],
    });
    expect(next.change).toBe("range");
    expect(JSON.stringify(i)).toBe(before);
    expect(Object.isFrozen(next.model.extra)).toBe(true);
    expect(next.model).not.toBe(i.model);
  });
  it("promotes remaining numeric field, recaptures new numbers, and enforces role/cap", () => {
    const i = input();
    const add = ready(transitionHierarchySetup(i, { kind: "series-add", id: "color" }));
    expect(add.recapture).toBeUndefined();
    const two = { ...i, selection: add.selection, model: add.model, range: add.range };
    const reorder = ready(
      transitionHierarchySetup(two, { kind: "series-order", ids: ["color", "size"] }),
    );
    expect(reorder.recapture).toBeUndefined();
    const removed = ready(
      transitionHierarchySetup(two, { kind: "series-remove", id: "size" }),
    );
    expect(removed.selection.seriesIds).toEqual(["color"]);
    const empty = ready(
      transitionHierarchySetup(i, { kind: "series-remove", id: "size" }),
    );
    expect(empty.selection.seriesIds).toEqual([]);
    expect(
      ready(transitionHierarchySetup(i, { kind: "series-add", id: "third" })).recapture
        ?.columnIds,
    ).toEqual(["region", "size", "third", "color"]);
    expect(
      transitionHierarchySetup(two, { kind: "series-add", id: "third" }).status,
    ).toBe("invalid");
    for (const edit of [
      { kind: "series-add", id: "desk" },
      { kind: "category-add", id: "size" },
      { kind: "series-remove", id: "third" },
      { kind: "series-order", ids: ["size", "size"] },
      { kind: "category-order", ids: [] },
      { kind: "switch-category-series", value: true },
    ])
      expect(transitionHierarchySetup(i, edit as never).status).toBe("invalid");
  });
  it("deletes the own aggregation flag and preserves inactive aggregation after last category removal", () => {
    const i = input();
    const off = ready(transitionHierarchySetup(i, { kind: "aggregate", value: false }));
    expect(Object.hasOwn(off.model, "aggFunc")).toBe(false);
    expect(off.range).toEqual(i.range);
    expect(off.model.chartOptions).toEqual({ keep: 4 });
    expect(off.change).toBe("model");
    const method = ready(
      transitionHierarchySetup(i, { kind: "aggregation-method", value: "count" }),
    );
    expect(method.model.aggFunc).toBe("count");
    const removed = ready(
      transitionHierarchySetup(i, { kind: "category-remove", id: "region" }),
    );
    expect(removed.model.aggFunc).toBe("sum");
    expect(removed.selection.categoryIds).toEqual([]);
    const empty = {
      ...i,
      model: removed.model,
      range: removed.range,
      selection: removed.selection,
      capture: {
        ...i.capture,
        columns: i.capture.columns.filter((c) => c.role === "number"),
        selectedColumnIds: ["size", "color"],
        categoryColumnIds: [],
        rows: i.capture.rows.map((r) => ({
          ...r,
          categoryPath: [],
          rawCategoryValues: [],
        })),
      },
    };
    expect(
      transitionHierarchySetup(empty, { kind: "aggregate", value: true }).status,
    ).toBe("invalid");
    expect(
      ready(transitionHierarchySetup(empty, { kind: "category-add", id: "desk" }))
        .selection.aggFunc,
    ).toBe("sum");
    expect(
      transitionHierarchySetup(
        { ...i, model: off.model, selection: off.selection },
        { kind: "aggregation-method", value: "avg" },
      ).status,
    ).toBe("invalid");
  });
  it("rejects unsafe inputs, stale selection, and category permutation errors", () => {
    const i = input();
    expect(
      transitionHierarchySetup(
        { ...i, selection: { ...i.selection, seriesIds: [] } },
        { kind: "aggregate", value: false },
      ).status,
    ).toBe("invalid");
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Proxy(
            {},
            {
              get() {
                throw 1;
              },
            },
          );
        },
      },
    );
    expect(
      transitionHierarchySetup(hostile as never, { kind: "aggregate", value: true })
        .status,
    ).toBe("invalid");
    expect(
      transitionHierarchySetup(i, { kind: "category-order", ids: ["region"] }).status,
    ).toBe("ready");
  });
});
it("permits recovery edits when current arithmetic overflows", () => {
  const i = input();
  const huge = {
    ...i,
    capture: {
      ...i.capture,
      rows: [0, 1].map((n) => ({
        ...i.capture.rows[0],
        id: String(n),
        values: { size: Number.MAX_VALUE },
      })),
    },
  };
  expect(
    transitionHierarchySetup(huge, { kind: "aggregate", value: false }).status,
  ).toBe("ready");
  expect(
    transitionHierarchySetup(huge, { kind: "series-remove", id: "size" }).status,
  ).toBe("ready");
});
