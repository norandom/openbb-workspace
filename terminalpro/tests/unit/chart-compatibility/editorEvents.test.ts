import cloneDeep from "lodash/cloneDeep";
import merge from "lodash.merge";
import { describe, expect, it } from "vitest";
import { reduceDetachedState } from "../../../src/components/General/Table/Chart/compatibility/detachedState";
import { mapColumnEditorEvent } from "../../../src/components/General/Table/Chart/compatibility/editorEvents";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import type { RuntimeOptions } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { validateDetachedInput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { selectOptionBaseline } from "../../../src/components/General/Table/Chart/compatibility/optionState";
import type { ColumnEditorEvent } from "../../../src/components/General/Table/Chart/compatibility/optionStateTypes";
import { capturedEditorPayloads } from "./editorPayload.fixtures";

function patch(event: ColumnEditorEvent, chartType = "groupedColumn"): RuntimeOptions {
  const result = mapColumnEditorEvent({ chartType, event });
  if (!result.valid) throw new Error(result.error);
  return result.value;
}

describe("column editor patches", () => {
  it.each([
    "single",
    "shared",
    "compact",
  ] as const)("maps grouped tooltip %s to only the original bar mode leaf", (value) => {
    const event: ColumnEditorEvent = { kind: "tooltip-mode", value };
    const before = cloneDeep(event);
    expect(patch(event)).toEqual({ bar: { tooltip: { mode: value } } });
    expect(event).toEqual(before);
    expect(mapColumnEditorEvent({ chartType: "stackedColumn", event }).valid).toBe(
      false,
    );
  });
  it.each([
    "Multiple",
    "multiple",
    "Single",
    "Compact",
    "",
    null,
    undefined,
    true,
    1,
    { path: "bar.tooltip.mode", value: "shared" },
  ])("rejects tooltip labels and malformed stored modes: %j", (value) => {
    for (const chartType of ["groupedColumn", "stackedColumn"]) {
      expect(
        mapColumnEditorEvent({ chartType, event: { kind: "tooltip-mode", value } }),
      ).toMatchObject({ valid: false });
    }
  });
  it("rejects extra tooltip paths and descriptor traps without reading values", () => {
    let reads = 0;
    const accessor = {
      kind: "tooltip-mode",
      get value() {
        reads += 1;
        return "shared";
      },
    };
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("inspection trap");
        },
      },
    );
    for (const event of [
      accessor,
      hostile,
      { kind: "tooltip-mode", value: "shared", path: "series.tooltip" },
      { kind: "tooltip-mode", value: "shared", [Symbol("extra")]: true },
      Object.create({ kind: "tooltip-mode", value: "shared" }),
      Object.defineProperty({ kind: "tooltip-mode" }, "value", { value: "shared" }),
    ]) {
      expect(mapColumnEditorEvent({ chartType: "groupedColumn", event }).valid).toBe(
        false,
      );
    }
    expect(reads).toBe(0);
  });
  const cases: [ColumnEditorEvent, RuntimeOptions][] = [
    [
      { kind: "title-text", value: "Synthetic Revenue and EPS" },
      { bar: { title: { text: "Synthetic Revenue and EPS" } } },
    ],
    [{ kind: "title-text", value: "" }, { bar: { title: { text: "" } } }],
    ...[true, false].map((value): [ColumnEditorEvent, RuntimeOptions] => [
      { kind: "title-enabled", value },
      { bar: { title: { enabled: value } } },
    ]),
    ...(["top", "bottom", "left", "right"] as const).map(
      (value): [ColumnEditorEvent, RuntimeOptions] => [
        { kind: "legend-position", value },
        { bar: { legend: { position: value } } },
      ],
    ),
    ...[0, 0.5, 4].map((value): [ColumnEditorEvent, RuntimeOptions] => [
      { kind: "stroke-width", value },
      { bar: { series: { strokeWidth: value } } },
    ]),
  ];
  for (const family of ["groupedColumn", "stackedColumn"]) {
    it.each(cases)(`maps separate leaves for ${family}: %j`, (event, expected) => {
      expect(patch(event, family)).toEqual(expected);
    });
  }
  it("returns independent nested objects", () => {
    const event = { kind: "title-text", value: "first" } as const;
    const first = patch(event);
    (first.bar as RuntimeOptions).title = null;
    expect(patch(event)).toEqual({ bar: { title: { text: "first" } } });
  });
  it.each([
    null,
    [],
    1,
    {},
    { chartType: "groupedColumn" },
    ...[
      null,
      [],
      {},
      { kind: "other", value: 1 },
      { kind: "title-text", value: false },
      { kind: "title-enabled", value: "true" },
      { kind: "legend-position", value: "center" },
      ...[-1, Number.NaN, Number.POSITIVE_INFINITY, "4", undefined].map((value) => ({
        kind: "stroke-width",
        value,
      })),
    ].map((event) => ({ chartType: "groupedColumn", event })),
  ])("rejects malformed input without a partial patch: %j", (input) => {
    const result = mapColumnEditorEvent(input);
    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty("value");
  });
  it.each([
    "line",
    "bar",
    "pie",
    "",
    undefined,
  ])("diagnoses unsupported family %s", (chartType) => {
    const result = mapColumnEditorEvent({
      chartType,
      event: { kind: "title-text", value: "x" },
    });
    expect(result).toMatchObject({
      valid: false,
      error: expect.stringContaining("chartType"),
    });
  });
  it("never invokes getters and catches throwing inspection", () => {
    let reads = 0;
    const getter = {
      get value() {
        reads++;
        throw new Error("getter");
      },
      kind: "title-text",
    };
    const bad = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("proxy");
        },
      },
    );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const input of [
      bad,
      revoked.proxy,
      { chartType: "groupedColumn", event: getter },
      {
        get chartType() {
          reads++;
          return "groupedColumn";
        },
        event: {},
      },
    ]) {
      expect(mapColumnEditorEvent(input).valid).toBe(false);
    }
    expect(reads).toBe(0);
  });
});

