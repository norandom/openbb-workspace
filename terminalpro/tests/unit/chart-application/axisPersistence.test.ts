import get from "lodash/get";
import { describe, expect, it } from "vitest";
import { readAxisSettings, restoreAxisSettings, saveAxisSettings } from "../../../src/components/General/Table/Chart/application/axisPersistence";
import { initialApplicationSession, synchronizeApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { applyApplicationEditorTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionEdit";
import { sessionFixture } from "./applicationSessionFixture";

describe("saved semantic axis preferences", () => {
  const settings = (categoryType: string, timeFormat?: string) => ({ qopenbbAxisSettings: { version: 1, categoryType, ...(timeFormat === undefined ? {} : { timeFormat }) } });
  it("round trips Time including empty format while preserving concrete geometry", () => {
    const axes = sessionFixture().inputs.initialAxes;
    const changed = { ...axes, axes: axes.axes.map(a => ({ ...a, position: a.id === "category" ? "top" as const : "right" as const, options: { label: { rotation: 20 }, retained: 7 } })) };
    const restored = restoreAxisSettings(settings("time", ""), changed);
    expect(restored.axes[0]).toMatchObject({ type: "time", position: "top", options: { label: { format: "", rotation: 20 }, retained: 7 } });
    expect(restored.axes[1]).toEqual(changed.axes[1]);
    expect(saveAxisSettings(JSON.parse(JSON.stringify(saveAxisSettings({ unknown: 9 }, restored))), restored)).toMatchObject({ unknown: 9, ...settings("time", "") });
    expect(get(restoreAxisSettings(settings("time"), axes).axes[0].options, "label.format")).toBe("%d %B %Y");
    expect(restoreAxisSettings({}, axes)).toEqual(axes);
  });
  it.each([null, {}, { version: 2, categoryType: "time" }, { version: 1, categoryType: "bad" }, { version: 1, categoryType: "time", timeFormat: 2 }])("rejects malformed saved preferences %j", value => {
    const storage = { partition: { chartModel: { qopenbbAxisSettings: value } } };
    expect(initialApplicationSession(storage as any, sessionFixture().inputs, 1).error).toContain("qopenbbAxisSettings");
  });
  it("rejects a present undefined extension", () => {
    expect(() => readAxisSettings({ qopenbbAxisSettings: undefined } as any)).toThrow("qopenbbAxisSettings");
  });
  it("saves successful structural edits and restores a fresh session", () => {
    const storage = { partition: { chartModel: { unknown: { keep: true } } } };
    const context = sessionFixture(storage);
    const command = { stamp: context.local.stamp, family: context.inputs.family, intent: { panel: "axisStructure" as const, axis: "category" as const, edit: { field: "type" as const, value: "time" } } };
    const result = applyApplicationEditorTransaction(storage, context, command);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect((result.value.storage as any).partition.chartModel).toMatchObject({ unknown: { keep: true }, ...settings("time", "%d %B %Y") });
    const reopened = initialApplicationSession(JSON.parse(JSON.stringify(result.value.storage)), context.inputs, 2);
    expect(reopened.local.axes.categoryAxisType).toBe("time");
    expect(applyApplicationEditorTransaction(storage, context, { ...command, stamp: { ...command.stamp, generation: 99 } }).status).toBe("stale");
  });
  it("synchronizes replacement/removal but retains transient axes on ordinary updates", () => {
    const inputs = sessionFixture().inputs;
    const state = initialApplicationSession({}, inputs, 1);
    const moved = { ...state, local: { ...state.local, axes: { ...state.local.axes, axes: state.local.axes.axes.map(a => ({ ...a, position: a.id === "category" ? "top" as const : a.position })) } } };
    const replaced = synchronizeApplicationSession({ partition: { chartModel: settings("time", "%Y") } }, inputs, moved);
    expect(replaced.local.axes.axes[0]).toMatchObject({ type: "time", position: "top", options: { label: { format: "%Y" } } });
    const ordinary = synchronizeApplicationSession({ partition: { chartModel: { ...settings("time", "%Y"), unknown: 8 } } }, inputs, replaced);
    expect(ordinary.local.axes).toEqual(replaced.local.axes);
    const removed = synchronizeApplicationSession({ partition: { chartModel: { unknown: 8 } } }, inputs, ordinary);
    expect(removed.local.axes.axes[0]).toMatchObject({ type: "category", position: "top" });
  });
});
import { resolveCallerChart, changeCallerChartType } from "../../../src/components/General/Table/Chart/caller/chartInputs";

describe("caller preference integration", () => {
  const widget = (preference: unknown) => ({ id: "w", storage: { chartModel: { chartType: "groupedBar", qopenbbAxisSettings: preference, unknown: { keep: true } } } });
  const preference = { version: 1, categoryType: "time", timeFormat: "%Y" };
  it("restores horizontal orientation and clears only actual family changes", () => {
    const source = widget(preference);
    const result = resolveCallerChart(source, {}, [{ field: "period", chartDataType: "category" }, { field: "value", chartDataType: "series" }]);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.initialAxes.axes[0]).toMatchObject({ type: "time", direction: "y", position: "left", options: { label: { format: "%Y" } } });
    const same = changeCallerChartType(source, "groupedBar");
    expect(JSON.stringify(same)).toContain("qopenbbAxisSettings");
    const changed = changeCallerChartType(source, "line");
    const restored = resolveCallerChart(changed, {}, [{ field: "period", chartDataType: "category" }, { field: "value", chartDataType: "series" }]);
    expect(restored.valid && restored.value.initialAxes.categoryAxisType).toBe("category");
    expect(JSON.stringify(changed)).toContain('"unknown":{"keep":true}');
  });
  it("diagnoses malformed selected extension without falling back", () => {
    expect(resolveCallerChart(widget(null), {}, []).valid).toBe(false);
  });
  it("replaces Time format and removes it on Category/Number", () => {
    let context = sessionFixture();
    let storage: any = {};
    for (const [field, value] of [["type", "time"], ["timeFormat", ""], ["type", "category"], ["type", "number"]]) {
      const result = applyApplicationEditorTransaction(storage, context, { stamp: context.local.stamp, family: context.inputs.family, intent: { panel: "axisStructure", axis: "category", edit: { field, value } } } as any);
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      storage = result.value.storage;
      context = { ...context, local: result.value.local };
      const saved = storage.partition.chartModel.qopenbbAxisSettings;
      expect(saved.categoryType).toBe(context.local.axes.categoryAxisType);
      if (saved.categoryType !== "time") expect(saved).not.toHaveProperty("timeFormat");
      else expect(saved.timeFormat).toBe(field === "timeFormat" ? "" : "%d %B %Y");
    }
  });
  it("rejects malformed and stale external replacements before writing", () => {
    const context = sessionFixture();
    const command: any = { stamp: context.local.stamp, family: context.inputs.family, intent: { panel: "axisStructure", axis: "category", edit: { field: "type", value: "time" } } };
    expect(applyApplicationEditorTransaction({ partition: { chartModel: { qopenbbAxisSettings: null } } }, context, command).status).toBe("invalid");
    expect(applyApplicationEditorTransaction({ partition: { chartModel: { qopenbbAxisSettings: preference } } }, context, command).status).toBe("stale");
  });
});
