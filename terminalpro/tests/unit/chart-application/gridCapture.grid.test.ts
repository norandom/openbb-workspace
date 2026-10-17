import type { ColDef, GridApi } from "ag-grid-community";
import { AllCommunityModule, createGrid, ModuleRegistry } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
