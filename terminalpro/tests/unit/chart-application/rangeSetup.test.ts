import {
  AllCommunityModule,
  createGrid,
  type GridApi,
  ModuleRegistry,
} from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import { observationSnapshotPolicy } from "../../../src/components/General/Table/Chart/application/histogramCapture";
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
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { projectRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBarProjection";

ModuleRegistry.registerModules([AllCommunityModule]);
const epoch = 1704067200000;
function policy(family = "rangeBar") {
  const result = observationSnapshotPolicy(family);
  expect(result).toBe("statistical-observations");
  if (result !== "statistical-observations") throw new Error("Missing Range policy");
  return result;
}
function ready<T>(result: SetupResult<T> | SessionResult<T>): T {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value;
}
function source(values: readonly (number | null | undefined)[]): ChartSnapshot {
  return {
    stateAddress: '["w","range"]',
    dataRevision: 7,
    sourceMode: "flat",
    originalModel: { chartType: "rangeBar", extension: { retained: true } },
    selectedRange: { columns: ["category", "value"], rowStartIndex: 2 },
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
      category: "A",
      boxPlotAggregationKey: "A",
      values: { ...(value === undefined ? {} : { value }), second: 20 - i },
    })),
  };
}
function project(
  input: ChartSnapshot,
  aggFunc?: SetupSelection["aggFunc"],
  seriesIds: readonly string[] = ["value"],
  family = "rangeBar",
) {
  return projectOrdinarySetup(
    input,
    {
      categoryId: input.categoryColumnId,
      seriesIds,
      aggFunc,
      switchCategorySeries: false,
    },
    policy(family),
  );
}
function range(snapshot: ChartSnapshot) {
  const result = projectRangeBar(snapshot);
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") throw new Error(JSON.stringify(result));
  return result.projection;
}
function endpoints(snapshot: ChartSnapshot) {
  return range(snapshot).fields.map((f) => f.data.map((d) => d.summary));
}

