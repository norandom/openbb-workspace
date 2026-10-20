import { describe, expect, it } from "vitest";
import { sessionFixture } from "../chart-application/applicationSessionFixture";
import { applyComboAssignmentTransaction, applyComboFamilyTransaction, initializeComboSession, selectComboSessionAssignments } from "../../../src/components/General/Table/Chart/application/comboSessionAssignments";
import type { ComboSessionContext, ComboAssignmentCommand } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";

function fixture(chartType: "columnLineCombo" | "customCombo" = "columnLineCombo", assignments?: any[]) {
  const storage: any = { rootUnknown: 7, partition: { chartModel: { chartType, unknown: { keep: true }, seriesGroupType: "grouped", ...(assignments ? { seriesChartTypes: assignments } : {}), chartOptions: { line: { retained: 9 } } } } };
  const ordinary = sessionFixture(storage);
  const context: ComboSessionContext = { ...ordinary, inputs: { ...ordinary.inputs, family: chartType } };
  const initialized = initializeComboSession(context);
  if (initialized.status !== "ready") throw new Error(JSON.stringify(initialized));
  return { storage, context: { ...context, local: initialized.value } };
}
function command(context: ComboSessionContext, colId = "income"): ComboAssignmentCommand {
  return { stamp: context.local.stamp, family: context.inputs.family, intent: { panel: "comboAssignment", colId, edit: { kind: "secondaryAxis", value: true } } };
}
function ready<T>(result: { status: string; value?: T }): T {
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result.value!;
}
describe("combo session assignment ownership", () => {
  it("atomically enters custom using latest storage and preserves unknown/inactive fields", () => {
    const { storage, context } = fixture();
    storage.partition.chartModel.categoryAxisType = "time";
    storage.partition.chartModel.seriesChartTypes = [{ colId: "revenue", chartType: "area" }, { colId: "income", chartType: "line" }];
    const before = structuredClone(storage);
    const committed = ready(applyComboAssignmentTransaction(storage, context, command(context)));
    expect(storage).toEqual(before);
    expect((committed.storage as any).chartType).toBe("customCombo");
    expect((committed.storage as any).partition.chartModel).toMatchObject({ chartType: "customCombo", categoryAxisType: "time", unknown: { keep: true }, seriesGroupType: "grouped", chartOptions: { line: { retained: 9 } }, seriesChartTypes: [{ colId: "revenue", chartType: "area" }, { colId: "income", chartType: "line", secondaryAxis: true }] });
    expect(committed.local.baseline.chartType).toBe("customCombo");
    expect((committed.storage as any).partition.chartModel.savedCustomSeriesChartTypes).toBeUndefined();
    const second = ready(applyComboAssignmentTransaction(committed.storage, { ...context, local: committed.local }, { ...command(context), intent: { panel: "comboAssignment", colId: "revenue", edit: { kind: "type", value: "stackedArea" } } }));
    expect((second.storage as any).partition.chartModel.seriesChartTypes[0]).toEqual({ colId: "revenue", chartType: "stackedArea", secondaryAxis: false });
  });
  it("retains the live cache across builtin selection but serializes only current assignments", () => {
    const { storage, context } = fixture("customCombo", [{ colId: "revenue", chartType: "area", secondaryAxis: true }, { colId: "income", chartType: "stackedColumn", secondaryAxis: true }]);
    const builtin = ready(applyComboFamilyTransaction(storage, context, context.local.stamp, "columnLineCombo"));
    expect((builtin.storage as any).partition.chartModel.seriesChartTypes.map((a: any) => a.chartType)).toEqual(["groupedColumn", "line"]);
    const live = { ...context, inputs: { ...context.inputs, family: "columnLineCombo" as const }, local: builtin.local };
    const custom = ready(applyComboFamilyTransaction(builtin.storage, live, live.local.stamp, "customCombo"));
    expect((custom.storage as any).partition.chartModel.seriesChartTypes).toEqual([{ colId: "revenue", chartType: "area", secondaryAxis: true }, { colId: "income", chartType: "stackedColumn", secondaryAxis: false }]);
    const ordinary = ready(applyComboFamilyTransaction(custom.storage, { ...live, inputs: { ...live.inputs, family: "customCombo" }, local: custom.local }, live.local.stamp, "line"));
    expect((ordinary.storage as any).partition.chartModel.seriesChartTypes).toBeUndefined();
  });
  it("restores supplied builtin assignments as custom without recovering an older cache", () => {
    const { storage, context } = fixture("columnLineCombo", [{ colId: "revenue", chartType: "groupedColumn" }, { colId: "income", chartType: "line" }]);
    expect(context.local.baseline.chartType).toBe("customCombo");
    expect(ready(selectComboSessionAssignments(storage, context)).chartType).toBe("customCombo");
    const reopened = initialApplicationSession(storage, context.inputs, 2);
    expect(reopened.error).toBeUndefined();
    expect(reopened.local.baseline.chartType).toBe("customCombo");
    expect(reopened.local.savedCustomSeriesChartTypes?.map(a => a.chartType)).toEqual(["groupedColumn", "line"]);
  });
  it("rejects stale identity, data, family and no-longer-selected target", () => {
    const { storage, context } = fixture();
    const original = command(context);
    for (const stamp of [{ ...original.stamp, generation: 9 }, { ...original.stamp, dataRevision: 9 }, { ...original.stamp, address: { widgetId: "other", stateKey: "partition", stateAddress: '["other","partition"]' } }])
      expect(applyComboAssignmentTransaction(storage, context, { ...original, stamp }).status).toBe("stale");
    expect(applyComboAssignmentTransaction(storage, context, { ...original, family: "areaColumnCombo" }).status).toBe("stale");
    storage.partition.columnLineCombo = { cellRange: { columns: ["period", "revenue"] } };
    expect(applyComboAssignmentTransaction(storage, context, original).status).toBe("stale");
    storage.partition.chartModel.chartType = "line";
    expect(applyComboAssignmentTransaction(storage, context, original).status).toBe("stale");
  });
  it("retains unselected assignments and uses current ordering, missing defaults and column availability", () => {
    const { storage, context } = fixture("customCombo", [{ colId: "revenue", chartType: "area", secondaryAxis: true }, { colId: "income", chartType: "line", secondaryAxis: true }]);
    const range = { columnIds: ["period", "income"], originalRange: { columns: ["period", "income"] } };
    const unselected = { ...context, inputs: { ...context.inputs, range }, local: { ...context.local, range } };
    const result = ready(applyComboAssignmentTransaction(storage, unselected, { ...command(unselected), intent: { panel: "comboAssignment", colId: "income", edit: { kind: "type", value: "groupedColumn" } } }));
    expect((result.storage as any).partition.chartModel.seriesChartTypes).toEqual([{ colId: "income", chartType: "groupedColumn", secondaryAxis: false }, { colId: "revenue", chartType: "area", secondaryAxis: true }]);
    expect(applyComboAssignmentTransaction(result.storage, { ...unselected, local: result.local }, command(unselected, "revenue")).status).toBe("stale");
    const reorderedRange = { columnIds: ["period", "income", "revenue"], originalRange: { columns: ["period", "income", "revenue"] } };
    const reordered = { ...context, inputs: { ...context.inputs, range: reorderedRange }, local: { ...result.local, range: reorderedRange } };
    expect(ready(selectComboSessionAssignments(result.storage, reordered)).seriesChartTypes.map(a => a.colId)).toEqual(["income", "revenue"]);
    const missing = { ...reordered, inputs: { ...reordered.inputs, columns: reordered.inputs.columns.filter(c => c.id !== "revenue") } };
    expect(ready(selectComboSessionAssignments(result.storage, missing)).seriesChartTypes.map(a => a.colId)).toEqual(["income"]);
    const absent = fixture("customCombo", [{ colId: "revenue", chartType: "line" }]);
    expect(ready(selectComboSessionAssignments(absent.storage, absent.context)).seriesChartTypes[1]).toEqual({ colId: "income", chartType: "line", secondaryAxis: false });
  });
  it("rejects malformed assignments and stale capture without mutating storage", () => {
    const { storage, context } = fixture();
    const stale = { ...context, capture: { ...context.capture, dataRevision: 99 } };
    expect(applyComboAssignmentTransaction(storage, stale, command(context)).status).toBe("stale");
    storage.partition.chartModel.seriesChartTypes = "malformed";
    expect(applyComboAssignmentTransaction(storage, context, command(context)).status).toBe("invalid");
    expect(applyComboAssignmentTransaction(storage, context, { ...command(context), stamp: { ...context.local.stamp, generation: NaN } }).status).toBe("invalid");
  });
});
