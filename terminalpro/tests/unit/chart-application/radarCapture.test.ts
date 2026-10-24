import type { GridApi } from "ag-grid-community";
import { describe, expect, it } from "vitest";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import { observationSnapshotPolicy } from "../../../src/components/General/Table/Chart/application/histogramCapture";
import type { GridCaptureInput } from "../../../src/components/General/Table/Chart/application/types";

function capture(values: unknown[], family = "radarLine", empty = false) {
  const rows = values.map((value, i) => ({ id: `row:${i}`, value }));
  const input: GridCaptureInput = {
    api: {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (i: number) => rows[i],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue: ({
        rowNode,
        colKey,
      }: {
        rowNode: (typeof rows)[number];
        colKey: string;
      }) => (colKey === "category" ? "A" : rowNode.value),
    } as unknown as GridApi<Record<string, unknown>>,
    stamp: {
      address: { widgetId: "w", stateKey: "s", stateAddress: '["w","s"]' },
      generation: 1,
      dataRevision: 1,
      renderRevision: 1,
    },
    range: {
      columnIds: empty ? ["category"] : ["category", "value"],
      originalRange: {},
    },
    categoryColumnId: "category",
    columns: [
      { id: "category", label: "Category", role: "category" },
      { id: "value", label: "Value", role: "number" },
    ],
    originalModel: {},
    snapshotPolicy: observationSnapshotPolicy(family),
  };
  return captureDisplayedChart(input);
}
describe("Radar displayed observation capture", () => {
  it.each([
    "radarLine",
    "radarArea",
  ])("registers %s without changing other policies", (family) => {
    expect(observationSnapshotPolicy(family)).toBe("radar-observations");
    expect(observationSnapshotPolicy("line")).toBeUndefined();
  });
  it("preserves wrapper precedence, dates and own valueOf, with invalid observations missing", () => {
    const result = capture([
      10,
      -5,
      0,
      { value: 12, toString: () => "13", toNumber: () => 14 },
      { toString: () => "15 USD", toNumber: () => 16 },
      { toNumber: () => 17 },
      new Date(123),
      { valueOf: () => 18 },
      new Number(19),
      "20",
      null,
      undefined,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      new Date(Number.NaN),
      { value: Number.POSITIVE_INFINITY, toNumber: () => 21 },
      { toString: () => "bad", toNumber: () => 22 },
    ]);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.value.rows.map((r) => r.values.value)).toEqual([
      10,
      -5,
      0,
      12,
      15,
      17,
      123,
      18,
      19,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(result.value.rows.map((r) => r.id)).toEqual(
      Array.from({ length: 17 }, (_, i) => `row:${i}`),
    );
    expect(result.value.rows.every((r) => r.category === "A")).toBe(true);
  });
  it("retains ready empty field selection", () => {
    expect(capture([1, 2], "radarArea", true)).toMatchObject({
      status: "ready",
      value: { rows: [{ values: {} }, { values: {} }] },
    });
  });
});

it("Nightingale has its own policy with shared polar wrapper admission and empty capture", () => {
  expect(observationSnapshotPolicy("nightingale")).toBe("nightingale-observations");
  const result = capture(
    [
      { value: 12 },
      null,
      Number.POSITIVE_INFINITY,
      { toNumber: () => -7 },
      new Number(4),
    ],
    "nightingale",
  );
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  expect(result.value.rows.map((r) => r.values.value)).toEqual([12, null, null, -7, 4]);
  expect(capture([], "nightingale", true).status).toBe("ready");
});
