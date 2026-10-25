import { describe, expect, it } from "vitest";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import type {
  SetupProjection,
  SetupSelection,
} from "../../../src/components/General/Table/Chart/application/setupTypes";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { buildHeatmapData } from "../../../src/components/General/Table/Chart/echarts/heatmapData";

function capture(): Omit<ChartSnapshot, "rows"> & { rows: ChartSnapshot["rows"] } {
  return {
    stateAddress: '["w","heatmap"]',
    dataRevision: 1,
    sourceMode: "flat",
    originalModel: { cellRange: { columns: ["region", "value", "reserve"] } },
    selectedRange: { columns: ["region", "value", "reserve"] },
    selectedColumnIds: ["region", "value", "reserve"],
    categoryColumnId: "region",
    columns: [
      { id: "region", label: "Region", role: "category" },
      { id: "value", label: "Value", role: "number" },
      { id: "reserve", label: "Reserve", role: "number" },
    ],
    rows: [
      { id: "a", category: "West", values: { value: -10, reserve: 101 } },
      { id: "b", category: "East", values: { value: 0, reserve: 102 } },
      { id: "c", category: "West", values: { value: 20, reserve: 103 } },
      { id: "d", category: "West", values: { value: 30, reserve: 104 } },
      { id: "e", category: "East", values: { value: null, reserve: 105 } },
    ],
  };
}
function project(source = capture(), selection: Partial<SetupSelection> = {}) {
  const result = projectOrdinarySetup(source, {
    categoryId: "region",
    seriesIds: ["value", "reserve"],
    switchCategorySeries: false,
    ...selection,
  });
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value;
}

describe("inactive heatmap matrix", () => {
  it("retains duplicate row identities, selection order and signed observations", () => {
    const projection = project(capture(), { seriesIds: ["reserve", "value"] });
    const before = structuredClone(projection);
    const matrix = buildHeatmapData(projection);
    expect(matrix.x).toEqual([
      { id: "reserve", label: "Reserve" },
      { id: "value", label: "Value" },
    ]);
    expect(matrix.y).toEqual([
      { id: "a", label: "West" },
      { id: "b", label: "East" },
      { id: "c", label: "West" },
      { id: "d", label: "West" },
      { id: "e", label: "East" },
    ]);
    expect(matrix.cells).toEqual([
      { x: 0, y: 0, rowId: "a", columnId: "reserve", value: 101 },
      { x: 1, y: 0, rowId: "a", columnId: "value", value: -10 },
      { x: 0, y: 1, rowId: "b", columnId: "reserve", value: 102 },
      { x: 1, y: 1, rowId: "b", columnId: "value", value: 0 },
      { x: 0, y: 2, rowId: "c", columnId: "reserve", value: 103 },
      { x: 1, y: 2, rowId: "c", columnId: "value", value: 20 },
      { x: 0, y: 3, rowId: "d", columnId: "reserve", value: 104 },
      { x: 1, y: 3, rowId: "d", columnId: "value", value: 30 },
      { x: 0, y: 4, rowId: "e", columnId: "reserve", value: 105 },
    ]);
    expect(matrix.extent).toEqual([-10, 105]);
    expect(projection).toEqual(before);
    for (const cell of matrix.cells) {
      expect(projection.valueOrigins[cell.rowId][cell.columnId]).toEqual({
        sourceRowIds: [cell.rowId],
        sourceColumnId: cell.columnId,
        kind: "source",
      });
    }
  });
  it("uses existing sum and Count results with resolvable provenance", () => {
    const sum = project(capture(), { aggFunc: "sum" });
    expect(buildHeatmapData(sum).cells.map((cell) => cell.value)).toEqual([
      40, 308, 0, 207,
    ]);
    const count = project(capture(), { aggFunc: "count" });
    const matrix = buildHeatmapData(count);
    expect(matrix.cells.map((cell) => cell.value)).toEqual([3, 3, 2, 2]);
    for (const cell of matrix.cells) {
      expect(count.valueOrigins[cell.rowId][cell.columnId]).toEqual({
        kind: "count",
        sourceColumnId: cell.columnId,
        sourceRowIds: cell.y === 0 ? ["a", "c", "d"] : ["b", "e"],
      });
    }
    expect(buildHeatmapData(project()).y).toHaveLength(5);
  });
  it("keeps all-missing columns and companion cells without imputing zero", () => {
    const source = capture();
    source.rows = [
      { id: "a", category: 7, values: { value: null, reserve: 4 } },
      { id: "b", category: 7, values: { reserve: 4 } },
    ];
    const matrix = buildHeatmapData(project(source));
    expect(matrix.x).toHaveLength(2);
    expect(matrix.y).toEqual([
      { id: "a", label: "7" },
      { id: "b", label: "7" },
    ]);
    expect(matrix.cells).toEqual([
      { x: 1, y: 0, rowId: "a", columnId: "reserve", value: 4 },
      { x: 1, y: 1, rowId: "b", columnId: "reserve", value: 4 },
    ]);
    expect(matrix.extent).toEqual([4, 4]);
  });
  it("returns null extent for empty rows and wholly missing matrices", () => {
    const source = capture();
    source.rows = [];
    expect(buildHeatmapData(project(source))).toMatchObject({
      cells: [],
      y: [],
      extent: null,
    });
    source.rows = [{ id: "a", category: "West", values: { value: null } }];
    expect(buildHeatmapData(project(source))).toMatchObject({
      cells: [],
      extent: null,
    });
    expect(buildHeatmapData(project(source)).y).toHaveLength(1);
  });
  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects a present malformed observation %s instead of treating it as missing", (value) => {
    const valid = project();
    const malformed = {
      ...valid,
      snapshot: {
        ...valid.snapshot,
        rows: [
          {
            ...valid.snapshot.rows[0],
            values: { value, reserve: 101 },
          },
        ],
      },
    } as unknown as SetupProjection;
    expect(() => buildHeatmapData(malformed)).toThrow(/finite/i);
  });
});
