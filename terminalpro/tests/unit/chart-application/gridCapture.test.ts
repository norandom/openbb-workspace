import type { GridApi } from "ag-grid-community";
import { describe, expect, it, vi } from "vitest";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import type { GridCaptureInput } from "../../../src/components/General/Table/Chart/application/types";

function input(): GridCaptureInput {
  const rows = [{ id: "a" }, { id: "b" }];
  const api = {
    isDestroyed: () => false,
    getGridOption: (key: string) => (key === "rowData" ? [] : undefined),
    getDisplayedRowCount: () => 2,
    getDisplayedRowAtIndex: (index: number) => rows[index],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: vi.fn(({ colKey }: { colKey: string }) =>
      colKey === "period" ? "Q1" : -0.25,
    ),
  } as unknown as GridApi<Record<string, unknown>>;
  return {
    api,
    stamp: {
      address: { widgetId: "w", stateKey: "s", stateAddress: '["w","s"]' },
      generation: 1,
      dataRevision: 2,
      renderRevision: 3,
    },
    range: {
      columnIds: ["value", "period"],
      originalRange: { columns: ["value", "period", "hidden"] },
    },
    categoryColumnId: "period",
    columns: [
      { id: "period", label: "Period", role: "category" },
      {
        id: "value",
        label: "Value",
        role: "number",
        unit: "dimensionless",
        scale: 1,
        metadata: { source: ["fixture"] },
      },
    ],
    originalModel: { nested: { keep: true } },
  };
}
function changeApi(data: GridCaptureInput, patch: object) {
  Object.assign(data.api, patch);
}
describe("ordinary displayed capture contract", () => {
  it("retains original null full-range endpoints without coercing them to row zero", () => {
    const data = input();
    Object.assign(data.range, {
      rowStartIndex: null,
      rowEndIndex: null,
      originalRange: {
        columns: ["period", "value"],
        rowStartIndex: null,
        rowEndIndex: null,
      },
    });
    expect(captureDisplayedChart(data)).toMatchObject({
      status: "ready",
      value: {
        rows: [{ id: "a" }, { id: "b" }],
        selectedRange: { rowStartIndex: null, rowEndIndex: null },
      },
    });
  });
  it("numbers the default category within a filtered/sorted inclusive range and reads raw values", () => {
    const data = input();
    const rows = [
      { id: "source-c", value: -12 },
      { id: "source-a", value: 0 },
      { id: "source-d", value: 50 },
    ];
    Object.assign(data, {
      categoryColumnId: "AG-GRID-DEFAULT-CATEGORY",
      columns: [
        { id: "AG-GRID-DEFAULT-CATEGORY", label: "(None)", role: "category" },
        { id: "value", label: "Value", role: "number" },
      ],
      range: {
        columnIds: ["AG-GRID-DEFAULT-CATEGORY", "value"],
        rowStartIndex: 1,
        rowEndIndex: 2,
        originalRange: { columns: ["value"], rowStartIndex: 1, rowEndIndex: 2 },
      },
    });
    changeApi(data, {
      getDisplayedRowCount: () => 3,
      getDisplayedRowAtIndex: (index: number) => rows[index],
      getCellValue: vi.fn(({ rowNode, colKey }) => rowNode[colKey]),
    });
    const result = captureDisplayedChart(data);
    expect(result).toMatchObject({
      status: "ready",
      value: {
        rows: [
          { id: "source-a", category: 1, values: { value: 0 } },
          { id: "source-d", category: 2, values: { value: 50 } },
        ],
      },
    });
    expect(data.api.getCellValue).toHaveBeenCalledTimes(2);
    expect(data.api.getCellValue).toHaveBeenCalledWith(
      expect.objectContaining({ colKey: "value", useFormatter: false }),
    );
  });
  it("preserves order, duplicate categories, provenance and independent copies", () => {
    const data = input();
    const before = JSON.stringify({ ...data, api: null });
    const result = captureDisplayedChart(data);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.stamp).toBe(data.stamp);
    expect(result.value.selectedColumnIds).toEqual(["value", "period"]);
    expect(result.value.rows).toEqual([
      { id: "a", category: "Q1", values: { value: -0.25 } },
      { id: "b", category: "Q1", values: { value: -0.25 } },
    ]);
    expect(result.value.selectedRange).toEqual(data.range.originalRange);
    expect(result.value.originalModel).not.toBe(data.originalModel);
    expect(result.value.columns[1].metadata).not.toBe(data.columns[1].metadata);
    expect(result.value.selectedRange).not.toBe(data.range.originalRange);
    expect(JSON.stringify({ ...data, api: null })).toBe(before);
    expect(data.api.getCellValue).toHaveBeenCalledWith(
      expect.objectContaining({ useFormatter: false }),
    );
  });
  it("distinguishes destroyed/loading from ready-empty", () => {
    const data = input();
    changeApi(data, { isDestroyed: () => true });
    expect(captureDisplayedChart(data).status).toBe("waiting");
    changeApi(data, { isDestroyed: () => false, getGridOption: () => undefined });
    expect(captureDisplayedChart(data).status).toBe("waiting");
    changeApi(data, {
      getGridOption: (key: string) => (key === "rowData" ? [] : undefined),
      getDisplayedRowCount: () => 0,
    });
    expect(captureDisplayedChart(data)).toMatchObject({
      status: "ready",
      value: { rows: [] },
    });
  });
  it.each([
    { rowStartIndex: 0 },
    { rowEndIndex: 1 },
    { rowStartIndex: 1, rowEndIndex: 0 },
    { rowStartIndex: 0, rowEndIndex: 2 },
    { rowStartIndex: -1, rowEndIndex: 0 },
    { rowStartIndex: 0.5, rowEndIndex: 1 },
  ])("rejects unsupported bounds %j", (bounds) => {
    const data = input();
    Object.assign(data.range, bounds);
    expect(captureDisplayedChart(data).status).toBe("unresolved");
  });
  it("rejects malformed shape and bounds", () => {
    expect(captureDisplayedChart(null as unknown as GridCaptureInput).status).toBe(
      "invalid",
    );
    const data = input();
    Object.assign(data.range, { rowStartIndex: "0", rowEndIndex: 1 });
    expect(captureDisplayedChart(data).status).toBe("invalid");
  });
  it.each([undefined, "", "same"])("rejects absent/duplicate stable IDs %s", (id) => {
    const data = input();
    changeApi(data, { getDisplayedRowAtIndex: () => ({ id }) });
    expect(captureDisplayedChart(data).status).toBe("unresolved");
  });
  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "12%",
    {},
    true,
  ])("never parses or substitutes unsupported numeric %s", (value) => {
    const data = input();
    changeApi(data, {
      getCellValue: ({ colKey }: { colKey: string }) =>
        colKey === "period" ? "Q1" : value,
    });
    expect(captureDisplayedChart(data).status).toBe("unresolved");
  });
  it.each([
    null,
    {},
    undefined,
    Number.POSITIVE_INFINITY,
  ])("rejects unsupported categories %s", (value) => {
    const data = input();
    changeApi(data, { getCellValue: () => value });
    expect(captureDisplayedChart(data).status).toBe("unresolved");
  });
  it.each([0, -2.5, null])("preserves numeric %s", (value) => {
    const data = input();
    changeApi(data, {
      getCellValue: ({ colKey }: { colKey: string }) =>
        colKey === "period" ? 1 : value,
    });
    expect(captureDisplayedChart(data)).toMatchObject({
      status: "ready",
      value: { rows: [{ values: { value } }, { values: { value } }] },
    });
  });
  it.each([
    { group: true },
    { rowPinned: "top" },
    { footer: true },
  ])("rejects nonordinary nodes %j", (node) => {
    const data = input();
    changeApi(data, { getDisplayedRowAtIndex: () => ({ id: "x", ...node }) });
    expect(captureDisplayedChart(data).status).toBe("unresolved");
  });
  it.each([
    "rowModelType",
    "pivotMode",
    "treeData",
    "pinnedTopRowData",
  ])("detects unsupported mode %s", (mode) => {
    const data = input();
    changeApi(data, {
      getGridOption: (key: string) =>
        key === mode
          ? mode === "rowModelType"
            ? "infinite"
            : mode === "pinnedTopRowData"
              ? [{}]
              : true
          : key === "rowData"
            ? []
            : undefined,
    });
    expect(captureDisplayedChart(data).status).toBe("unresolved");
  });
  it("keeps unexpected API failures bounded and private", () => {
    const data = input();
    changeApi(data, {
      getCellValue: () => {
        throw new Error("PRIVATE".repeat(1000));
      },
    });
    const result = captureDisplayedChart(data);
    expect(result.status).toBe("unresolved");
    expect(JSON.stringify(result).length).toBeLessThan(500);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("delegates malformed snapshot metadata to the accepted validator", () => {
    const data = input();
    Object.assign(data.columns[1], { scale: 0 });
    expect(captureDisplayedChart(data).status).toBe("invalid");
  });
});

