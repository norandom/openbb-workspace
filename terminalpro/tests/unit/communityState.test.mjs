import assert from "node:assert/strict";
import { test } from "node:test";
import { getStateKey, restoreCommunityState } from "../../src/components/General/Table/communityState.ts";

test("storage keys distinguish period, transpose, group, sheet, ratio and pivot", () => {
  assert.equal(getStateKey({ storage: { period: "quarter", transpose: true, selectedGroup: "cash", currentSheet: { name: "Income" }, selectedRatio: "margin" } }), "quarter_transpose_cash_Income_margin");
});
test("legacy sorting, visibility, sizing and filters restore without enterprise calls", () => {
  const state = [{ colId: "revenue", sort: "desc", width: 120, hide: false }];
  const widget = { storage: { params: { period: "annual" } }, data: { table: { columnState: { default: state }, filterModel: { default: { revenue: { filter: 0, type: "greaterThan" } } } } } };
  const calls = [];
  const api = { applyColumnState: (v) => calls.push(v), setFilterModel: (v) => calls.push(v) };
  assert.equal(restoreCommunityState(api, widget), true);
  assert.deepEqual(calls, [{ state, applyOrder: true }, widget.data.table.filterModel.default]);
});
test("modern state uses flat restore and preserves original payload", () => {
  const state = { columnOrder: { orderedColIds: ["currency", "revenue"] }, filter: { filterModel: {} }, cellSelection: { ranges: [] } };
  const widget = { storage: {}, data: { table: { columnState: { default: state } } } };
  let restored;
  restoreCommunityState({ setState: (v) => { restored = v; } }, widget);
  assert.deepEqual(restored, { columnOrder: state.columnOrder, filter: state.filter });
  assert.ok(state.cellSelection);
});
test("unsupported imported state never reaches any mutation API", () => {
  const widget = { storage: {}, data: { table: { columnState: { default: [{ colId: "currency", rowGroup: true }] } } } };
  const api = new Proxy({}, { get() { throw new Error("must not access grid API"); } });
  assert.equal(restoreCommunityState(api, widget), false);
});

test("saved Set and Multi filter models never reach grid mutation APIs", () => {
  for (const table of [
    { filterModel: { default: { currency: { filterType: "set", values: ["USD"] } } } },
    { columnState: { default: { filter: { filterModel: { revenue: { filterType: "multi", filterModels: [] } } } } } },
  ]) {
    const widget = { storage: {}, data: { table } };
    const before = structuredClone(widget);
    const api = new Proxy({}, { get() { throw new Error("Enterprise filter must never reach an API"); } });
    assert.equal(restoreCommunityState(api, widget), false);
    assert.deepEqual(widget, before);
  }
});
