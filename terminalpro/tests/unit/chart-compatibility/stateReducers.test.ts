import { describe, expect, it } from "vitest";
import cloneDeep from "lodash/cloneDeep";
import merge from "lodash.merge";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import { reduceDetachedState } from "../../../src/components/General/Table/Chart/compatibility/detachedState";
import { validateIntegratedInput, validateDetachedInput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { IntegratedStateInput, DetachedStateInput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";

// Reference callback storage expressions from owned source 38dffc, lines 436-489 / 299-319.
function integratedReference(input: IntegratedStateInput) {
  const { theme: _theme, ...chartOptions } = merge(cloneDeep(input.resolvedOptions), input.eventOptions ?? {});
  const partition = input.storage[input.stateKey] as Record<string, unknown> | undefined;
  return { ...input.storage, totalSeries: input.totalSeries, chartType: input.chartType,
    isPivotMode: input.isPivotMode, [input.stateKey]: { ...partition,
      chartModel: { ...(partition?.chartModel as object), ...input.currentModel, chartOptions, chartType: input.chartType } } };
}
function detachedReference(input: DetachedStateInput) {
  return { ...input.storage, totalSeries: input.totalSeries, chartType: input.chartType,
    chartModel: { ...(input.storage.chartModel as object), chartType: input.chartType }, chartOptions: input.eventOptions };
}
function integrated(overrides: Partial<IntegratedStateInput> = {}): IntegratedStateInput {
  return { storage: { untouched: { rows: [null, { currency: "USD" }] }, range: {
    unknown: [false, { future: "kept" }], chartModel: { old: true, cellRange: { columns: ["old"], old: true },
      chartOptions: { storedOnly: true }, chartType: "old" } } }, stateKey: "range",
    currentModel: { cellRange: { columns: ["new"] }, unknownModel: { future: [null] } },
    resolvedOptions: { theme: "remove", nested: { theme: "keep", old: 1 },
      series: [{ stroke: "blue", width: 2 }, { trailing: true }], resolvedOnly: true },
    eventOptions: { series: [{ width: undefined, stroke: "red" }], nested: { old: null, added: undefined } },
    chartType: "future-family", totalSeries: 19, isPivotMode: false, ...overrides };
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
describe("integrated source-compatible reducer", () => {
  it.each([false, true])("preserves source merge, shallow overlay and caller count (pivot=%s)", (isPivotMode) => {
    const input = frozen(integrated({ isPivotMode }));
    const output = reduceIntegratedState(input);
    expect(output).toStrictEqual(integratedReference(input));
    const partition = output.range as { chartModel: Record<string, unknown> };
    expect(partition.chartModel.cellRange).toEqual({ columns: ["new"] });
    expect(partition.chartModel.chartOptions).toStrictEqual({ nested: { theme: "keep", old: null, added: undefined },
      series: [{ stroke: "red", width: 2 }, { trailing: true }], resolvedOnly: true });
    expect(output.untouched).toBe(input.storage.untouched);
    expect(output.totalSeries).toBe(19);
  });
  it.each([{}, { currentModel: undefined }, { storage: {} }])("supports omitted event options and optional models %j", (overrides) => {
    const input = frozen(integrated({ eventOptions: undefined, ...overrides }));
    expect(reduceIntegratedState(input)).toStrictEqual(integratedReference(input));
  });
  it.each(["totalSeries", "chartType", "isPivotMode", "chartModel", "chartOptions", ""]) (
    "retains computed property source ordering for collision %s", (stateKey) => {
      const input = frozen(integrated({ stateKey }));
      expect(reduceIntegratedState(input)).toStrictEqual(integratedReference(input));
    });
  it("merges nested arrays by index and preserves null and undefined source semantics", () => {
    const input = frozen(integrated({ resolvedOptions: { values: [1, 2, 3], nested: { values: [{ a: 1 }, { b: 2 }] },
      replaced: { value: 1 }, theme: "old" }, eventOptions: { values: [null, undefined],
      nested: { values: [{ c: 3 }] }, replaced: null, absent: undefined } }));
    const output = reduceIntegratedState(input);
    expect(output).toStrictEqual(integratedReference(input));
    expect((output.range as { chartModel: { chartOptions: unknown } }).chartModel.chartOptions).toStrictEqual({
      values: [null, 2, 3], nested: { values: [{ a: 1, c: 3 }, { b: 2 }] }, replaced: null, absent: undefined,
    });
    expect(validateIntegratedInput({ ...input, storage: output }).valid).toBe(true);
  });
  it("accepts repeated outputs through validation and keeps inputs unchanged", () => {
    const input = integrated(); const snapshot = cloneDeep(input);
    const first = reduceIntegratedState(input);
    const next = { ...input, storage: first, currentModel: (first.range as { chartModel: IntegratedStateInput["currentModel"] }).chartModel };
    expect(validateIntegratedInput(next).valid).toBe(true);
    expect(reduceIntegratedState(next)).toStrictEqual(integratedReference(next));
    expect(input).toStrictEqual(snapshot);
  });
});
describe("detached source-compatible reducer", () => {
  it.each([undefined, { theme: "keep", nested: { theme: null }, series: [{ value: undefined }] }])(
    "replaces options verbatim including omitted options %j", (eventOptions) => {
      const input = frozen({ storage: { chartModel: { chartType: "old", unknown: [null, { unit: "USD" }] },
        chartOptions: { old: true }, isPivotMode: true, partition: { chartModel: { future: true } } },
        chartType: "new", totalSeries: 43, eventOptions });
      const output = reduceDetachedState(input);
      expect(output).toStrictEqual(detachedReference(input));
      expect(Object.hasOwn(output, "chartOptions")).toBe(true);
      expect(output.chartOptions).toBe(eventOptions);
      expect(output.partition).toBe(input.storage.partition);
      expect(validateDetachedInput({ ...input, storage: output }).valid).toBe(true);
      expect(reduceDetachedState({ ...input, storage: output })).toStrictEqual(output);
    });
  it("supports missing model without synthesizing pivot state or mutating storage", () => {
    const input = frozen({ storage: { unknown: [1, null] }, chartType: "custom", totalSeries: 0 });
    expect(reduceDetachedState(input)).toStrictEqual({ unknown: [1, null], chartType: "custom", totalSeries: 0,
      chartModel: { chartType: "custom" }, chartOptions: undefined });
    expect(input.storage).toStrictEqual({ unknown: [1, null] });
  });
});
