import {
  AllCommunityModule,
  createGrid,
  type GridApi,
  ModuleRegistry,
} from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateBoxSetupRows } from "../../../src/components/General/Table/Chart/application/boxPlotSetupProjection";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import { observationSnapshotPolicy } from "../../../src/components/General/Table/Chart/application/histogramCapture";
import {
  projectOrdinarySetup,
  retainOrdinarySetupCapture,
} from "../../../src/components/General/Table/Chart/application/setupProjection";
import {
  DEFAULT_SETUP_CATEGORY,
  SETUP_AGGREGATIONS,
  type SetupResult,
  type SetupSelection,
} from "../../../src/components/General/Table/Chart/application/setupTypes";
import type {
  GridCaptureInput,
  SessionResult,
} from "../../../src/components/General/Table/Chart/application/types";
import { calculateBoxSummary } from "../../../src/components/General/Table/Chart/compatibility/boxSummary";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import type {
  ChartSnapshot,
  SnapshotPolicy,
} from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

ModuleRegistry.registerModules([AllCommunityModule]);
const policy = "box-observations" as SnapshotPolicy;
const epoch = 1704067200000;
function source(
  values: readonly (number | null | undefined)[],
  categories: readonly (string | number)[] = values.map(() => "A"),
  keys: readonly string[] = categories.map(String),
): ChartSnapshot {
  return {
    stateAddress: '["w","box"]',
    dataRevision: 7,
    sourceMode: "flat",
    originalModel: { chartType: "boxPlot", extension: { retained: true } },
    selectedRange: { columns: ["category", "value"], rowStartIndex: 2, rowEndIndex: 8 },
    categoryColumnId: "category",
    selectedColumnIds: ["category", "value", "second"],
    columns: [
      { id: "category", label: "Period", role: "category" },
      { id: "value", label: "Revenue", role: "number", unit: "USD", scale: 1_000_000 },
      {
        id: "second",
        label: "Margin",
        role: "number",
        unit: "dimensionless",
        scale: 0.01,
      },
    ],
    rows: values.map((value, i) => ({
      id: String(i),
      category: categories[i],
      boxPlotAggregationKey: keys[i],
      values: { ...(value === undefined ? {} : { value }), second: i },
    })),
  };
}
function project(
  input: ChartSnapshot,
  aggFunc?: SetupSelection["aggFunc"],
  seriesIds: readonly string[] = ["value"],
) {
  return projectOrdinarySetup(
    input,
    {
      categoryId: input.categoryColumnId,
      seriesIds,
      aggFunc,
      switchCategorySeries: false,
    },
    "box-observations" as Parameters<typeof projectOrdinarySetup>[2],
  );
}
function ready<T>(result: SetupResult<T> | SessionResult<T>): T {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value;
}
function projected(
  input: ChartSnapshot,
  aggFunc?: SetupSelection["aggFunc"],
  seriesIds?: readonly string[],
) {
  return ready(project(input, aggFunc, seriesIds));
}
function observations(input: ChartSnapshot, aggFunc?: SetupSelection["aggFunc"]) {
  return projected(input, aggFunc).snapshot.rows.map((row) => row.values.value);
}