describe("original reducer composition with supplied frozen baselines", () => {
  it("replays captured title, legend and stroke projections then destination families", () => {
    let options = cloneDeep(capturedEditorPayloads[0].model.chartOptions);
    const edits: ColumnEditorEvent[][] = [
      [
        { kind: "title-text", value: "Synthetic Revenue and EPS" },
        { kind: "title-enabled", value: true },
      ],
      [{ kind: "legend-position", value: "bottom" }],
      [{ kind: "stroke-width", value: 4 }],
      [],
      [],
      [],
    ];
    for (const [index, events] of edits.entries()) {
      const destination = capturedEditorPayloads[index + 1];
      for (const event of events) options = merge(cloneDeep(options), patch(event));
      const result = reduceIntegratedState({
        storage: {},
        stateKey: "default",
        currentModel: destination.model,
        resolvedOptions: options,
        eventOptions: {},
        chartType: destination.chartType,
        totalSeries: 2,
        isPivotMode: false,
      });
      expect(result.default).toEqual({ chartModel: destination.model });
    }
  });
  it("integrates baseline plus patch without losing unknown, null, undefined or array values", () => {
    const baseline: RuntimeOptions = {
      theme: "root",
      common: { theme: "nested" },
      custom: null,
      ownUndefined: undefined,
      list: [1, null, { retained: true }],
      bar: { title: { enabled: false } },
    };
    const before = cloneDeep(baseline);
    const result = reduceIntegratedState({
      storage: { default: { keep: true }, other: { untouched: true } },
      stateKey: "default",
      currentModel: { cellRange: { columns: ["period", "eps"] } },
      resolvedOptions: baseline,
      eventOptions: patch({ kind: "title-text", value: "" }),
      chartType: "stackedColumn",
      totalSeries: 2,
      isPivotMode: true,
    });
    expect(result).toEqual({
      other: { untouched: true },
      totalSeries: 2,
      chartType: "stackedColumn",
      isPivotMode: true,
      default: {
        keep: true,
        chartModel: {
          cellRange: { columns: ["period", "eps"] },
          chartType: "stackedColumn",
          chartOptions: {
            common: { theme: "nested" },
            custom: null,
            ownUndefined: undefined,
            list: [1, null, { retained: true }],
            bar: { title: { enabled: false, text: "" } },
          },
        },
      },
    });
    expect(baseline).toEqual(before);
  });
  it("retains lodash null, undefined and indexed array merge behavior beside the editor patch", () => {
    const result = reduceIntegratedState({
      storage: {},
      stateKey: "default",
      resolvedOptions: {
        nullable: { old: true },
        retained: 3,
        list: [{ old: true }, 2, 3],
      },
      eventOptions: merge(
        {
          nullable: null,
          retained: undefined,
          newUndefined: undefined,
          list: [{ added: true }],
        },
        patch({ kind: "stroke-width", value: 0 }),
      ),
      chartType: "groupedColumn",
      totalSeries: 1,
      isPivotMode: false,
    });
    expect(result.default).toEqual({
      chartModel: {
        chartType: "groupedColumn",
        chartOptions: {
          nullable: null,
          retained: 3,
          newUndefined: undefined,
          list: [{ old: true, added: true }, 2, 3],
          bar: { series: { strokeWidth: 0 } },
        },
      },
    });
  });
  it.each([
    "chartType",
    "totalSeries",
    "isPivotMode",
  ])("keeps computed partition last for collision %s", (stateKey) => {
    const result = reduceIntegratedState({
      storage: {},
      stateKey,
      currentModel: { cellRange: { columns: ["eps"] } },
      resolvedOptions: {},
      eventOptions: patch({ kind: "stroke-width", value: 4 }),
      chartType: "line",
      totalSeries: 1,
      isPivotMode: false,
    });
    expect(result[stateKey]).toEqual({
      chartModel: {
        chartType: "line",
        cellRange: { columns: ["eps"] },
        chartOptions: { bar: { series: { strokeWidth: 4 } } },
      },
    });
  });
  it("detached producer clones its complete event before replacement and retains inactive bar fields", () => {
    const complete: RuntimeOptions = {
      theme: "root-retained",
      common: { theme: "nested" },
      custom: null,
      ownUndefined: undefined,
      list: [1, null],
      bar: { title: { text: "saved", enabled: true } },
    };
    const before = cloneDeep(complete);
    const eventOptions = merge(
      cloneDeep(complete),
      patch({ kind: "stroke-width", value: 0.5 }),
    );
    for (const chartType of ["stackedColumn", "groupedColumn", "line"]) {
      const result = reduceDetachedState({
        storage: {
          chartOptions: { discarded: true },
          chartModel: { cellRange: { columns: ["eps"] } },
        },
        eventOptions,
        chartType,
        totalSeries: 1,
      });
      expect(result.chartOptions).toEqual({
        ...before,
        bar: { title: { text: "saved", enabled: true }, series: { strokeWidth: 0.5 } },
      });
      expect(result.chartModel).toEqual({ chartType, cellRange: { columns: ["eps"] } });
    }
    (eventOptions.list as unknown[]).push(2);
    expect(complete).toEqual(before);
  });
});

