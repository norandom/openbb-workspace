import { describe, expect, it } from "vitest";
import { selectOptionBaseline } from "../../../src/components/General/Table/Chart/compatibility/optionState";

const initial = (extra: object = {}) => ({
  kind: "initialize",
  stateAddress: "a",
  initialChartType: "groupedColumn",
  ...extra,
});
const previous = {
  stateAddress: "old",
  model: { chartType: "line", unknown: [null, { x: 1 }] },
  options: { bar: { title: { text: "old" } } },
  chartType: "line",
};
function value(input: unknown) {
  const result = selectOptionBaseline(input);
  if (!result.valid) throw new Error(result.error);
  return result.value;
}
describe("stored option baseline", () => {
  it("retains and returns to populated partitions without shared prior values", () => {
    const empty = value({ kind: "synchronize", stateAddress: "empty", previous });
    const partitionModel = {
      chartType: "stackedColumn",
      chartOptions: { bar: { width: 4, missing: undefined } },
      future: [null, { x: 2 }],
    };
    const next = value({
      kind: "synchronize",
      stateAddress: "populated",
      partitionModel,
      previous: empty,
    });
    expect(next).toEqual({
      stateAddress: "populated",
      model: partitionModel,
      options: partitionModel.chartOptions,
      chartType: "stackedColumn",
    });
    expect(next.options.bar).not.toBe(partitionModel.chartOptions.bar);
    expect(next.options.bar).not.toBe(
      (next.model.chartOptions as Record<string, unknown>).bar,
    );
    expect(empty).toEqual({ ...previous, stateAddress: "empty" });
  });
  it("rejects unsafe array/object descriptors and hostile thrown errors without getters", () => {
    let calls = 0;
    const accessor = Object.defineProperty([], "0", {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    const hostileError = Object.defineProperty({}, "message", {
      get() {
        calls++;
        throw new Error("getter");
      },
    });
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw hostileError;
        },
      },
    );
    const nonenumerable = Object.defineProperty({}, "hidden", { value: 1 });
    for (const bad of [
      accessor,
      proxy,
      nonenumerable,
      { [Symbol("x")]: 1 },
      new (class extends Array {})(),
    ]) {
      expect(selectOptionBaseline(initial({ rootOptions: { bad } })).valid).toBe(false);
    }
    expect(calls).toBe(0);
  });
  it.each([
    [{}, {}, {}],
    [
      { rootModel: { root: true }, rootOptions: { root: true } },
      { root: true },
      { root: true },
    ],
    [
      { partitionModel: {}, rootModel: { root: true }, rootOptions: { root: true } },
      {},
      { root: true },
    ],
    [
      {
        partitionModel: { chartOptions: { p: [null, 1] } },
        rootOptions: { root: true },
      },
      { chartOptions: { p: [null, 1] } },
      { p: [null, 1] },
    ],
    [
      { partitionModel: { chartOptions: null }, rootOptions: { root: true } },
      { chartOptions: null },
      { root: true },
    ],
    [
      { partitionModel: { chartOptions: undefined }, rootOptions: { x: undefined } },
      { chartOptions: undefined },
      { x: undefined },
    ],
    [{ partitionModel: null, rootModel: null, rootOptions: null }, {}, {}],
    [
      { partitionModel: undefined, rootModel: undefined, rootOptions: undefined },
      {},
      {},
    ],
  ])("initializes using original precedence %j", (extra, model, options) => {
    expect(value(initial(extra))).toEqual({
      stateAddress: "a",
      model,
      options,
      chartType: "groupedColumn",
    });
  });
  it.each([
    undefined,
    null,
    {},
  ])("retains previous values on empty partition %j", (partitionModel) => {
    expect(
      value({ kind: "synchronize", stateAddress: "next", partitionModel, previous }),
    ).toEqual({ ...previous, stateAddress: "next" });
  });
  it.each([
    undefined,
    null,
    "",
    "stackedColumn",
  ])("replaces populated partition and resolves type %j", (chartType) => {
    const model =
      chartType === undefined ? { unknown: true } : { unknown: true, chartType };
    expect(
      value({
        kind: "synchronize",
        stateAddress: "next",
        partitionModel: model,
        previous,
      }),
    ).toEqual({
      stateAddress: "next",
      model,
      options: {},
      chartType: chartType || "line",
    });
  });
  it("copies selected options, model options, inputs and retained values independently", () => {
    const model = { chartType: "line", chartOptions: { nested: [{ x: 1 }] } };
    const result = value(initial({ partitionModel: model }));
    expect(result.chartType).toBe("groupedColumn");
    (result.options.nested as { x: number }[])[0].x = 9;
    expect(model.chartOptions.nested[0].x).toBe(1);
    expect(result.model.chartOptions).toEqual({ nested: [{ x: 1 }] });
    const retained = value({ kind: "synchronize", stateAddress: "b", previous });
    expect(retained.model).not.toBe(previous.model);
    expect(retained.options.bar).not.toBe(previous.options.bar);
  });
  it("preserves prototype-sensitive names as own data", () => {
    const options = JSON.parse(
      '{"__proto__":{"safe":1},"constructor":{"prototype":[null,2]},"toString":null}',
    );
    const result = value(
      initial({ partitionModel: { chartOptions: options }, rootOptions: options }),
    );
    expect(result.options).toEqual(options);
    expect(Object.hasOwn(result.options, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.options)).toBe(Object.prototype);
  });
  it.each([
    { rootModel: { chartType: undefined } },
    { rootModel: { chartType: 1 } },
    { rootModel: { other: undefined } },
    { rootModel: { chartOptions: [] } },
    { rootOptions: [] },
    { rootOptions: { n: Number.NaN } },
    { partitionModel: { chartOptions: "bad" } },
    { rootModel: new Date() },
    { rootOptions: { nested: new Map() } },
    { rootOptions: { fn: () => 1 } },
  ])("rejects malformed supplied unused fallbacks %j", (extra) => {
    expect(
      selectOptionBaseline(initial({ partitionModel: { chartOptions: {} }, ...extra }))
        .valid,
    ).toBe(false);
  });
  it("rejects accessors without invoking them and catches inspection errors", () => {
    let calls = 0;
    const getter = {
      get chartType() {
        calls++;
        return "line";
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("inspection");
        },
      },
    );
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const bad of [getter, proxy, cycle]) {
      expect(() => selectOptionBaseline(initial({ rootModel: bad }))).not.toThrow();
      expect(selectOptionBaseline(initial({ rootModel: bad })).valid).toBe(false);
    }
    expect(calls).toBe(0);
  });
  it.each([
    null,
    [],
    {},
    { kind: "other" },
    initial({ stateAddress: 1 }),
    initial({ initialChartType: null }),
    {
      kind: "synchronize",
      stateAddress: "b",
      previous: { ...previous, model: { chartType: undefined } },
    },
    {
      kind: "synchronize",
      stateAddress: "b",
      previous: { ...previous, options: { n: Number.POSITIVE_INFINITY } },
    },
    {
      kind: "synchronize",
      stateAddress: "b",
      previous: { ...previous, stateAddress: null },
    },
  ])("rejects malformed envelopes/previous %j", (input) => {
    expect(selectOptionBaseline(input).valid).toBe(false);
    expect(previous.options.bar.title.text).toBe("old");
  });
});