describe("inactive Box snapshot and projection policy", () => {
  it("admits Box by policy lookup and requires detached own string raw keys including empty", () => {
    expect(observationSnapshotPolicy("boxPlot")).toBe("box-observations");
    const input = source([1], [""], [""]);
    const checked = validateSnapshot(input, policy);
    expect(checked.valid).toBe(true);
    if (!checked.valid) return;
    expect(checked.snapshot.rows[0]).not.toBe(input.rows[0]);
    for (const key of [undefined, 1, null]) {
      const row = { ...input.rows[0], boxPlotAggregationKey: key };
      if (key === undefined) delete row.boxPlotAggregationKey;
      expect(validateSnapshot({ ...input, rows: [row] }, policy)).toMatchObject({
        valid: false,
        diagnostics: [
          { code: "invalid-snapshot", path: ["rows", 0, "boxPlotAggregationKey"] },
        ],
      });
      if (key === undefined)
        expect(validateSnapshot({ ...input, rows: [row] }).valid).toBe(true);
    }
    const getter = vi.fn(() => "A");
    const hostile = { ...input.rows[0] };
    Object.defineProperty(hostile, "boxPlotAggregationKey", {
      enumerable: true,
      get: getter,
    });
    expect(validateSnapshot({ ...input, rows: [hostile] }, policy)).toMatchObject({
      valid: false,
      diagnostics: [{ path: ["rows", 0, "boxPlotAggregationKey"] }],
    });
    expect(getter).not.toHaveBeenCalled();
  });
  it("retains empty selection, rejects switch and invalid selections, and never consumes an aggregate twice", () => {
    const input = source([1, 2]);
    const empty = { ...input, selectedColumnIds: ["category"] };
    expect(validateSnapshot(empty, policy).valid).toBe(true);
    expect(retainOrdinarySetupCapture(empty, policy).status).toBe("ready");
    expect(projected(empty, undefined, []).snapshot.rows.map((r) => r.values)).toEqual([
      {},
      {},
    ]);
    expect(project(input, "sum", ["value", "value"]).status).toBe("invalid");
    expect(project(input, undefined, ["unknown"]).status).toBe("invalid");
    expect(
      projectOrdinarySetup(
        input,
        { categoryId: "category", seriesIds: ["value"], switchCategorySeries: true },
        policy,
      ).status,
    ).toBe("invalid");
    expect(project(projected(input, "sum").snapshot, "sum").status).toBe("invalid");
    expect(observations(source([]), "count")).toEqual([]);
  });
  it("keeps ordinary/Pie/Histogram representative numerical results and ordinary default restrictions", () => {
    for (const axis of [
      "single-axis",
      "pie-observations",
      "histogram-observations",
    ] as const) {
      const input = source([1, 2]);
      const result = ready(
        projectOrdinarySetup(
          input,
          {
            categoryId: "category",
            seriesIds: ["value"],
            switchCategorySeries: false,
            aggFunc: "sum",
          },
          axis,
        ),
      );
      expect(result.snapshot.rows.map((r) => r.values.value)).toEqual([3]);
    }
    const input = defaultSource([1, null, 3]);
    expect(
      projectOrdinarySetup(input, {
        categoryId: DEFAULT_SETUP_CATEGORY,
        seriesIds: ["value"],
        switchCategorySeries: false,
        aggFunc: "sum",
      }).status,
    ).toBe("invalid");
  });
});

