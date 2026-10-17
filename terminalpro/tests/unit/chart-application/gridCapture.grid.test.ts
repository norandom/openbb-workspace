import type { ColDef, GridApi } from "ag-grid-community";
import { AllCommunityModule, createGrid, ModuleRegistry } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveChartRange } from "../../../src/components/General/Table/Chart/application/chartRange";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import type { GridCaptureInput } from "../../../src/components/General/Table/Chart/application/types";
import fixture from "./gridCapture.fixtures.json";

ModuleRegistry.registerModules([AllCommunityModule]);
type Row = Record<string, unknown>;
let api: GridApi<Row>;
let host: HTMLDivElement;
beforeEach(() => {
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
afterEach(() => {
  api?.destroy();
  host.remove();
  vi.unstubAllGlobals();
});
async function grid(extra: ColDef<Row>[] = []) {
  api = createGrid<Row>(host, {
    theme: "legacy",
    rowData: structuredClone(fixture.rows),
    columnDefs: [
      { field: "period" },
      { field: "revenue", filter: "agNumberColumnFilter", cellDataType: "number" },
      { field: "operatingIncome", cellDataType: "number" },
      ...extra,
    ],
  });
  await vi.waitFor(() => expect(api.getDisplayedRowCount()).toBe(6));
}
function ids() {
  return Array.from(
    { length: api.getDisplayedRowCount() },
    (_, i) => api.getDisplayedRowAtIndex(i)?.id,
  );
}
function values(column: string, start = 0, end = api.getDisplayedRowCount() - 1) {
  return Array.from({ length: end - start + 1 }, (_, offset) => {
    const rowNode = api.getDisplayedRowAtIndex(start + offset);
    if (!rowNode) throw new Error("Expected displayed observation");
    return api.getCellValue({ rowNode, colKey: column, useFormatter: false });
  });
}
describe("real Community ordinary financial fixture", () => {
  it("retains exact financial observations and duplicate-label identities", async () => {
    await grid();
    expect(ids()).toEqual(fixture.ordinary.ids);
    expect(values("period")).toEqual(fixture.ordinary.categories);
    expect(values("revenue")).toEqual(fixture.ordinary.revenue);
    expect(values("operatingIncome")).toEqual(fixture.ordinary.operatingIncome);
    expect(values("period")[0]).toBe(values("period")[1]);
    expect(ids()[0]).not.toBe(ids()[1]);
    expect(api.getGridOption("rowModelType") ?? "clientSide").toBe("clientSide");
  });
  it("uses inclusive displayed bounds after filtering and descending sorting", async () => {
    await grid();
    api.setFilterModel({
      revenue: { filterType: "number", type: "greaterThanOrEqual", filter: 0 },
    });
    api.applyColumnState({
      state: [{ colId: "revenue", sort: "desc" }],
      defaultState: { sort: null },
    });
    await vi.waitFor(() => expect(ids()).toEqual(fixture.bounded.displayedIds));
    const { rowStartIndex: start, rowEndIndex: end } = fixture.bounded;
    expect(ids().slice(start, end + 1)).toEqual(fixture.bounded.ids);
    expect(values("period", start, end)).toEqual(fixture.bounded.categories);
    expect(
      fixture.bounded.selectedColumnIds.slice(1).map((key) => values(key, start, end)),
    ).toEqual([fixture.bounded.operatingIncome, fixture.bounded.revenue]);
  });
  it("exposes visible columns for caller-owned range intersection", async () => {
    await grid();
    api.setColumnsVisible(["operatingIncome"], false);
    await vi.waitFor(() =>
      expect(api.getAllDisplayedColumns().map((column) => column.getColId())).toEqual(
        fixture.hidden.selectedColumnIds,
      ),
    );
    expect(values("revenue")).toEqual(fixture.ordinary.revenue);
  });
  it("keeps the dimensionless formatter experiment unscaled", async () => {
    await grid([
      {
        field: "margin",
        valueFormatter: ({ value }) =>
          typeof value === "number" ? value.toFixed(2) : "-",
      },
    ]);
    const rowNode = api.getDisplayedRowAtIndex(0);
    if (!rowNode) throw new Error("Expected first observation");
    expect(values("margin")[0]).toBe(fixture.experiments.normalizedPercent.raw);
    expect(api.getCellValue({ rowNode, colKey: "margin", useFormatter: true })).toBe(
      fixture.experiments.normalizedPercent.apiFormatted,
    );
    expect(rowNode.data?.margin).toBe(0.2);
  });
  it("reads synthetic getter results separately from raw and formatted data", async () => {
    await grid();
    api.setGridOption("columnDefs", [
      { field: "period" },
      {
        field: "revenue",
        valueGetter: ({ data }) => Number(data?.revenue) * 2,
        valueFormatter: ({ value }) => `USD ${value}`,
      },
      { field: "operatingIncome" },
    ]);
    await vi.waitFor(() =>
      expect(values("revenue")).toEqual(fixture.experiments.getter.revenue),
    );
    const rowNode = api.getDisplayedRowAtIndex(0);
    if (!rowNode) throw new Error("Expected first observation");
    expect(rowNode.data?.revenue).toBe(fixture.experiments.getter.rawRevenue);
    expect(api.getCellValue({ rowNode, colKey: "revenue", useFormatter: true })).toBe(
      "USD 200",
    );
  });
});

function captureInput(
  columnIds: readonly string[] = fixture.ordinary.selectedColumnIds,
): GridCaptureInput {
  return {
    api,
    stamp: {
      address: {
        widgetId: "fixture",
        stateKey: "chart",
        stateAddress: '["fixture","chart"]',
      },
      generation: 1,
      dataRevision: 4,
      renderRevision: 2,
    },
    range: {
      columnIds,
      originalRange: { columns: [...columnIds], provenance: "original" },
    },
    categoryColumnId: "period",
    columns: [
      { id: "period", label: "Period", role: "category" },
      ...columnIds
        .filter((id) => id !== "period")
        .map((id) => ({
          id,
          label: id,
          role: "number" as const,
          unit: id === "margin" ? "dimensionless" : "USD",
          scale: id === "margin" ? 1 : 1000000,
        })),
    ],
    originalModel: { chartType: "groupedColumn" },
  };
}
function captured(data = captureInput()) {
  const result = captureDisplayedChart(data);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected validated capture");
  return result.value;
}
describe("capture adapter against real Community values", () => {
  it("matches admitted original ordinary arrays, financial units and identities", async () => {
    await grid();
    const result = captured();
    expect(result.rows.map((row) => row.id)).toEqual(fixture.ordinary.ids);
    expect(result.rows.map((row) => row.category)).toEqual(fixture.ordinary.categories);
    expect(result.rows.map((row) => row.values.revenue)).toEqual(
      fixture.ordinary.revenue,
    );
    expect(result.rows.map((row) => row.values.operatingIncome)).toEqual(
      fixture.ordinary.operatingIncome,
    );
    expect(result.columns[1]).toMatchObject({ unit: "USD", scale: 1000000 });
  });
  it("captures sorted filtered inclusive bounds and selected series order", async () => {
    await grid();
    api.setFilterModel({
      revenue: { filterType: "number", type: "greaterThanOrEqual", filter: 0 },
    });
    api.applyColumnState({
      state: [{ colId: "revenue", sort: "desc" }],
      defaultState: { sort: null },
    });
    await vi.waitFor(() => expect(ids()).toEqual(fixture.bounded.displayedIds));
    const data = captureInput(fixture.bounded.selectedColumnIds);
    Object.assign(data.range, { rowStartIndex: 1, rowEndIndex: 3 });
    const result = captured(data);
    expect(result.selectedColumnIds).toEqual(fixture.bounded.selectedColumnIds);
    expect(result.rows.map((row) => row.id)).toEqual(fixture.bounded.ids);
    expect(result.rows.map((row) => row.category)).toEqual(fixture.bounded.categories);
    expect(result.rows.map((row) => row.values.operatingIncome)).toEqual(
      fixture.bounded.operatingIncome,
    );
    expect(result.rows.map((row) => row.values.revenue)).toEqual(
      fixture.bounded.revenue,
    );
  });
  it("joins A1 visible intersection to A2 while preserving independent provenance", async () => {
    await grid();
    api.setColumnsVisible(["operatingIncome"], false);
    const data = captureInput();
    const range = resolveChartRange({
      storedRange: data.range,
      ignoreCellRange: false,
      definitionColumnIds: fixture.ordinary.selectedColumnIds,
      generatedColumnIds: api
        .getAllDisplayedColumns()
        .map((column) => column.getColId()),
    });
    expect(range.status).toBe("ready");
    if (range.status !== "ready") return;
    const result = captured({ ...data, range: range.range });
    expect(result.selectedColumnIds).toEqual(fixture.hidden.selectedColumnIds);
    expect(result.selectedRange).toEqual(data.range.originalRange);
    expect(result.rows.map((row) => row.values.revenue)).toEqual(
      fixture.ordinary.revenue,
    );
    expect(
      result.rows.every((row) => !Object.hasOwn(row.values, "operatingIncome")),
    ).toBe(true);
    // Already resolved IDs are consumed even if grid visibility changes after A1.
    api.setColumnsVisible(["revenue"], false);
    expect(captured({ ...data, range: range.range }).rows).toEqual(result.rows);
  });
  it("uses synthetic public getters without formatter parsing or raw fallback", async () => {
    await grid();
    api.setGridOption("columnDefs", [
      { field: "period" },
      {
        field: "revenue",
        valueGetter: ({ data }) => Number(data?.revenue) * 2,
        valueFormatter: ({ value }) => `USD ${value}`,
      },
    ]);
    const result = captured(captureInput(["revenue", "period"]));
    expect(result.selectedColumnIds).toEqual(["revenue", "period"]);
    expect(result.rows.map((row) => row.values.revenue)).toEqual(
      fixture.experiments.getter.revenue,
    );
  });
  it("preserves normalized fractions rather than displayed percentages", async () => {
    await grid([
      { field: "margin", valueFormatter: ({ value }) => `${Number(value) * 100}%` },
    ]);
    expect(captured(captureInput(["period", "margin"])).rows[0].values.margin).toBe(
      fixture.experiments.normalizedPercent.raw,
    );
  });
  it("distinguishes ready empty from destroyed real grids", async () => {
    await grid();
    api.setGridOption("rowData", []);
    expect(captured().rows).toEqual([]);
    api.destroy();
    expect(captureDisplayedChart(captureInput()).status).toBe("waiting");
  });
});
