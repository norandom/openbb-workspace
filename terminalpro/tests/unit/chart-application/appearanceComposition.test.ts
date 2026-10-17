import cloneDeep from "lodash/cloneDeep";
import merge from "lodash.merge";
import { describe, expect, it } from "vitest";
import { composeAppearanceOptions } from "../../../src/components/General/Table/Chart/application/appearanceComposition";
import type {
  AppearanceCompositionInput,
  ComposeAppearanceOptions,
} from "../../../src/components/General/Table/Chart/application/appearanceContracts";
import type { RuntimeOptions } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import fixtures from "./appearanceFixtures.json";

const compose: ComposeAppearanceOptions = composeAppearanceOptions;
const input = (
  options: RuntimeOptions = {},
  generated: RuntimeOptions = {},
): AppearanceCompositionInput => ({
  baseline: {
    stateAddress: "synthetic",
    chartType: "groupedColumn",
    model: { chartOptions: { bar: { title: { text: "WRONG OPERAND" } } } },
    options,
  },
  generated,
});
function value(candidate: AppearanceCompositionInput): RuntimeOptions {
  const result = compose(candidate);
  if (!result.valid) throw new Error(result.error);
  return result.value;
}
function invalid(candidate: unknown) {
  const result = compose(candidate as AppearanceCompositionInput);
  expect(result.valid).toBe(false);
  if (!result.valid) expect(typeof result.error).toBe("string");
}
function freeze(value: unknown) {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

// Owned useChartOptions.tsx:430-432 at 38dffc33389aca0e4a87e0e88d42f7067aa220df.
// Clone only isolates the source's mutations; expected fixtures remain independent.
function ownedSource(candidate: AppearanceCompositionInput): RuntimeOptions {
  const generated = cloneDeep(candidate.generated);
  const saved = cloneDeep(candidate.baseline.options);
  saved.common = generated.common;
  return merge(generated, saved);
}

describe("saved appearance composition", () => {
  it.each(fixtures.composition)("reproduces captured $id winners", (fixture) => {
    expect(value(fixture)).toStrictEqual(fixture.expected);
  });

  it("uses selected baseline options while retaining inactive families and unknown data", () => {
    const candidate = input(
      {
        bar: { title: { text: "SELECTED" } },
        line: { marker: { enabled: false, size: 7 } },
        unknown: { period: "quarter", values: [null, { currency: "USD" }] },
      },
      { bar: { title: { text: "GENERATED", enabled: true } } },
    );
    expect(value(candidate)).toStrictEqual({
      common: undefined,
      bar: { title: { text: "SELECTED", enabled: true } },
      line: { marker: { enabled: false, size: 7 } },
      unknown: { period: "quarter", values: [null, { currency: "USD" }] },
    });
    expect(candidate.baseline.model.chartOptions).toStrictEqual({
      bar: { title: { text: "WRONG OPERAND" } },
    });
  });

  it.each(
    [undefined, null, [], { legend: { position: "top" } }].map((common) => ({
      common,
    })),
  )("replaces saved common wholesale with generated $common", ({ common }) => {
    const result = value(input({ common: { savedOnly: true } }, { common }));
    expect(result).toStrictEqual({ common });
    expect(Object.hasOwn(result, "common")).toBe(true);
  });

  it("drops saved common when generated common is absent, preserving own undefined", () => {
    const result = value(input({ common: { savedOnly: true } }));
    expect(result).toStrictEqual({ common: undefined });
    expect(Object.hasOwn(result, "common")).toBe(true);
  });

  it("preserves lodash null, own undefined and indexed array semantics", () => {
    const candidate = input(
      {
        unknown: {
          keep: undefined,
          added: undefined,
          clear: null,
          array: [{ saved: 2 }, undefined, null],
        },
      },
      {
        unknown: {
          keep: "generated",
          clear: { generated: true },
          array: [{ generated: 1 }, "retained", "cleared", "tail"],
        },
      },
    );
    expect(value(candidate)).toStrictEqual({
      common: undefined,
      unknown: {
        keep: "generated",
        added: undefined,
        clear: null,
        array: [{ generated: 1, saved: 2 }, "retained", null, "tail"],
      },
    });
  });

  it("matches the pinned owned operation for mixed data-only operands", () => {
    const leaves = [undefined, null, false, 0, "", [], [undefined, null], { x: 1 }];
    for (const saved of leaves) {
      for (const generated of leaves) {
        const candidate = input(
          { common: { removed: true }, bar: { leaf: saved } },
          { common: { enabled: true }, bar: { leaf: generated } },
        );
        expect(value(candidate)).toStrictEqual(ownedSource(candidate));
      }
    }
  });

  it("leaves frozen input identities and contents intact, including aliased branches", () => {
    const shared = { values: [null, { currency: "USD" }] };
    const candidate = input(
      { common: { removed: true }, unknown: shared, another: shared },
      { common: { legend: { position: "top" } }, generatedOnly: shared },
    );
    const before = cloneDeep(candidate);
    freeze(candidate);
    const result = value(candidate);
    expect(candidate).toStrictEqual(before);
    expect(candidate.baseline.options.unknown).toBe(shared);
    expect(candidate.generated.generatedOnly).toBe(shared);
    expect(result).not.toBe(candidate.generated);
    expect(result.unknown).not.toBe(shared);
    expect(result.generatedOnly).not.toBe(shared);
    expect(result.common).not.toBe(candidate.generated.common);
    (result.unknown as RuntimeOptions).values = ["changed"];
    (result.common as RuntimeOptions).legend = null;
    expect(candidate).toStrictEqual(before);
  });

  it("accepts null-prototype option records without changing their source", () => {
    const options = Object.assign(Object.create(null), { unknown: { a: 1 } });
    expect(value(input(options))).toStrictEqual({
      unknown: { a: 1 },
      common: undefined,
    });
    expect(Object.getPrototypeOf(options)).toBe(null);
  });

  it.each(
    [undefined, null, [], 1, "options", new Date(0)].map((candidate) => ({
      candidate,
    })),
  )("rejects malformed top-level input $candidate", ({ candidate }) =>
    invalid(candidate));

  it.each(
    [
      undefined,
      null,
      [],
      () => "callback",
      new Date(0),
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ].map((options) => ({ options })),
  )("rejects invalid required option containers $options", ({ options }) => {
    invalid({ ...input(), generated: options });
    invalid({ ...input(), baseline: { ...input().baseline, options } });
  });

  it.each([
    () => "callback",
    new Date(0),
    new Map(),
    Symbol("value"),
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid nested option data %s in both operands", (leaf) => {
    invalid({ ...input(), generated: { unknown: { leaf } } });
    invalid({ ...input(), baseline: { ...input().baseline, options: { leaf } } });
  });

  it("rejects cycles in either operand and the stored model", () => {
    const cyclic: RuntimeOptions = {};
    cyclic.self = cyclic;
    invalid(input(cyclic));
    invalid(input({}, cyclic));
    invalid({ ...input(), baseline: { ...input().baseline, model: cyclic } });
  });

  it("rejects accessors at every public boundary without invoking getters", () => {
    let reads = 0;
    const accessor = () => ({
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("getter must not run");
      },
    });
    invalid(Object.defineProperty(input(), "baseline", accessor()));
    invalid(Object.defineProperty(input(), "generated", accessor()));
    const baseline = Object.defineProperty(input().baseline, "options", accessor());
    invalid({ ...input(), baseline });
    const nested = Object.defineProperty({}, "leaf", accessor());
    invalid(input(nested));
    invalid(input({}, { unknown: nested }));
    const model = Object.defineProperty({}, "chartOptions", accessor());
    invalid({ ...input(), baseline: { ...input().baseline, model } });
    expect(reads).toBe(0);
  });

  it("contains throwing and revoked proxies without ordinary property reads", () => {
    for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"]) {
      const proxy = new Proxy(
        { leaf: 1 },
        {
          [trap]: () => {
            throw new Error(trap);
          },
        },
      );
      invalid(proxy);
      invalid({ ...input(), baseline: proxy });
      invalid(input(proxy));
      invalid(input({}, { unknown: proxy }));
    }
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    invalid(revoked.proxy);
    invalid(input({}, revoked.proxy));
    let reads = 0;
    const proxy = new Proxy(input(), {
      get() {
        reads += 1;
        throw new Error("get");
      },
    });
    expect(value(proxy)).toStrictEqual({ common: undefined });
    expect(reads).toBe(0);
  });

  it("rejects non-enumerable, symbol and array-accessor data without executing callbacks", () => {
    let calls = 0;
    const callback = () => {
      calls += 1;
      return "USD";
    };
    invalid(input({}, { formatter: callback } as unknown as RuntimeOptions));
    invalid(input(Object.defineProperty({}, "hidden", { value: 1 })));
    invalid(input({ [Symbol("hidden")]: 1 }));
    const array = Object.defineProperty([], "0", { enumerable: true, get: callback });
    invalid(input({}, { unknown: array }));
    expect(calls).toBe(0);
  });
});