it("does not mistake hostile API throws for validator diagnostics", () => {
  const data = input();
  changeApi(data, {
    getCellValue: () => {
      throw {
        valid: false,
        diagnostics: [{ message: "PRIVATE".repeat(1000), account: { secret: true } }],
      };
    },
  });
  const result = captureDisplayedChart(data);
  expect(result.status).toBe("unresolved");
  expect(JSON.stringify(result).length).toBeLessThan(500);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

it("never calls mutation, persistence or visibility APIs", () => {
  const data = input();
  const write = vi.fn(() => {
    throw new Error("unexpected write");
  });
  changeApi(data, {
    setGridOption: write,
    applyColumnState: write,
    setFilterModel: write,
    getAllDisplayedColumns: write,
  });
  expect(captureDisplayedChart(data).status).toBe("ready");
  expect(write).not.toHaveBeenCalled();
});
it("uses accepted stamp validation and structural snapshot paths", () => {
  const data = input();
  Object.assign(data.stamp, { generation: 0 });
  expect(captureDisplayedChart(data).status).toBe("invalid");
  const second = input();
  Object.assign(second.columns[1], { metadata: { bad: undefined } });
  const result = captureDisplayedChart(second);
  expect(result.status).toBe("invalid");
  if (result.status === "invalid")
    expect(result.diagnostics[0].path).toEqual(["columns", 1, "metadata", "bad"]);
});
it("detects active grouped columns and pinned row counters", () => {
  const data = input();
  changeApi(data, {
    getColumns: () => [
      {
        getColDef: () => ({}),
        isRowGroupActive: () => true,
        isPivotActive: () => false,
      },
    ],
  });
  expect(captureDisplayedChart(data).status).toBe("unresolved");
  changeApi(data, { getColumns: () => [], getPinnedBottomRowCount: () => 1 });
  expect(captureDisplayedChart(data).status).toBe("unresolved");
});
it("rejects missing displayed rows rather than raw fallback", () => {
  const data = input();
  changeApi(data, { getDisplayedRowAtIndex: () => undefined });
  expect(captureDisplayedChart(data).status).toBe("unresolved");
});

it("contains revoked Proxy exceptions from public grid behavior", () => {
  const data = input();
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  changeApi(data, {
    getCellValue: () => {
      throw proxy;
    },
  });
  expect(captureDisplayedChart(data)).toEqual({
    status: "unresolved",
    diagnostics: [
      {
        code: "grid-api-failure",
        path: ["api"],
        message: "Grid capture could not read public API values",
      },
    ],
  });
});
it("never traverses prototypes of thrown grid objects", () => {
  const data = input();
  const getPrototypeOf = vi.fn(() => {
    throw new Error("PRIVATE trap");
  });
  const thrown = new Proxy({}, { getPrototypeOf });
  changeApi(data, {
    getCellValue: () => {
      throw thrown;
    },
  });
  const result = captureDisplayedChart(data);
  expect(result.status).toBe("unresolved");
  expect(JSON.stringify(result).length).toBeLessThan(500);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(getPrototypeOf).not.toHaveBeenCalled();
});