describe("inactive Range observation policy", () => {
  it("selects the neutral policy for both Range names and preserves other mappings", () => {
    policy("rangeBar");
    policy("rangeArea");
    expect(
      ["boxPlot", "pie", "histogram", "scatter", "line", "unknown"].map(
        observationSnapshotPolicy,
      ),
    ).toEqual([
      "box-observations",
      "pie-observations",
      "histogram-observations",
      "xy-coordinates",
      undefined,
      undefined,
    ]);
  });
  it("requires detached own raw keys and rejects metadata getters without reading them", () => {
    const input = source([2]);
    const row = { ...input.rows[0], category: "", boxPlotAggregationKey: "" };
    const checked = validateSnapshot({ ...input, rows: [row] }, policy());
    expect(checked.valid).toBe(true);
    if (checked.valid) expect(checked.snapshot.rows[0]).not.toBe(row);
    for (const key of [undefined, 2, null]) {
      const malformed = { ...row, boxPlotAggregationKey: key };
      if (key === undefined) delete malformed.boxPlotAggregationKey;
      expect(validateSnapshot({ ...input, rows: [malformed] }, policy())).toMatchObject(
        {
          valid: false,
          diagnostics: [{ path: ["rows", 0, "boxPlotAggregationKey"] }],
        },
      );
    }
    const inherited = Object.assign(Object.create({ boxPlotAggregationKey: "" }), {
      id: "0",
      category: "",
      values: { value: 2 },
    });
    expect(validateSnapshot({ ...input, rows: [inherited] }, policy()).valid).toBe(
      false,
    );
    const getter = vi.fn(() => "A");
    Object.defineProperty(row, "boxPlotAggregationKey", {
      enumerable: true,
      get: getter,
    });
    expect(validateSnapshot({ ...input, rows: [row] }, policy())).toMatchObject({
      valid: false,
      diagnostics: [{ path: ["rows", 0, "boxPlotAggregationKey"] }],
    });
    expect(getter).not.toHaveBeenCalled();
  });
  it("recovers zero fields, rejects transpose, and retains provenance without mutation", () => {
    const input = source([2, 7]);
    const before = structuredClone(input);
    const retained = ready(retainOrdinarySetupCapture(input, policy()));
    const output = ready(project(retained, "count", ["second", "value"], "rangeArea"));
    expect(input).toEqual(before);
    expect(Object.isFrozen(retained.rows[0].values)).toBe(true);
    expect(output).toMatchObject({
      observationKind: "count",
      axisUnits: "deferred",
      setupProjection: { kind: "ordinary-aggregate", aggFunc: "count" },
    });
    expect(output.snapshot).toMatchObject({
      stateAddress: input.stateAddress,
      dataRevision: 7,
      originalModel: input.originalModel,
      selectedRange: input.selectedRange,
      sourceMode: "grouped",
      selectedColumnIds: ["category", "second", "value"],
    });
    expect(output.snapshot.columns.slice(1).map((c) => [c.unit, c.scale])).toEqual([
      ["observation-count", 1],
      ["observation-count", 1],
    ]);
    expect(output.valueOrigins[output.snapshot.rows[0].id].value).toEqual({
      sourceRowIds: ["0", "1"],
      sourceColumnId: "value",
      kind: "count",
      unit: "USD",
      scale: 1_000_000,
    });
    const raw = ready(project(input));
    expect(raw).toMatchObject({
      observationKind: "raw-observations",
      axisUnits: "deferred",
      snapshot: { sourceMode: "flat" },
    });
    expect(raw.snapshot.columns[1]).toEqual(input.columns[1]);
    const empty = { ...input, selectedColumnIds: ["category"] };
    expect(validateSnapshot(empty, policy()).valid).toBe(true);
    const zero = ready(project(empty, undefined, []));
    expect(zero.snapshot.rows.map((r) => r.values)).toEqual([{}, {}]);
    expect(range(zero.snapshot).fields).toEqual([]);
    expect(endpoints(ready(project(input)).snapshot)).toEqual([[{ min: 2, max: 7 }]]);
    expect(
      projectOrdinarySetup(
        input,
        { categoryId: "category", seriesIds: ["value"], switchCategorySeries: true },
        policy(),
      ),
    ).toMatchObject({ status: "invalid" });
  });
  it.each([
    ["sum", 2],
    ["avg", 0.5],
    ["min", -4],
    ["max", 3],
    ["count", 6],
    ["first", null],
    ["last", null],
  ] as const)("reduces %s once with independent expected observations", (operator, expected) => {
    const output = ready(project(source([null, 3, -4, 3, 0, null]), operator));
    expect(output.snapshot.rows.map((r) => r.values.value)).toEqual([expected]);
    expect(endpoints(output.snapshot)).toEqual([
      [expected === null ? null : { min: expected, max: expected }],
    ]);
  });
  it("retains signed-zero ties, absent first/last, and atomic overflow/prototype failures with recovery", () => {
    expect(
      Object.is(
        ready(project(source([-0, 0]), "min")).snapshot.rows[0].values.value,
        -0,
      ),
    ).toBe(true);
    for (const op of ["first", "last"] as const) {
      const output = ready(project(source([undefined, 3, undefined]), op));
      expect(Object.hasOwn(output.snapshot.rows[0].values, "value")).toBe(false);
      expect(endpoints(output.snapshot)).toEqual([[null]]);
    }
    expect(project(source([Number.MAX_VALUE, Number.MAX_VALUE]), "sum")).toMatchObject({
      status: "invalid",
      diagnostics: [
        { code: "box-setup-aggregation", path: ["rows", 0, "values", "value"] },
      ],
    });
    const input = source([1, 2]);
    const hostile = {
      ...input,
      rows: input.rows.map((r) => ({
        ...r,
        category: "__proto__",
        boxPlotAggregationKey: "__proto__",
      })),
    };
    expect(project(hostile, "sum")).toMatchObject({
      status: "invalid",
      diagnostics: [
        { code: "box-setup-aggregation", path: ["rows", 0, "boxPlotAggregationKey"] },
      ],
    });
    expect(endpoints(ready(project(hostile)).snapshot)).toEqual([[{ min: 1, max: 2 }]]);
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
    vi.unstubAllEnvs();
  }
});
async function grid(
  rows: Record<string, unknown>[],
  family = "rangeBar",
): Promise<GridCaptureInput> {
  api = createGrid(host, {
    theme: "legacy",
    rowData: rows,
    getRowId: ({ data }) => String(data.id),
    columnDefs: ["category", "value", "second"].map((field) => ({
      field,
      cellDataType: false,
      valueFormatter: () => "formatted",
    })),
  });
  await vi.waitFor(() => expect(api?.getDisplayedRowCount()).toBe(rows.length));
  const template = source([]);
  return {
    api,
    snapshotPolicy: policy(family),
    stamp: {
      address: {
        widgetId: "w",
        stateKey: "range",
        stateAddress: template.stateAddress,
      },
      generation: 1,
      dataRevision: 7,
      renderRevision: 1,
    },
    range: {
      columnIds: template.selectedColumnIds,
      originalRange: template.selectedRange,
    },
    categoryColumnId: "category",
    columns: template.columns,
    originalModel: template.originalModel,
  };
}
describe("Range capture through public GridApi and statistical setup", () => {
  it("keeps raw numeric/string buckets before independent Range field grouping", async () => {
    const input = await grid([
      { id: "0", category: 1, value: 2, second: -3 },
      { id: "1", category: "1", value: 7, second: 11 },
    ]);
    const read = vi.spyOn(input.api, "getCellValue");
    const captured = ready(captureDisplayedChart(input));
    expect(read.mock.calls.filter(([r]) => r.colKey === "category")).toHaveLength(2);
    expect(read.mock.calls.every(([r]) => r.useFormatter === false)).toBe(true);
    const raw = ready(project(captured, undefined, ["second", "value"]));
    expect(range(raw.snapshot).groups.map((g) => g.category)).toEqual([1, "1"]);
    expect(endpoints(raw.snapshot)).toEqual([
      [
        { min: -3, max: -3 },
        { min: 11, max: 11 },
      ],
      [
        { min: 2, max: 2 },
        { min: 7, max: 7 },
      ],
    ]);
    const sum = ready(project(captured, "sum", ["second", "value"]));
    expect(endpoints(sum.snapshot)).toEqual([
      [{ min: 8, max: 8 }],
      [{ min: 9, max: 9 }],
    ]);
    expect(sum.valueOrigins[sum.snapshot.rows[0].id].value.sourceRowIds).toEqual([
      "0",
      "1",
    ]);
    expect(range(sum.snapshot).fields.map((f) => f.descriptor.id)).toEqual([
      "second",
      "value",
    ]);
    expect(captured.rows.map((r) => r.values.value)).toEqual([2, 7]);
  });
  it("preserves null/undefined/string raw collisions before merging statistical categories", async () => {
    const input = await grid(
      [null, "null", undefined, "undefined", ""].map((category, i) => ({
        id: String(i),
        category,
        value: [2, 7, 3, 11, 5][i],
      })),
      "rangeArea",
    );
    const captured = ready(
      captureDisplayedChart({
        ...input,
        range: { ...input.range, columnIds: ["category", "value"] },
      }),
    );
    expect(captured.rows.map((r) => [r.category, r.boxPlotAggregationKey])).toEqual([
      ["", "null"],
      ["null", "null"],
      ["", "undefined"],
      ["undefined", "undefined"],
      ["", ""],
    ]);
    expect(endpoints(ready(project(captured)).snapshot)).toEqual([
      [
        { min: 2, max: 5 },
        { min: 7, max: 7 },
        { min: 11, max: 11 },
      ],
    ]);
    const sum = ready(project(captured, "sum"));
    expect(sum.snapshot.rows.map((r) => [r.category, r.values.value])).toEqual([
      ["", 9],
      ["", 14],
      ["", 5],
    ]);
    expect(endpoints(sum.snapshot)).toEqual([[{ min: 5, max: 14 }]]);
  });
  it("preserves Date/epoch buckets and first Date representative on same-string collisions", async () => {
    vi.stubEnv("TZ", "UTC");
    expect(process.env.TZ).toBe("UTC");
    const date = new Date(epoch);
    const later = new Date(epoch + 1);
    expect(date.toString()).toBe(later.toString());
    const input = await grid(
      [date, epoch, later].map((category, i) => ({
        id: String(i),
        category,
        value: [2, 7, 11][i],
      })),
    );
    const captured = ready(
      captureDisplayedChart({
        ...input,
        range: { ...input.range, columnIds: ["category", "value"] },
      }),
    );
    expect(endpoints(ready(project(captured)).snapshot)).toEqual([
      [
        { min: 2, max: 7 },
        { min: 11, max: 11 },
      ],
    ]);
    const sum = ready(project(captured, "sum"));
    expect(sum.snapshot.rows.map((r) => [r.category, r.values.value])).toEqual([
      [epoch, 13],
      [epoch, 7],
    ]);
    expect(endpoints(sum.snapshot)).toEqual([[{ min: 7, max: 13 }]]);
    expect(sum.valueOrigins[sum.snapshot.rows[0].id].value.sourceRowIds).toEqual([
      "0",
      "2",
    ]);
    expect(date.getTime()).toBe(epoch);
  });
  it("numbers default raw keys relative to range start without reading category cells", async () => {
    const input = await grid([
      { id: "0", value: 99 },
      { id: "1", value: 1 },
      { id: "2", value: null },
      { id: "3", value: 3 },
    ]);
    const read = vi.spyOn(input.api, "getCellValue");
    const captured = ready(
      captureDisplayedChart({
        ...input,
        categoryColumnId: DEFAULT_SETUP_CATEGORY,
        columns: [
          { id: DEFAULT_SETUP_CATEGORY, label: "", role: "category" },
          source([]).columns[1],
        ],
        range: {
          columnIds: [DEFAULT_SETUP_CATEGORY, "value"],
          rowStartIndex: 1,
          rowEndIndex: 3,
          originalRange: { rowStartIndex: 1, rowEndIndex: 3 },
        },
      }),
    );
    expect(
      captured.rows.map((r) => [r.id, r.category, r.boxPlotAggregationKey]),
    ).toEqual([
      ["1", 1, "1"],
      ["2", 1, "2"],
      ["3", 1, "3"],
    ]);
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls.every(([r]) => r.colKey === "value")).toBe(true);
    const count = ready(project(captured, "count"));
    expect(count.snapshot.rows.map((r) => r.values.value)).toEqual([1, 1, 1]);
    expect(endpoints(count.snapshot)).toEqual([[{ min: 1, max: 1 }]]);
    expect(endpoints(ready(project(captured, "sum")).snapshot)).toEqual([
      [{ min: 1, max: 3 }],
    ]);
  });
  it("keeps finite/null/absent observations and rejects wrappers without invoking conversion hooks", async () => {
    const input = await grid([
      { id: "0", category: "A", value: -0 },
      { id: "1", category: "A", value: null },
      { id: "2", category: "A" },
    ]);
    const captured = ready(
      captureDisplayedChart({
        ...input,
        range: { ...input.range, columnIds: ["category", "value"] },
      }),
    );
    expect(captured.rows.map((r) => r.values)).toEqual([
      { value: -0 },
      { value: null },
      {},
    ]);
    expect(Object.is(captured.rows[0].values.value, -0)).toBe(true);
    const getter = vi.fn(() => 2);
    const wrapper = Object.defineProperty({}, "valueOf", { get: getter });
    const read = vi.spyOn(input.api, "getCellValue");
    read.mockImplementation(({ colKey }) => (colKey === "category" ? "A" : wrapper));
    expect(captureDisplayedChart(input)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ path: ["rows", 0, "values", "value"] }],
    });
    read.mockImplementation(({ colKey }) => (colKey === "category" ? wrapper : 2));
    expect(captureDisplayedChart(input)).toMatchObject({
      status: "unresolved",
      diagnostics: [{ code: "box-category-capture", path: ["rows", 0, "category"] }],
    });
    expect(getter).not.toHaveBeenCalled();
  });
});
