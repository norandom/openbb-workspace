import { describe, expect, it } from "vitest";
import { resolveChartRange } from "../../../src/components/General/Table/Chart/application/chartRange";

const base = {
  ignoreCellRange: false,
  definitionColumnIds: ["date", "profit", "revenue"],
  generatedColumnIds: ["date", "revenue", "profit"],
};
describe("source range resolution", () => {
  it("keeps eligible stored order, row bounds and original JSON immutably", () => {
    const storedRange = Object.freeze({
      columnIds: Object.freeze(["profit", "gone", "date"]),
      rowStartIndex: 3,
      rowEndIndex: 8,
      originalRange: Object.freeze({
        columns: ["profit", "gone", "date"],
        extra: true,
      }),
    });
    const before = JSON.stringify(storedRange);
    expect(
      resolveChartRange({ ...base, storedRange, configuredColumnIds: ["revenue"] }),
    ).toEqual({
      status: "ready",
      diagnostics: [],
      range: { ...storedRange, columnIds: ["profit", "date"] },
    });
    expect(JSON.stringify(storedRange)).toBe(before);
  });
  it.each([
    true,
    false,
  ])("falls through ignored or single-column stored range (%s)", (ignoreCellRange) => {
    expect(
      resolveChartRange({
        ...base,
        ignoreCellRange,
        storedRange: {
          columnIds: ignoreCellRange ? ["date", "profit"] : ["date"],
          originalRange: { saved: true },
        },
        configuredColumnIds: ["profit", "date", "missing"],
      }),
    ).toEqual({
      status: "ready",
      diagnostics: [],
      range: {
        columnIds: ["profit", "date"],
        originalRange: { columns: ["profit", "date"] },
      },
    });
  });
  it("falls back from empty configuration with a nonfatal diagnostic", () => {
    const result = resolveChartRange({ ...base, configuredColumnIds: ["missing"] });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("range missing");
    expect(result.range).toEqual({
      columnIds: ["date", "revenue", "profit"],
      originalRange: { columns: ["date", "revenue", "profit"] },
    });
    expect(result.diagnostics).toEqual([
      {
        code: "empty-configured-range",
        path: ["configuredColumnIds"],
        message: "Configured columns match no definitions; using generated columns",
      },
    ]);
  });
  it("does not silently replace a selected range emptied by generated intersection", () => {
    expect(
      resolveChartRange({
        ...base,
        generatedColumnIds: [],
        configuredColumnIds: ["profit"],
      }),
    ).toMatchObject({ status: "unresolved" });
  });
});
