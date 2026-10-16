import cloneDeep from "lodash/cloneDeep";
import merge from "lodash.merge";
import { describe, expect, it } from "vitest";
import { reduceDetachedState } from "../../../src/components/General/Table/Chart/compatibility/detachedState";
import { mapColumnEditorEvent } from "../../../src/components/General/Table/Chart/compatibility/editorEvents";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import type { RuntimeOptions } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { ColumnEditorEvent } from "../../../src/components/General/Table/Chart/compatibility/optionStateTypes";
import { capturedEditorPayloads } from "./editorPayload.fixtures";

function patch(event: ColumnEditorEvent, chartType = "groupedColumn"): RuntimeOptions {
  const result = mapColumnEditorEvent({ chartType, event });
  if (!result.valid) throw new Error(result.error);
  return result.value;
}

describe("column editor patches", () => {
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