function baseline(input: unknown) {
  const result = selectOptionBaseline(input);
  if (!result.valid) throw new Error(result.error);
  return result.value;
}

function integratedEdit(
  previous: ReturnType<typeof baseline>,
  event: ColumnEditorEvent,
) {
  const storage = reduceIntegratedState({
    storage: {},
    stateKey: previous.stateAddress,
    currentModel: previous.model,
    resolvedOptions: previous.options,
    eventOptions: patch(event, previous.chartType),
    chartType: previous.chartType,
    totalSeries: 2,
    isPivotMode: false,
  });
  return baseline({
    kind: "synchronize",
    stateAddress: previous.stateAddress,
    previous,
    partitionModel: (storage[previous.stateAddress] as { chartModel: unknown })
      .chartModel,
  });
}

function initialBaseline() {
  return baseline({
    kind: "initialize",
    stateAddress: "revenue",
    partitionModel: capturedEditorPayloads[0].model,
    rootOptions: { ignoredFallback: true },
    initialChartType: "groupedColumn",
  });
}

describe("joined baseline, editor and reducer boundary", () => {
  it("selects captured options then persists successive edits including disabled title text", () => {
    const initial = initialBaseline();
    let selected = integratedEdit(initial, {
      kind: "title-text",
      value: "Retained revenue",
    });
    selected = integratedEdit(selected, { kind: "title-enabled", value: true });
    selected = integratedEdit(selected, { kind: "title-enabled", value: false });
    selected = integratedEdit(selected, { kind: "legend-position", value: "bottom" });
    selected = integratedEdit(selected, { kind: "stroke-width", value: 4 });
    expect(selected.options).toEqual({
      common: {
        legend: { position: "top", maxHeight: 50 },
        axes: { number: { label: { fontSize: 11 } } },
      },
      bar: {
        title: { text: "Retained revenue", enabled: false },
        legend: { position: "bottom" },
        series: { strokeWidth: 4 },
      },
    });
    expect(initial.model).toEqual(capturedEditorPayloads[0].model);
    expect(initial.options).toEqual(capturedEditorPayloads[0].model.chartOptions);
  });

  it.each([
    {},
    undefined,
  ])("retains edited values through an empty/absent partition: %j", (partitionModel) => {
    const edited = integratedEdit(initialBaseline(), {
      kind: "title-text",
      value: "Before transition",
    });
    const retained = baseline({
      kind: "synchronize",
      stateAddress: "empty",
      previous: edited,
      partitionModel,
    });
    expect(retained.stateAddress).toBe("empty");
    expect(retained.model).toEqual(edited.model);
    const next = integratedEdit(retained, { kind: "title-enabled", value: false });
    expect(next.options).toMatchObject({
      bar: { title: { text: "Before transition", enabled: false } },
    });
    const populated = baseline({
      kind: "synchronize",
      stateAddress: "populated",
      previous: next,
      partitionModel: {
        chartType: "stackedColumn",
        cellRange: { columns: ["period", "eps"] },
        chartOptions: { bar: { legend: { position: "left" } }, independent: 7 },
      },
    });
    const result = integratedEdit(populated, { kind: "stroke-width", value: 0.5 });
    expect(result.options).toEqual({
      bar: { legend: { position: "left" }, series: { strokeWidth: 0.5 } },
      independent: 7,
    });
    expect(result.model.cellRange).toEqual({ columns: ["period", "eps"] });
  });

  it("preserves edited bar options through supplied stacked, grouped and line destination ranges", () => {
    const edited = integratedEdit(initialBaseline(), {
      kind: "title-text",
      value: "Saved title",
    });
    for (const chartType of ["stackedColumn", "groupedColumn", "line"]) {
      const storage = reduceIntegratedState({
        storage: {},
        stateKey: edited.stateAddress,
        currentModel: {
          cellRange: { columns: ["period", "eps"], rowStartIndex: 3, rowEndIndex: 8 },
        },
        resolvedOptions: edited.options,
        eventOptions: {},
        chartType,
        totalSeries: 1,
        isPivotMode: false,
      });
      const selected = baseline({
        kind: "synchronize",
        stateAddress: edited.stateAddress,
        previous: edited,
        partitionModel: (storage.revenue as { chartModel: unknown }).chartModel,
      });
      expect(selected.chartType).toBe(chartType);
      expect(selected.model.cellRange).toEqual({
        columns: ["period", "eps"],
        rowStartIndex: 3,
        rowEndIndex: 8,
      });
      expect(selected.options).toMatchObject({
        bar: { title: { text: "Saved title" } },
      });
    }
  });

  it("replaces detached options using an explicit complete event after selected-baseline edits", () => {
    const selected = integratedEdit(initialBaseline(), {
      kind: "title-text",
      value: "Saved separately",
    });
    const completeEvent: RuntimeOptions = {
      theme: "explicit-event-theme",
      unrelated: { retained: true },
      bar: {
        title: { text: "Producer title", enabled: false },
        legend: { position: "right" },
      },
    };
    const before = cloneDeep(completeEvent);
    const eventOptions = merge(
      cloneDeep(completeEvent),
      patch({ kind: "stroke-width", value: 4 }, selected.chartType),
    );
    const input = validateDetachedInput({
      storage: { chartModel: selected.model, chartOptions: { discarded: true } },
      eventOptions,
      chartType: "line",
      totalSeries: 2,
    });
    if (!input.valid) throw new Error(input.error);
    const result = reduceDetachedState(input.value);
    expect(result.chartOptions).toEqual({
      theme: "explicit-event-theme",
      unrelated: { retained: true },
      bar: {
        title: { text: "Producer title", enabled: false },
        legend: { position: "right" },
        series: { strokeWidth: 4 },
      },
    });
    expect(result.chartModel).toEqual({ ...selected.model, chartType: "line" });
    expect(completeEvent).toEqual(before);
    expect(selected.options).toMatchObject({
      bar: { title: { text: "Saved separately" } },
    });
  });
});
