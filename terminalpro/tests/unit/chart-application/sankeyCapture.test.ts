import type { GridApi } from "ag-grid-community";
import { describe, expect, it, vi } from "vitest";
import { captureDisplayedSankey } from "../../../src/components/General/Table/Chart/application/sankeyCapture";
import type { SankeyGridCaptureInput } from "../../../src/components/General/Table/Chart/application/sankeyTypes";

function fixture(): SankeyGridCaptureInput {
  const rows = [
    { id: "filtered-b", from: 1, to: "1", value: 6, period: "FY2025" },
    { id: "filtered-a", from: "1", to: true, value: 6, period: null },
  ];
  return {
    api: {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? [] : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (i: number) => rows[i],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue: vi.fn(({ rowNode, colKey }) => rowNode[colKey]),
    } as unknown as GridApi<Record<string, unknown>>,
    stamp: {
      address: { widgetId: "w", stateKey: "s", stateAddress: '["w","s"]' },
      generation: 1,
      dataRevision: 2,
      renderRevision: 3,
    },
    range: {
      columnIds: ["from", "to", "value", "period"],
      originalRange: { columns: ["from", "to", "value", "period"] },
    },
    columns: [
      { id: "from", label: "Source", role: "category" },
      { id: "to", label: "Target", role: "category" },
      { id: "value", label: "Amount", role: "number" },
      { id: "period", label: "Period", role: "category" },
    ],
    selection: {
      sourceColumnId: "from",
      targetColumnId: "to",
      valueColumnId: "value",
      metadata: {
        unit: null,
        currency: null,
        scale: null,
        period: null,
        measure: null,
      },
      metadataColumnIds: { period: "period" },
    },
    originalModel: { chartType: "sankey", keep: true },
  };
}
describe("displayed Sankey capture", () => {
  it("captures unformatted mapped cells, typed IDs, bound textual metadata and ordinary provenance", () => {
    const input = fixture();
    const result = captureDisplayedSankey(input);
    expect(result).toMatchObject({
      status: "ready",
      stamp: input.stamp,
      value: {
        dataRevision: 2,
        selectedRange: input.range.originalRange,
        originalModel: input.originalModel,
        rows: [
          {
            id: "filtered-b",
            source: 1,
            target: "1",
            value: 6,
            metadata: { period: "FY2025" },
            provenance: {
              rowId: "filtered-b",
              sourceColumnId: "from",
              targetColumnId: "to",
              valueColumnId: "value",
            },
          },
          { id: "filtered-a", source: "1", target: true, metadata: { period: null } },
        ],
      },
    });
    expect(input.api.getCellValue).toHaveBeenCalledTimes(8);
    expect(input.api.getCellValue).toHaveBeenCalledWith(
      expect.objectContaining({ useFormatter: false, colKey: "period" }),
    );
    if (result.status === "ready")
      expect(Object.isFrozen(result.value.selection.metadataColumnIds)).toBe(true);
  });
  it("honors displayed inclusive bounds and empty full range", () => {
    const input = fixture();
    Object.assign(input.range, { rowStartIndex: 1, rowEndIndex: 1 });
    expect(captureDisplayedSankey(input)).toMatchObject({
      status: "ready",
      value: { rows: [{ id: "filtered-a" }] },
    });
    Object.assign(input.api, { getDisplayedRowCount: () => 0 });
    Object.assign(input.range, { rowStartIndex: null, rowEndIndex: null });
    expect(captureDisplayedSankey(input)).toMatchObject({
      status: "ready",
      value: { rows: [] },
    });
  });
  it("rejects mapping/column and stamp failures before reading cells", () => {
    for (const patch of [
      { sourceColumnId: null },
      { targetColumnId: "from" },
      { valueColumnId: "absent" },
    ]) {
      const input = fixture();
      Object.assign(input.selection, patch);
      expect(captureDisplayedSankey(input).status).toBe("invalid");
      expect(input.api.getCellValue).not.toHaveBeenCalled();
    }
    const input = fixture();
    Object.assign(input.stamp, { dataRevision: -1 });
    expect(captureDisplayedSankey(input).status).toBe("invalid");
  });
  it("rejects invalid primitives and declaration conflicts with row/column diagnostics", () => {
    for (const [column, raw] of [
      ["from", {}],
      ["value", "6"],
      ["value", Number.POSITIVE_INFINITY],
      ["period", 2025],
      ["period", "FY2024"],
    ]) {
      const input = fixture();
      Object.assign(input.selection.metadata, { period: "FY2025" });
      Object.assign(input.api, {
        getCellValue: ({ colKey }: { colKey: string }) =>
          colKey === column
            ? raw
            : colKey === "value"
              ? 6
              : colKey === "period"
                ? "FY2025"
                : colKey,
      });
      const result = captureDisplayedSankey(input);
      expect(["invalid", "unresolved"]).toContain(result.status);
      if (result.status === "invalid" || result.status === "unresolved")
        expect(result.diagnostics[0].path).toContain("rows");
    }
  });
  it("preserves API guards for remote/grouped/pinned rows, duplicate IDs and bad bounds", () => {
    for (const patch of [
      { getGridOption: (key: string) => (key === "rowModelType" ? "serverSide" : []) },
      { getDisplayedRowAtIndex: () => ({ id: "g", group: true }) },
      { getPinnedTopRowCount: () => 1 },
      { getDisplayedRowAtIndex: () => ({ id: "same" }) },
      { getDisplayedRowCount: () => -1 },
    ]) {
      const input = fixture();
      Object.assign(input.api, patch);
      expect(captureDisplayedSankey(input).status).toBe("unresolved");
    }
  });
  it("waits for data/destruction and sanitizes API exceptions", () => {
    for (const patch of [
      { isDestroyed: () => true },
      { getGridOption: () => undefined },
    ]) {
      const input = fixture();
      Object.assign(input.api, patch);
      expect(captureDisplayedSankey(input)).toEqual({ status: "waiting" });
    }
    const input = fixture();
    Object.assign(input.api, {
      getCellValue: () => {
        throw Error("private text");
      },
    });
    const result = captureDisplayedSankey(input);
    expect(result).toMatchObject({
      status: "unresolved",
      diagnostics: [{ code: "grid-api-failure" }],
    });
    expect(JSON.stringify(result)).not.toContain("private text");
  });
});