function defaultSource(values: readonly (number | null)[]) {
  const input = source(
    values,
    values.map(() => 1),
    values.map((_, i) => String(i + 1)),
  );
  return {
    ...input,
    rows: input.rows.map((row) => ({ ...row, values: { value: row.values.value } })),
    categoryColumnId: DEFAULT_SETUP_CATEGORY,
    selectedColumnIds: [DEFAULT_SETUP_CATEGORY, "value"],
    columns: [
      { id: DEFAULT_SETUP_CATEGORY, label: "(None)", role: "category" as const },
      input.columns[1],
    ],
  };
}
describe("source-backed Box finite aggregation", () => {
  it("returns detached selected groups without mutating frozen source rows or arrays", () => {
    const input = source([1, undefined]);
    for (const row of input.rows) {
      Object.freeze(row.values);
      Object.freeze(row);
    }
    Object.freeze(input.rows);
    const ids = Object.freeze(["value"]);
    const groups = ready(aggregateBoxSetupRows(input.rows, ids));
    expect(groups[0].row).not.toBe(input.rows[0]);
    expect(groups[0].row.values).not.toBe(input.rows[0].values);
    expect(groups.map((g) => [g.row.values, g.sourceRowIds])).toEqual([
      [{ value: 1 }, ["0"]],
      [{}, ["1"]],
    ]);
    const summed = ready(aggregateBoxSetupRows(input.rows, ids, "sum"));
    expect(summed[0].sourceRowIds).toEqual(["0", "1"]);
    expect(summed[0].row.values).toEqual({ value: 1 });
    expect(input.rows[0].values).toEqual({ value: 1, second: 0 });
  });
  it.each([
    { values: [null, 3, -4, 3, 0, null], results: [2, null, null, -4, 3, 6, 0.5] },
    { values: [null, null], results: [null, null, null, null, null, 2, null] },
    {
      values: [undefined, 2, null, undefined],
      results: [2, undefined, undefined, 2, 2, 4, 2],
    },
    { values: [1e16, 1, -1e16], results: [0, 1e16, -1e16, -1e16, 1e16, 3, 0] },
  ])("matches all seven original operators for $values", ({ values, results }) => {
    SETUP_AGGREGATIONS.forEach((operator, i) => {
      const row = projected(source(values), operator).snapshot.rows[0];
      expect(Object.is(row.values.value, results[i])).toBe(true);
      expect(Object.hasOwn(row.values, "value")).toBe(results[i] !== undefined);
    });
  });
  it("retains the first signed zero for sum/min/max ties and ordered averaging", () => {
    for (const [values, operator, expected] of [
      [[-0], "sum", -0],
      [[0, -0], "min", 0],
      [[-0, 0], "max", -0],
      [[-0], "avg", 0],
      [[1e16, -1e16, 1], "sum", 1],
    ] as const)
      expect(Object.is(observations(source(values), operator)[0], expected)).toBe(true);
  });
  it.each([
    "sum",
    "avg",
  ] as const)("rejects %s overflow atomically after a valid earlier bucket", (operator) => {
    const result = project(
      source(
        [1, Number.MAX_VALUE, Number.MAX_VALUE],
        ["valid", "overflow", "overflow"],
      ),
      operator,
    );
    expect(result).toMatchObject({
      status: "invalid",
      diagnostics: [
        { code: "box-setup-aggregation", path: ["rows", 1, "values", "value"] },
      ],
    });
    expect(Object.hasOwn(result, "value")).toBe(false);
  });
  it("preserves selected field order, units, full provenance and untouched inputs", () => {
    const input = source([null, undefined, 3]);
    const before = structuredClone(input);
    const result = projected(input, "count", ["second", "value"]);
    expect(input).toEqual(before);
    expect(result.snapshot.selectedColumnIds).toEqual(["category", "second", "value"]);
    expect(result.snapshot.columns.slice(1)).toMatchObject([
      { label: "Margin", unit: "observation-count", scale: 1 },
      { label: "Revenue", unit: "observation-count", scale: 1 },
    ]);
    expect(result.observationKind).toBe("count");
    expect(result.axisUnits).toBe("deferred");
    const row = result.snapshot.rows[0];
    expect(row.id).toBe('setup:aggregate:["0","1","2"]');
    expect(result.valueOrigins[row.id]).toEqual({
      second: {
        sourceRowIds: ["0", "1", "2"],
        sourceColumnId: "second",
        kind: "count",
        unit: "dimensionless",
        scale: 0.01,
      },
      value: {
        sourceRowIds: ["0", "1", "2"],
        sourceColumnId: "value",
        kind: "count",
        unit: "USD",
        scale: 1_000_000,
      },
    });
    expect(result.snapshot).toMatchObject({
      originalModel: input.originalModel,
      selectedRange: input.selectedRange,
      stateAddress: input.stateAddress,
      dataRevision: 7,
      sourceMode: "grouped",
    });
    const raw = projected(input);
    expect(raw.snapshot.sourceMode).toBe("flat");
    expect(raw.observationKind).toBe("raw-observations");
    expect(raw.snapshot.rows[0]).not.toBe(input.rows[0]);
    expect(raw.snapshot.rows[0].values).not.toBe(input.rows[0].values);
    expect(raw.snapshot.rows[0].values).toEqual({ value: null });
    expect(raw.valueOrigins["0"].value.sourceRowIds).toEqual(["0"]);
    expect(projected(input, "sum").snapshot.columns[1]).toMatchObject({
      unit: "USD",
      scale: 1_000_000,
    });
  });
  it("preserves default ordinals, missing raw buckets and first typed representative", () => {
    const saved = {
      ...defaultSource([1, null, 3]),
      originalModel: { chartType: "boxPlot", aggFunc: "sum" },
    };
    const defaults = observations(saved, "sum");
    expect(defaults).toEqual([1, null, 3]);
    expect(projected(saved, "sum").snapshot.originalModel).toEqual(saved.originalModel);
    expect(calculateBoxSummary(defaults)).toEqual({
      status: "resolved",
      count: 2,
      summary: { min: 1, q1: 1.5, median: 2, q3: 2.5, max: 3 },
    });
    expect(observations(defaultSource([1, null, 3]), "count")).toEqual([1, 1, 1]);
    const missing = source(
      [1, null, 3, 4, 5],
      ["", "", "", "null", "undefined"],
      ["null", "undefined", "", "null", "undefined"],
    );
    expect(
      projected(missing, "sum").snapshot.rows.map((r) => [
        r.category,
        r.boxPlotAggregationKey,
        r.values.value,
      ]),
    ).toEqual([
      ["", "null", 5],
      ["", "undefined", 5],
      ["", "", 3],
    ]);
    expect(calculateBoxSummary(observations(missing, "sum"))).toEqual({
      status: "resolved",
      count: 3,
      summary: { min: 3, q1: 4, median: 5, q3: 5, max: 5 },
    });
    const typed = source([1, 2, 3, 4, 5], [1, "1", -0, 0, "0"]);
    expect(projected(typed).snapshot.rows.map((r) => r.category)).toEqual([
      1,
      "1",
      -0,
      0,
      "0",
    ]);
    expect(
      projected(typed, "sum").snapshot.rows.map((r) => [r.category, r.values.value]),
    ).toEqual([
      [1, 3],
      [-0, 12],
    ]);
    expect(projected(source([2, 1], ["1", 1]), "first").snapshot.rows[0].category).toBe(
      "1",
    );
  });
  it("keeps Date/epoch separate raw buckets and the first Date epoch in a string collision", () => {
    const key = new Date(epoch).toString();
    const input = source(
      [1, null, 3, 4],
      [epoch, epoch, epoch, epoch + 1],
      [key, key, String(epoch), key],
    );
    const result = projected(input, "sum");
    expect(
      result.snapshot.rows.map((r) => [
        r.category,
        r.boxPlotAggregationKey,
        r.values.value,
      ]),
    ).toEqual([
      [epoch, key, 5],
      [epoch, String(epoch), 3],
    ]);
    expect(result.valueOrigins[result.snapshot.rows[0].id].value.sourceRowIds).toEqual([
      "0",
      "1",
      "3",
    ]);
  });
  it.each(
    Object.getOwnPropertyNames(Object.prototype),
  )("diagnoses original-incompatible aggregate key %s and recovers without Aggregate", (key) => {
    const input = source([1, 2], ["safe", key]);
    expect(project(input, "sum")).toMatchObject({
      status: "invalid",
      diagnostics: [
        {
          code: "box-setup-aggregation",
          path: ["rows", 1, "boxPlotAggregationKey"],
          message: expect.stringMatching(/original/i),
        },
      ],
    });
    expect(projected(input).snapshot.rows[1].category).toBe(key);
  });
});

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
async function grid(rows: Record<string, unknown>[]): Promise<GridCaptureInput> {
  api = createGrid(host, {
    theme: "legacy",
    rowData: rows,
    getRowId: ({ data }) => String(data.id),
    columnDefs: [
      { field: "category", cellDataType: false },
      { field: "value", cellDataType: false, valueFormatter: () => "formatted-number" },
    ],
  });
  await vi.waitFor(() => expect(api?.getDisplayedRowCount()).toBe(rows.length));
  const template = source([]);
  return {
    api,
    snapshotPolicy: policy,
    stamp: {
      address: { widgetId: "w", stateKey: "box", stateAddress: template.stateAddress },
      generation: 1,
      dataRevision: 7,
      renderRevision: 1,
    },
    range: { columnIds: ["category", "value"], originalRange: template.selectedRange },
    categoryColumnId: "category",
    columns: template.columns.slice(0, 2),
    originalModel: template.originalModel,
  };
}
describe("Box capture through the public GridApi", () => {
  it("reads each unformatted category once and preserves native Date, missing, finite, null and absent values", async () => {
    const date = new Date(epoch);
    const input = await grid([
      { id: "0", category: null, value: -0 },
      { id: "1", value: null },
      { id: "2", category: date },
      { id: "3", category: "", value: 4 },
    ]);
    const read = vi.spyOn(input.api, "getCellValue");
    const captured = ready(captureDisplayedChart(input));
    expect(captured.rows).toEqual([
      { id: "0", category: "", boxPlotAggregationKey: "null", values: { value: -0 } },
      {
        id: "1",
        category: "",
        boxPlotAggregationKey: "undefined",
        values: { value: null },
      },
      { id: "2", category: epoch, boxPlotAggregationKey: date.toString(), values: {} },
      { id: "3", category: "", boxPlotAggregationKey: "", values: { value: 4 } },
    ]);
    expect(Object.is(captured.rows[0].values.value, -0)).toBe(true);
    expect(read).toHaveBeenCalledTimes(8);
    expect(read.mock.calls.every(([request]) => request.useFormatter === false)).toBe(
      true,
    );
    const empty = ready(
      captureDisplayedChart({
        ...input,
        range: { ...input.range, columnIds: ["category"] },
      }),
    );
    expect(
      projected(empty, undefined, []).snapshot.rows.map((row) => row.values),
    ).toEqual([{}, {}, {}, {}]);
  });
  it("never reads a default category cell and numbers raw keys from the selected range start", async () => {
    const input = await grid(
      [0, 1, 2, 3].map((value) => ({ id: String(value), value })),
    );
    Object.assign(input, {
      categoryColumnId: DEFAULT_SETUP_CATEGORY,
      columns: defaultSource([1]).columns,
      range: {
        columnIds: [DEFAULT_SETUP_CATEGORY, "value"],
        rowStartIndex: 1,
        rowEndIndex: 3,
        originalRange: { rowStartIndex: 1, rowEndIndex: 3 },
      },
    });
    const read = vi.spyOn(input.api, "getCellValue");
    const captured = ready(captureDisplayedChart(input));
    expect(
      captured.rows.map((r) => [r.id, r.category, r.boxPlotAggregationKey]),
    ).toEqual([
      ["1", 1, "1"],
      ["2", 1, "2"],
      ["3", 1, "3"],
    ]);
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls.every(([request]) => request.colKey === "value")).toBe(true);
    expect(observations(captured, "count")).toEqual([1, 1, 1]);
  });
  it("reports prefixed helper failures and rejects unsupported numerical values without conversion hooks", async () => {
    let hooks = 0;
    const wrapper = Object.defineProperty({}, "valueOf", {
      get() {
        hooks++;
        throw new Error("private");
      },
    });
    const input = await grid([{ id: "0", category: "A", value: 1 }]);
    const read = vi.spyOn(input.api, "getCellValue");
    for (const value of [
      "2",
      true,
      2n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      wrapper,
      new Number(2),
      new Date(epoch),
    ]) {
      read.mockImplementation(({ colKey }) => (colKey === "category" ? "A" : value));
      expect(captureDisplayedChart(input)).toMatchObject({
        status: "unresolved",
        diagnostics: [{ path: ["rows", 0, "values", "value"] }],
      });
    }
    read.mockImplementation(({ colKey }) => (colKey === "category" ? wrapper : 2));
    expect(captureDisplayedChart(input)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ code: "box-category-capture", path: ["rows", 0, "category"] }],
    });
    expect(hooks).toBe(0);
    read.mockImplementation(() => {
      throw new Error("PRIVATE");
    });
    const failed = captureDisplayedChart(input);
    expect(failed.status).toBe("unresolved");
    expect(JSON.stringify(failed)).not.toContain("PRIVATE");
  });
  it("preserves representative existing capture policy behavior", async () => {
    const input = await grid([{ id: "0", category: "A", value: 2 }]);
    for (const snapshotPolicy of [
      undefined,
      "pie-observations",
      "histogram-observations",
    ] as const) {
      expect(ready(captureDisplayedChart({ ...input, snapshotPolicy })).rows).toEqual([
        { id: "0", category: "A", values: { value: 2 } },
      ]);
    }
  });
});
