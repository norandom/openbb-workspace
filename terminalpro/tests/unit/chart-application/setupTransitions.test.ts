import { describe, expect, it } from "vitest";
import { validateIntegratedInput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { transitionOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupTransitions";
import { createSetupDescriptors } from "../../../src/components/General/Table/Chart/application/setupDescriptors";
import type { ChartSetupEdit } from "../../../src/components/General/Table/Chart/editor/setup/ChartSetupPanel";
import {
  DEFAULT_SETUP_CATEGORY,
  type SetupSelection,
} from "../../../src/components/General/Table/Chart/application/setupTypes";

const capture = {
  stateAddress: "s",
  dataRevision: 3,
  sourceMode: "flat" as const,
  originalModel: {},
  selectedRange: { columns: ["category", "a", "b"] },
  categoryColumnId: "category",
  selectedColumnIds: ["category", "a", "b"],
  columns: [
    { id: "category", label: "Category", role: "category" as const },
    { id: "a", label: "USD million", role: "number" as const },
    { id: "b", label: "B", role: "number" as const },
  ],
  rows: [{ id: "r", category: "Q1", values: { a: 20, b: -3 } }],
};
const selection: SetupSelection = {
  categoryId: "category",
  seriesIds: ["a", "b"],
  switchCategorySeries: false,
};
function transition(event: ChartSetupEdit, current = selection) {
  return transitionOrdinarySetup(
    {
      capture,
      selection: current,
      categoryIds: ["category", "alternate", DEFAULT_SETUP_CATEGORY],
      range: {
        columnIds: ["category", "a", "b"],
        rowStartIndex: 2,
        rowEndIndex: 6,
        originalRange: {
          columns: ["category", "a", "b"],
          rowStartIndex: 2,
          rowEndIndex: 6,
          unknown: { keep: true },
        },
      },
      model: { chartType: "line", aggFunc: "min", unknown: { keep: 3 } },
    },
    event,
  );
}
function ready(result: ReturnType<typeof transition>) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("not ready");
  return result.value;
}
describe("ordinary setup range and model transitions", () => {
  it("retains own undefined chartOptions in an accepted runtime model", () => {
    const checked = validateIntegratedInput({
      storage: {},
      stateKey: "s",
      currentModel: { chartOptions: undefined, unknown: { keep: [1, 2] } },
      resolvedOptions: {},
      chartType: "line",
      totalSeries: 2,
      isPivotMode: false,
    });
    expect(checked.valid).toBe(true);
    if (!checked.valid || !checked.value.currentModel) return;
    const result = transitionOrdinarySetup(
      {
        capture,
        selection,
        categoryIds: ["category"],
        range: {
          columnIds: ["category", "a", "b"],
          originalRange: capture.selectedRange,
        },
        model: checked.value.currentModel,
      },
      { kind: "aggregate", value: true },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(Object.hasOwn(result.value.model, "chartOptions")).toBe(true);
    expect(result.value.model.chartOptions).toBeUndefined();
    expect(result.value.model.unknown).toEqual({ keep: [1, 2] });
  });
  it("reorders selected IDs and removes a pill without removing source descriptors", () => {
    const reordered = ready(transition({ kind: "series-order", ids: ["b", "a"] }));
    expect(reordered.change).toBe("range");
    expect(reordered.range.columnIds).toEqual(["category", "b", "a"]);
    expect(reordered.model).toEqual({
      chartType: "line",
      aggFunc: "min",
      unknown: { keep: 3 },
      cellRange: {
        columns: ["category", "b", "a"],
        rowStartIndex: 2,
        rowEndIndex: 6,
        unknown: { keep: true },
      },
    });
    expect(
      ready(transition({ kind: "series-remove", id: "a" })).selection.seriesIds,
    ).toEqual(["b"]);
    expect(capture.columns.map((c) => c.id)).toEqual(["category", "a", "b"]);
    expect(
      ready(
        transition(
          { kind: "series-remove", id: "b" },
          { ...selection, seriesIds: ["b"] },
        ),
      ).selection.seriesIds,
    ).toEqual([]);
  });
  it("requests an alternate category recapture without fabricating row categories", () => {
    const result = ready(transition({ kind: "category", value: "alternate" }));
    expect(result.recapture).toEqual({
      categoryColumnId: "alternate",
      columnIds: ["alternate", "a", "b"],
    });
    expect(result.range.columnIds).toEqual(["alternate", "a", "b"]);
    expect(capture.rows[0].category).toBe("Q1");
    expect(
      ready(transition({ kind: "category", value: "category" })).recapture,
    ).toBeUndefined();
  });
  it("sets sum on each aggregate enable, chooses finite operators, and clears on default category", () => {
    expect(
      ready(
        transition(
          { kind: "aggregate", value: true },
          { ...selection, aggFunc: "min" },
        ),
      ).selection.aggFunc,
    ).toBe("sum");
    expect(
      ready(
        transition(
          { kind: "aggregation-method", value: "avg" },
          { ...selection, aggFunc: "sum" },
        ),
      ).model,
    ).toMatchObject({ aggFunc: "avg" });
    const off = ready(
      transition({ kind: "aggregate", value: false }, { ...selection, aggFunc: "sum" }),
    );
    expect(Object.hasOwn(off.model as object, "aggFunc")).toBe(false);
    const defaulted = ready(
      transition(
        { kind: "category", value: DEFAULT_SETUP_CATEGORY },
        { ...selection, aggFunc: "max" },
      ),
    );
    expect(defaulted.selection.aggFunc).toBeUndefined();
    expect(defaulted.recapture?.categoryColumnId).toBe(DEFAULT_SETUP_CATEGORY);
    expect(
      transition(
        { kind: "aggregate", value: true },
        { ...selection, categoryId: DEFAULT_SETUP_CATEGORY },
      ).status,
    ).toBe("invalid");
  });
  it("writes original switch root flag and preserves original model/range coordinates", () => {
    const result = ready(transition({ kind: "switch-category-series", value: true }));
    expect(result.change).toBe("model");
    expect(result.model).toMatchObject({
      switchCategorySeries: true,
      unknown: { keep: 3 },
    });
    expect(result.range.columnIds).toEqual(["category", "a", "b"]);
    expect(result.recapture).toBeUndefined();
  });
  it.each([
    { kind: "category", value: "missing" },
    { kind: "aggregation-method", value: "median" },
    { kind: "series-order", ids: ["a", "a"] },
    { kind: "series-order", ids: ["a"] },
    { kind: "series-remove", id: "missing" },
  ])("rejects malformed actions %j", (event) => {
    expect(transition(event as ChartSetupEdit).status).toBe("invalid");
  });
});
describe("application semantic descriptors", () => {
  it("retains raw numeric columns without parsing their headers or inventing units", () => {
    const result = createSetupDescriptors(capture.columns, "category");
    expect(result).toEqual({ status: "ready", value: capture.columns });
    if (result.status !== "ready") return;
    expect(Object.hasOwn(result.value[1], "unit")).toBe(false);
    expect(Object.hasOwn(result.value[1], "scale")).toBe(false);
  });
  it("keeps actual declarations and admits one selected category from a registry", () => {
    const columns = [
      ...capture.columns,
      { id: "alternate", label: "Other", role: "category" as const },
      {
        id: "c",
        label: "Declared",
        role: "number" as const,
        unit: "EUR",
        scale: 1000,
        metadata: { provider: "declared" },
      },
    ];
    const result = createSetupDescriptors(columns, "alternate");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.value.map((c) => c.id)).toEqual(["alternate", "a", "b", "c"]);
    expect(result.value[3]).toEqual(columns[4]);
    expect(
      createSetupDescriptors(
        [{ ...capture.columns[0] }, { ...capture.columns[1], scale: 0 }],
        "category",
      ).status,
    ).toBe("invalid");
  });
});
