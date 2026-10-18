import assert from "node:assert/strict";
import { test } from "node:test";
import {
  unsupportedTableReason,
  communityGridOptions,
} from "../../src/components/General/Table/communityBoundary.ts";

test("flat financial state is accepted without mutation", () => {
  const state = {
    params: { period: "annual" },
    transpose: true,
    annual_transpose: {
      columnState: [{ colId: "USD", sort: "asc", hide: false }],
      filter: { filterModel: { USD: { type: "greaterThan", filter: 0 } } },
    },
  };
  const before = structuredClone(state);
  assert.equal(unsupportedTableReason(state), undefined);
  assert.deepEqual(state, before);
});

test("modern, legacy, nested and inactive imported enterprise state is preserved and rejected", () => {
  for (const state of [
    { filterModel: { default: { currency: { filterType: "set", values: ["USD"] } } } },
    {
      columnState: {
        default: {
          filter: {
            filterModel: { revenue: { filterType: "multi", filterModels: [] } },
          },
        },
      },
    },
    { columnState: [{ colId: "currency", rowGroup: true }] },
    { annual: { rowGroup: { groupColIds: ["currency"] } } },
    { quarterly: { pivot: { pivotMode: true, pivotColIds: ["period"] } } },
    { gridOptions: { treeData: true } },
    { gridOptions: { rowModelType: "serverSide" } },
    { masterDetail: true },
  ]) {
    const before = structuredClone(state);
    assert.ok(unsupportedTableReason(state), JSON.stringify(state));
    assert.deepEqual(state, before);
  }
});

test("chart state stays opaque to grid guards, including original aggregation and malformed saved models", () => {
  for (const state of [
    { chartView: { enabled: true } },
    {
      default: {
        chartModel: { chartType: "line", aggFunc: "sum", custom: { retained: true } },
      },
    },
    { chartModel: { chartType: 42, cellRange: "invalid" } },
  ]) {
    const before = structuredClone(state);
    assert.equal(unsupportedTableReason(state), undefined);
    assert.deepEqual(state, before);
  }
});

test("community options retain scalar data callbacks and remove enterprise actions recursively", () => {
  const callback = () => {};
  const source = {
    rowData: [{ revenue: null, currency: "USD" }],
    onFilterChanged: callback,
    cellSelection: true,
    enableCharts: true,
    sideBar: true,
    getContextMenuItems: callback,
    gridOptions: {
      statusBar: {},
      defaultColDef: {
        enableRowGroup: true,
        sortable: true,
        filter: "agNumberColumnFilter",
      },
    },
  };
  const options = communityGridOptions(source);
  assert.equal(options.onFilterChanged, callback);
  assert.deepEqual(options.rowData, source.rowData);
  assert.equal(options.enableCharts, undefined);
  assert.equal(options.cellSelection, undefined);
  assert.equal(options.getContextMenuItems, undefined);
  assert.equal(options.gridOptions.statusBar, undefined);
  assert.deepEqual(options.gridOptions.defaultColDef, {
    sortable: true,
    filter: "agNumberColumnFilter",
  });
  assert.equal(source.enableCharts, true);
});
