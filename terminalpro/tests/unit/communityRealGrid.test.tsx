import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { COMMUNITY_PAGE_SIZES, communityGridOptions, communityPaginationOptions } from "~/components/General/Table/communityBoundary";
import { restoreCommunityState } from "~/components/General/Table/communityState";

ModuleRegistry.registerModules([AllCommunityModule]);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
afterEach(cleanup);

it("real 250-row grid applies Community pagination settings across refresh and reopen", async () => {
  const warnings = vi.spyOn(console, "warn");
  let api: any;
  const rows = Array.from({ length: 250 }, (_, index) => ({ id: index }));
  const columns = [{ field: "id" }];
  const storage = { enablePagination: true, paginationPageSize: 100 };
  const view = render(<div style={{ height: 400 }}><AgGridReact rowData={rows} columnDefs={columns} paginationPageSizeSelector={COMMUNITY_PAGE_SIZES} {...communityPaginationOptions(rows.length, storage)} onGridReady={(event) => { api = event.api; }} /></div>);
  await waitFor(() => expect(api?.paginationGetTotalPages()).toBe(3));
  api.paginationGoToPage(2);
  expect(api.paginationGetCurrentPage()).toBe(2);
  storage.paginationPageSize = 200;
  api.updateGridOptions(communityPaginationOptions(rows.length, storage));
  await waitFor(() => expect(api.paginationGetTotalPages()).toBe(2));
  storage.enablePagination = false;
  api.updateGridOptions(communityPaginationOptions(rows.length, storage));
  expect(api.getGridOption("pagination")).toBe(false);
  storage.enablePagination = true;
  api.updateGridOptions({ rowData: rows.slice(), ...communityPaginationOptions(rows.length, storage) });
  expect(api.getGridOption("pagination")).toBe(true);
  expect(api.paginationGetPageSize()).toBe(200);
  view.unmount();
  api = undefined;
  render(<div style={{ height: 400 }}><AgGridReact rowData={rows} columnDefs={columns} paginationPageSizeSelector={COMMUNITY_PAGE_SIZES} {...communityPaginationOptions(rows.length, storage)} onGridReady={(event) => { api = event.api; }} /></div>);
  await waitFor(() => expect(api?.paginationGetPageSize()).toBe(200));
  expect(api.paginationGetTotalPages()).toBe(2);
  expect(warnings.mock.calls.filter(([message]) => /AG Grid/i.test(String(message)))).toEqual([]);
  warnings.mockRestore();
});

it("real Community grid sorts, filters, formats currencies and restores modern state", async () => {
  let api: any;
  const errors = vi.spyOn(console, "error");
  const options = communityGridOptions({
    rowData: [{ currency: "USD", revenue: null }, { currency: "EUR", revenue: 20 }, { currency: "GBP", revenue: 5 }],
    columnDefs: [{ field: "currency", sortable: true, filter: "agTextColumnFilter" }, { field: "revenue", sortable: true, filter: "agNumberColumnFilter", valueFormatter: ({ value }: any) => value == null ? "-" : value.toFixed(2) }],
    enableCharts: true, cellSelection: true, sideBar: true, statusBar: {},
    rowSelection: { mode: "singleRow", checkboxes: false },
    onGridReady: (event: any) => { api = event.api; },
  });
  render(<div style={{ height: 400, width: 600 }}><AgGridReact {...options} /></div>);
  await waitFor(() => expect(api?.getDisplayedRowCount()).toBe(3));
  api.applyColumnState({ state: [{ colId: "revenue", sort: "desc" }], defaultState: { sort: null } });
  expect(api.getDisplayedRowAtIndex(0).data.currency).toBe("EUR");
  api.setFilterModel({ revenue: { filterType: "number", type: "greaterThan", filter: 10 } });
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1));
  expect(api.getDisplayedRowAtIndex(0).data).toEqual({ currency: "EUR", revenue: 20 });
  const saved = api.getState();
  api.setFilterModel(null);
  const widget = { storage: { transpose: true, period: "quarter" }, data: { table: { columnState: { quarter_transpose: saved } } } };
  const before = structuredClone(widget);
  restoreCommunityState(api, widget);
  await waitFor(() => expect(api.getDisplayedRowCount()).toBe(1));
  expect(widget).toEqual(before);
  expect(api.getCellValue({ rowNode: api.getDisplayedRowAtIndex(0), colKey: "revenue", useFormatter: true })).toBe("20.00");
  expect(errors.mock.calls.filter(([message]) => /enterprise|not registered|error #/i.test(String(message)))).toEqual([]);
  errors.mockRestore();
});
