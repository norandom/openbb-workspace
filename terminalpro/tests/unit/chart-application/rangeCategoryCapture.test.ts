import {
  AllCommunityModule,
  createGrid,
  type GridApi,
  ModuleRegistry,
} from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import {
  projectOrdinarySetup,
  retainOrdinarySetupCapture,
} from "../../../src/components/General/Table/Chart/application/setupProjection";
import {
  DEFAULT_SETUP_CATEGORY,
  type SetupResult,
  type SetupSelection,
} from "../../../src/components/General/Table/Chart/application/setupTypes";
import type {
  GridCaptureInput,
  SessionResult,
} from "../../../src/components/General/Table/Chart/application/types";
import { resolveRangeCategoryKind } from "../../../src/components/General/Table/Chart/compatibility/rangeCategoryProvenance";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

ModuleRegistry.registerModules([AllCommunityModule]);
const epoch = 1704067200000;
let api: GridApi<Record<string, unknown>> | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(async () => {
  try {
    api?.destroy();
    api = undefined;
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
function ready<T>(result: SessionResult<T> | SetupResult<T>): T {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value;
}
async function grid(
  categories: readonly unknown[],
  metadata?: unknown,
  override?: unknown,
) {
  const getter = vi.fn(
    ({ data }: { data?: Record<string, unknown> }) => data?.category,
  );
  const gridApi = createGrid<Record<string, unknown>>(host, {
    theme: "legacy",
    rowData: categories.map((category, i) => ({
      id: String(i),
      category,
      value: i + 1,
    })),
    getRowId: ({ data }) => String(data.id),
    columnDefs: [
      {
        colId: "category",
        valueGetter: getter,
        cellDataType: false,
        chartDataType: metadata,
      } as never,
      { field: "value", cellDataType: false, filter: "agNumberColumnFilter" },
    ],
  });
  api = gridApi;
  await vi.waitFor(() =>
    expect(gridApi.getDisplayedRowCount()).toBe(categories.length),
  );
  getter.mockClear();
  const input: GridCaptureInput = {
    api: gridApi,
    snapshotPolicy: "statistical-observations",
    stamp: {
      address: { widgetId: "w", stateKey: "r", stateAddress: '["w","r"]' },
      generation: 1,
      dataRevision: 7,
      renderRevision: 1,
    },
    range: { columnIds: ["category", "value"], originalRange: {} },
    categoryColumnId: "category",
    columns: [
      { id: "category", label: "Period", role: "category" },
      { id: "value", label: "Value", role: "number" },
    ],
    originalModel:
      override === undefined ? {} : ({ categoryAxisType: override } as never),
  };
  return { input, getter };
}
function facts(
  kind = "time",
  firstCategoryIsDate = true,
  columnChartDataType: unknown = null,
) {
  return {
    categoryColumnId: "category",
    columnChartDataType,
    firstCategoryIsDate,
    kind,
  };
}

describe("Range raw category provenance", () => {
  it.each([
    [new Date(epoch), undefined, undefined, "time", true],
    [epoch, undefined, undefined, "category", false],
    ["2024-01-01", undefined, undefined, "category", false],
    ["A", "time", undefined, "time", false],
    ["A", "number", undefined, "number", false],
    [new Date(epoch), "category", undefined, "category", true],
    [new Date(epoch), "time", "number", "number", true],
    [new Date(epoch), "number", "category", "category", true],
    ["A", "number", "time", "time", false],
    ["A", "number", null, "number", false],
    ["A", "number", "", "category", false],
    [new Date(epoch), "number", "", "time", true],
    [new Date(epoch), "", undefined, "time", true],
    [new Date(epoch), "other", undefined, "category", true],
  ])("captures raw %s, metadata %s and override %s", async (category, metadata, override, kind, isDate) => {
    const raw = typeof category === "object" ? new Date(epoch) : category;
    const { input, getter } = await grid([raw], metadata, override);
    const snapshot = ready(captureDisplayedChart(input));
    expect(snapshot).toHaveProperty(
      "rangeCategory",
      facts(kind as string, isDate as boolean, metadata ?? null),
    );
    expect(snapshot.rows[0].category).toBe(isDate ? epoch : category);
    expect(getter).toHaveBeenCalledTimes(1);
  });
  it("uses the first selected displayed row after filter/sort and reads each category once", async () => {
    const { input, getter } = await grid(["excluded", new Date(epoch), "later"]);
    input.api.setFilterModel({
      value: { filterType: "number", type: "greaterThan", filter: 1 },
    });
    input.api.applyColumnState({ state: [{ colId: "value", sort: "desc" }] });
    await vi.waitFor(() => expect(input.api.getDisplayedRowCount()).toBe(2));
    getter.mockClear();
    const snapshot = ready(
      captureDisplayedChart({
        ...input,
        range: { ...input.range, rowStartIndex: 1, rowEndIndex: 1 },
      }),
    );
    expect(snapshot.rows.map((row) => row.id)).toEqual(["1"]);
    expect(snapshot).toHaveProperty("rangeCategory", facts());
    expect(getter).toHaveBeenCalledTimes(1);
  });
  it("ignores later-only Dates and records empty/default captures without source column evidence", async () => {
    const { input, getter } = await grid([epoch, new Date(epoch)]);
    expect(ready(captureDisplayedChart(input))).toHaveProperty(
      "rangeCategory",
      facts("category", false),
    );
    const synthetic = {
      ...input,
      categoryColumnId: DEFAULT_SETUP_CATEGORY,
      columns: [
        { id: DEFAULT_SETUP_CATEGORY, label: "", role: "category" as const },
        input.columns[1],
      ],
      range: { ...input.range, columnIds: [DEFAULT_SETUP_CATEGORY, "value"] },
    };
    getter.mockClear();
    expect(ready(captureDisplayedChart(synthetic))).toHaveProperty("rangeCategory", {
      ...facts("category", false),
      categoryColumnId: DEFAULT_SETUP_CATEGORY,
    });
    expect(getter).not.toHaveBeenCalled();
    input.api.setGridOption("rowData", []);
    expect(ready(captureDisplayedChart(input))).toHaveProperty(
      "rangeCategory",
      facts("category", false),
    );
  });
  it.each([
    [false, undefined, ["rangeCategory", "columnChartDataType"]],
    [undefined, 7, ["originalModel", "categoryAxisType"]],
  ])("rejects malformed metadata %s/override %s explicitly", async (metadata, override, path) => {
    const { input } = await grid([new Date(epoch)], metadata, override);
    expect(captureDisplayedChart(input)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ path }],
    });
  });
  it("requires the actual selected column and leaves Box behavior unchanged", async () => {
    const { input } = await grid([new Date(epoch)], false);
    expect(
      ready(captureDisplayedChart({ ...input, snapshotPolicy: "box-observations" })),
    ).not.toHaveProperty("rangeCategory");
    input.api.setGridOption("columnDefs", [{ field: "value" }]);
    expect(captureDisplayedChart(input)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ path: ["rangeCategory", "categoryColumnId"] }],
    });
  });
  it("resolves a newer editor override using retained facts without changing captured kind", async () => {
    const { input } = await grid([new Date(epoch)], "number");
    const captured = ready(captureDisplayedChart(input));
    expect(captured.rangeCategory).toEqual(facts("number", true, "number"));
    const retained = captured.rangeCategory!;
    expect(resolveRangeCategoryKind(retained, "time")).toEqual({
      valid: true,
      kind: "time",
    });
    expect(resolveRangeCategoryKind(retained, "category")).toEqual({
      valid: true,
      kind: "category",
    });
    expect(retained.kind).toBe("number");
  });
  it.each([
    undefined,
    "count",
    "first",
    "last",
    "sum",
    "avg",
    "min",
    "max",
  ] as const)("retains capture facts through %s setup without inferring from epoch representatives", async (aggFunc) => {
    const { input } = await grid([new Date(epoch), epoch]);
    const captured = ready(captureDisplayedChart(input));
    const retained = ready(
      retainOrdinarySetupCapture(captured, "statistical-observations"),
    );
    const result = ready(
      projectOrdinarySetup(
        retained,
        {
          categoryId: "category",
          seriesIds: ["value"],
          aggFunc: aggFunc as SetupSelection["aggFunc"],
          switchCategorySeries: false,
        },
        "statistical-observations",
      ),
    );
    expect(result.snapshot).toHaveProperty("rangeCategory", facts());
    expect(result.snapshot.rows.every((row) => row.category === epoch)).toBe(true);
    expect(result.snapshot.sourceMode).toBe(aggFunc === undefined ? "flat" : "grouped");
    expect(
      Object.isFrozen(
        (retained as ChartSnapshot & { rangeCategory: object }).rangeCategory,
      ),
    ).toBe(true);
  });
});

