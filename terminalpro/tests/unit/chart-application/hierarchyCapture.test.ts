import type { GridApi } from "ag-grid-community";
import { describe, expect, it, vi } from "vitest";
import { captureDisplayedHierarchy } from "../../../src/components/General/Table/Chart/application/hierarchyCapture";
import type { HierarchyGridCaptureInput } from "../../../src/components/General/Table/Chart/application/hierarchyTypes";
function fixture(): HierarchyGridCaptureInput {
  const rows = [
    { id: "c", region: 1, desk: "", size: -4, color: 0 },
    { id: "a", region: "1", desk: null, size: null },
    { id: "b", region: true, desk: undefined, size: undefined, color: 8 },
  ];
  return {
    api: {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? [] : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (i: number) => rows[i],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue: vi.fn(({ rowNode, colKey }) => rowNode[colKey]),
    } as unknown as GridApi<Record<string, unknown>>,
    stamp: {
      address: { widgetId: "w", stateKey: "s", stateAddress: '["w","s"]' },
      generation: 1,
      dataRevision: 2,
      renderRevision: 3,
    },
    range: {
      columnIds: ["region", "size", "desk", "color"],
      originalRange: { columns: ["region", "size", "desk", "color"] },
    },
    categoryColumnIds: ["region", "desk"],
    columns: [
      { id: "region", label: "Region", role: "category" },
      { id: "desk", label: "Desk", role: "category" },
      { id: "size", label: "Size", role: "number" },
      { id: "color", label: "Color", role: "number" },
    ],
    originalModel: { keep: true },
  };
}
describe("inactive displayed hierarchy capture", () => {
  it("retains displayed order, typed categories, signed and missing observations and stamp", () => {
    const d = fixture();
    expect(captureDisplayedHierarchy(d)).toMatchObject({
      status: "ready",
      stamp: d.stamp,
      value: {
        kind: "hierarchy",
        selectedColumnIds: d.range.columnIds,
        categoryColumnIds: ["region", "desk"],
        originalModel: { keep: true },
        rows: [
          {
            id: "c",
            rawCategoryValues: [1, ""],
            categoryPath: ["1", ""],
            values: { size: -4, color: 0 },
          },
          {
            id: "a",
            rawCategoryValues: ["1", null],
            categoryPath: ["1", null],
            values: { size: null },
          },
          {
            id: "b",
            rawCategoryValues: [true, null],
            categoryPath: ["true", null],
            values: { color: 8 },
          },
        ],
      },
    });
    expect(d.api.getCellValue).toHaveBeenCalledWith(
      expect.objectContaining({ useFormatter: false, colKey: "region" }),
    );
  });
  it("uses reversed selected category order and explicit inclusive bounds", () => {
    const d = fixture();
    Object.assign(d, {
      categoryColumnIds: ["desk", "region"],
      range: {
        ...d.range,
        columnIds: ["desk", "color", "region", "size"],
        rowStartIndex: 1,
        rowEndIndex: 1,
      },
    });
    expect(captureDisplayedHierarchy(d)).toMatchObject({
      status: "ready",
      value: {
        rows: [
          {
            id: "a",
            rawCategoryValues: [null, "1"],
            categoryPath: [null, "1"],
          },
        ],
      },
    });
    expect(d.api.getCellValue).toHaveBeenCalledTimes(4);
  });
  it("supports null full bounds and empty zero category/number captures", () => {
    const d = fixture();
    Object.assign(d.range, { rowStartIndex: null, rowEndIndex: null });
    Object.assign(d, {
      columns: [],
      categoryColumnIds: [],
      range: { ...d.range, columnIds: [] },
    });
    expect(captureDisplayedHierarchy(d)).toMatchObject({
      status: "ready",
      value: {
        rows: [
          { id: "c", categoryPath: [], values: {} },
          { id: "a", categoryPath: [], values: {} },
          { id: "b", categoryPath: [], values: {} },
        ],
      },
    });
  });
  it.each([
    "rowModelType",
    "pivotMode",
    "treeData",
    "pinnedTopRowData",
    "pinnedBottomRowData",
  ])("rejects unsupported grid option %s", (key) => {
    const d = fixture();
    Object.assign(d.api, {
      getGridOption: (k: string) =>
        k === key
          ? key === "rowModelType"
            ? "serverSide"
            : key.includes("Data") && key !== "treeData"
              ? [{}]
              : true
          : k === "rowData"
            ? []
            : undefined,
    });
    expect(captureDisplayedHierarchy(d).status).toBe("unresolved");
    expect(d.api.getCellValue).not.toHaveBeenCalled();
  });
  it.each([
    "rowGroup",
    "pivot",
    "rowGroupIndex",
    "pivotIndex",
    "activeGroup",
    "activePivot",
  ])("guards unselected column %s", (key) => {
    const d = fixture();
    Object.assign(d.api, {
      getColumns: () => [
        {
          getColDef: () => ({ [key]: key.endsWith("Index") ? 0 : true }),
          isRowGroupActive: () => key === "activeGroup",
          isPivotActive: () => key === "activePivot",
        },
      ],
    });
    expect(captureDisplayedHierarchy(d).status).toBe("unresolved");
  });
  it.each([
    { group: true },
    { footer: true },
    { rowPinned: "top" },
    { id: "" },
    undefined,
  ])("rejects invalid displayed node %j", (patch) => {
    const d = fixture();
    Object.assign(d.api, {
      getDisplayedRowAtIndex: () =>
        patch === undefined ? undefined : { id: "x", ...patch },
    });
    expect(captureDisplayedHierarchy(d).status).toBe("unresolved");
  });
  it("rejects duplicate IDs and both API pinned mechanisms", () => {
    for (const patch of [
      { getDisplayedRowAtIndex: () => ({ id: "x" }) },
      { getPinnedTopRowCount: () => 1 },
      { getPinnedBottomRowCount: () => 1 },
    ]) {
      const d = fixture();
      Object.assign(d.api, patch);
      expect(captureDisplayedHierarchy(d).status).toBe("unresolved");
    }
  });
  it.each([{}, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects unsafe raw category without coercion %j",
    (raw) => {
      const d = fixture();
      Object.assign(d.api, { getCellValue: () => raw });
      expect(captureDisplayedHierarchy(d)).toMatchObject({
        status: "unresolved",
        diagnostics: [{ path: ["rows", 0, "rawCategoryValues", 0] }],
      });
    },
  );
  it.each(["4", Number.POSITIVE_INFINITY, {}])(
    "rejects unsupported numeric data %j",
    (raw) => {
      const d = fixture();
      Object.assign(d.api, {
        getCellValue: ({ colKey }: { colKey: string }) =>
          colKey === "size" ? raw : "x",
      });
      expect(captureDisplayedHierarchy(d)).toMatchObject({
        status: "unresolved",
        diagnostics: [{ path: ["rows", 0, "values", "size"] }],
      });
    },
  );
  it("waits for destroyed/data absent and sanitizes hostile API throws", () => {
    for (const patch of [
      { isDestroyed: () => true },
      { getGridOption: () => undefined },
    ]) {
      const d = fixture();
      Object.assign(d.api, patch);
      expect(captureDisplayedHierarchy(d)).toEqual({ status: "waiting" });
    }
    const d = fixture();
    Object.assign(d.api, {
      getDisplayedRowCount: () => {
        throw new Proxy(
          {},
          {
            get() {
              throw 1;
            },
          },
        );
      },
    });
    expect(captureDisplayedHierarchy(d)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ code: "grid-api-failure", path: ["api"] }],
    });
  });
  it("accepts empty full ranges and rejects unsafe counts and invalid inclusive bounds", () => {
    const empty = fixture();
    Object.assign(empty.api, { getDisplayedRowCount: () => 0 });
    expect(captureDisplayedHierarchy(empty)).toMatchObject({
      status: "ready",
      value: { rows: [] },
    });
    expect(empty.api.getCellValue).not.toHaveBeenCalled();
    for (const count of [
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const d = fixture();
      Object.assign(d.api, { getDisplayedRowCount: () => count });
      expect(captureDisplayedHierarchy(d)).toMatchObject({
        status: "unresolved",
        diagnostics: [{ path: ["api", "displayedRowCount"] }],
      });
    }
    for (const [rowStartIndex, rowEndIndex] of [
      [0, 3],
      [2, 1],
      [-1, 0],
      [0.5, 1],
      [0, undefined],
    ]) {
      const d = fixture();
      Object.assign(d.range, { rowStartIndex, rowEndIndex });
      expect(captureDisplayedHierarchy(d).status).toBe("unresolved");
      expect(d.api.getCellValue).not.toHaveBeenCalled();
    }
  });
  it("rejects missing row IDs and missing public methods before reading cells", () => {
    const d = fixture();
    Object.assign(d.api, { getDisplayedRowAtIndex: () => ({}) });
    expect(captureDisplayedHierarchy(d)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ path: ["rows", 0, "id"] }],
    });
    const missing = fixture();
    Object.assign(missing.api, { getColumns: undefined });
    expect(captureDisplayedHierarchy(missing)).toMatchObject({
      status: "invalid",
      diagnostics: [{ path: ["api", "getColumns"] }],
    });
    expect(missing.api.getCellValue).not.toHaveBeenCalled();
  });
});