describe("Range snapshot provenance admission", () => {
  async function snapshot() {
    const { input } = await grid([new Date(epoch)]);
    return ready(captureDisplayedChart(input));
  }
  it("detaches valid facts and accepts legacy snapshots without the optional member", async () => {
    const captured = await snapshot();
    const provenance = facts();
    const result = validateSnapshot(
      { ...captured, rangeCategory: provenance },
      "statistical-observations",
    );
    expect(result.valid).toBe(true);
    provenance.kind = "number";
    if (result.valid) expect(result.snapshot).toHaveProperty("rangeCategory", facts());
    const { rangeCategory: _omitted, ...legacy } = {
      ...captured,
      rangeCategory: facts(),
    };
    expect(validateSnapshot(legacy, "statistical-observations").valid).toBe(true);
  });
  it.each([
    [null, ["rangeCategory"]],
    [{ ...facts(), categoryColumnId: "stale" }, ["rangeCategory", "categoryColumnId"]],
    [
      { ...facts(), firstCategoryIsDate: "true" },
      ["rangeCategory", "firstCategoryIsDate"],
    ],
    [{ ...facts(), columnChartDataType: 2 }, ["rangeCategory", "columnChartDataType"]],
    [{ ...facts(), kind: "number" }, ["rangeCategory", "kind"]],
    [{ ...facts(), kind: "grouped-category" }, ["rangeCategory", "kind"]],
    ...Object.keys(facts()).map((key): [unknown, string[]] => [
      Object.fromEntries(Object.entries(facts()).filter(([name]) => name !== key)),
      ["rangeCategory", key],
    ]),
  ])("rejects malformed presence %j", async (rangeCategory, path) => {
    expect(
      validateSnapshot(
        { ...(await snapshot()), rangeCategory },
        "statistical-observations",
      ),
    ).toMatchObject({ valid: false, diagnostics: [{ path }] });
  });
  it("rejects getter/cyclic facts before semantic reads and invalidates malformed model overrides", async () => {
    const captured = await snapshot();
    const getter = vi.fn(() => true);
    const provenance = Object.defineProperty(facts(), "firstCategoryIsDate", {
      enumerable: true,
      get: getter,
    });
    expect(validateSnapshot({ ...captured, rangeCategory: provenance }).valid).toBe(
      false,
    );
    expect(getter).not.toHaveBeenCalled();
    const cyclic = { ...facts(), cycle: {} };
    cyclic.cycle = cyclic;
    expect(validateSnapshot({ ...captured, rangeCategory: cyclic }).valid).toBe(false);
    expect(
      validateSnapshot({
        ...captured,
        rangeCategory: facts(),
        originalModel: { categoryAxisType: false },
      }),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ path: ["originalModel", "categoryAxisType"] }],
    });
  });
});
