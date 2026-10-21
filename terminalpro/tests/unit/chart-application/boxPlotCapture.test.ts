import { describe, expect, it } from "vitest";
import { captureBoxCategory } from "../../../src/components/General/Table/Chart/application/boxPlotCapture";

function captured(raw: unknown, defaultCategory = false, ordinal?: number) {
  const result = captureBoxCategory(raw, defaultCategory, ordinal);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected captured category");
  return result.value;
}

function unresolved(raw: unknown, selector?: unknown, ordinal?: number) {
  const defaultCategory = arguments.length > 1 ? selector : false;
  const result = captureBoxCategory(raw, defaultCategory as boolean, ordinal);
  expect(result.status).toBe("unresolved");
  if (result.status !== "unresolved") throw new Error("Expected capture diagnostic");
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]).toMatchObject({
    code: "box-category-capture",
    path: ["category"],
    message: expect.any(String),
  });
  expect(result.diagnostics[0].message.length).toBeGreaterThan(20);
}

// Membership expectations come from retained Grid34.1.1's two grouping stages.
function memberships(raw: readonly unknown[], aggregate: boolean) {
  const observations = raw.map((value, id) => ({ ...captured(value), ids: [id] }));
  const buckets = new Map<string, (typeof observations)[number]>();
  if (aggregate) {
    for (const observation of observations) {
      const bucket = buckets.get(observation.aggregationKey);
      if (bucket) bucket.ids.push(...observation.ids);
      else buckets.set(observation.aggregationKey, observation);
    }
  }
  const groups = new Map<string | number, number[][]>();
  for (const observation of aggregate ? buckets.values() : observations) {
    const group = groups.get(observation.category) ?? [];
    group.push(observation.ids);
    groups.set(observation.category, group);
  }
  return [...groups].map(([category, ids]) => ({ category, ids }));
}

describe("Box category identity capture", () => {
  it.each([
    "",
    "revenue",
    "1",
    "null",
    "undefined",
    "__proto__",
    "constructor",
    "toString",
  ])("preserves string category and raw aggregation key %j as data", (raw) =>
    expect(captured(raw)).toEqual({ category: raw, aggregationKey: raw }));

  it.each([
    1,
    -1,
    0,
    -0,
    0.5,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ])("preserves finite primitive number %s without losing its type or signed zero", (raw) => {
    const result = captured(raw);
    expect(Object.is(result.category, raw)).toBe(true);
    expect(result.aggregationKey).toBe(String(raw));
  });

  it("keeps missing-value raw keys distinct from their empty statistical category", () => {
    expect(captured(null)).toEqual({ category: "", aggregationKey: "null" });
    expect(captured(undefined)).toEqual({ category: "", aggregationKey: "undefined" });
    expect(captured(1)).not.toEqual(captured("1"));
    expect(memberships([null, undefined, "", "null", "undefined"], false)).toEqual([
      { category: "", ids: [[0], [1], [2]] },
      { category: "null", ids: [[3]] },
      { category: "undefined", ids: [[4]] },
    ]);
    expect(memberships([null, undefined, "", "null", "undefined"], true)).toEqual([
      { category: "", ids: [[0, 3], [1, 4], [2]] },
    ]);
  });

  it("preserves typed identities before raw-key aggregation", () => {
    expect(memberships([1, "1", -0, 0, "0"], false)).toEqual([
      { category: 1, ids: [[0]] },
      { category: "1", ids: [[1]] },
      { category: 0, ids: [[2], [3]] },
      { category: "0", ids: [[4]] },
    ]);
    expect(memberships([1, "1", -0, 0, "0"], true)).toEqual([
      { category: 1, ids: [[0, 1]] },
      { category: 0, ids: [[2, 3, 4]] },
    ]);
  });

  it("captures native Date identity and one-millisecond raw-key collision", () => {
    const epoch = 1704067200000;
    const date = Object.freeze(new Date(epoch));
    const later = new Date(epoch + 1);
    expect(captured(date)).toEqual({
      category: epoch,
      aggregationKey: Date.prototype.toString.call(date),
    });
    expect(captured(new Date(epoch))).toEqual(captured(date));
    expect(captured(later).category).toBe(epoch + 1);
    expect(captured(later).aggregationKey).toBe(captured(date).aggregationKey);
    expect(captured(epoch).aggregationKey).not.toBe(captured(date).aggregationKey);
    expect(memberships([date, new Date(epoch), epoch, later], false)).toEqual([
      { category: epoch, ids: [[0], [1], [2]] },
      { category: epoch + 1, ids: [[3]] },
    ]);
    expect(memberships([date, new Date(epoch), epoch, later], true)).toEqual([
      { category: epoch, ids: [[0, 1, 3], [2]] },
    ]);
  });

  it("returns detached scalar metadata without mutating the source Date", () => {
    const date = new Date(1704067200000);
    const before = date.getTime();
    const result = captured(date);
    expect(date.getTime()).toBe(before);
    date.setTime(0);
    expect(result).toEqual({
      category: before,
      aggregationKey: new Date(before).toString(),
    });
  });

  it("default selection never inspects raw input and preserves per-row aggregation keys", () => {
    const raw = new Proxy(
      {},
      {
        get() {
          throw new Error("raw must not be read");
        },
        getPrototypeOf() {
          throw new Error("raw must not be inspected");
        },
        getOwnPropertyDescriptor() {
          throw new Error("raw must not be inspected");
        },
      },
    );
    expect(captured(raw, true, 1)).toEqual({ category: 1, aggregationKey: "1" });
    expect(captured(raw, true, 2)).toEqual({ category: 1, aggregationKey: "2" });
    expect(captured(raw, true, Number.MAX_SAFE_INTEGER)).toEqual({
      category: 1,
      aggregationKey: String(Number.MAX_SAFE_INTEGER),
    });
    const rows = [captured(raw, true, 1), captured(raw, true, 2)];
    expect(new Set(rows.map((row) => row.aggregationKey)).size).toBe(2);
    expect(new Set(rows.map((row) => row.category))).toEqual(new Set([1]));
  });

  it.each([
    undefined,
    0,
    -0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "1",
    null,
    {},
  ])("rejects malformed or missing default row ordinal %j without coercing raw", (ordinal) => {
    const raw = Proxy.revocable({}, {});
    raw.revoke();
    unresolved(raw.proxy, true, ordinal as number | undefined);
  });

  it("does not inspect the unused ordinal with a nondefault category", () => {
    expect(captured("x", false, {} as number)).toEqual({
      category: "x",
      aggregationKey: "x",
    });
  });

  it.each([
    undefined,
    null,
    0,
    1,
    "true",
    {},
    new Boolean(false),
  ])("rejects a nonboolean selector %j", (selector) => unresolved("x", selector));

  it.each([
    true,
    false,
    Symbol("category"),
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    {},
    [],
    new Number(1),
    new String("x"),
  ])("rejects unsupported raw category %s", (raw) => unresolved(raw));

  it("rejects invalid, subclass, forged and proxied Dates", () => {
    class DerivedDate extends Date {}
    for (const raw of [
      new Date(Number.NaN),
      new DerivedDate(0),
      Object.create(Date.prototype),
      new Proxy(new Date(0), {}),
    ])
      unresolved(raw);
  });

  it("rejects a valid Date from another realm", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    try {
      const foreignWindow = iframe.contentWindow as unknown as {
        Date: DateConstructor;
      };
      const foreignDate = new foreignWindow.Date(0);
      expect(Date.prototype.getTime.call(foreignDate)).toBe(0);
      expect(Object.getPrototypeOf(foreignDate)).not.toBe(Date.prototype);
      unresolved(foreignDate);
    } finally {
      iframe.remove();
    }
  });

  it.each([
    "toString",
    "valueOf",
    Symbol.toPrimitive,
  ])("rejects Date own coercion hook %s without invoking its getter", (key) => {
    const date = new Date(0);
    let reads = 0;
    Object.defineProperty(date, key, {
      get() {
        reads += 1;
        throw new Error("arbitrary hook");
      },
    });
    unresolved(date);
    expect(reads).toBe(0);
  });

  it("rejects Date own coercion properties even when their values are undefined", () => {
    const date = new Date(0);
    Object.defineProperty(date, "valueOf", { value: undefined });
    unresolved(Object.freeze(date));
  });

  it("never coerces arbitrary objects and catches inspection failures", () => {
    let coercions = 0;
    unresolved(
      Object.freeze({
        [Symbol.toPrimitive]() {
          coercions += 1;
          throw new Error("coercion");
        },
      }),
    );
    expect(coercions).toBe(0);
    unresolved(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error("inspection failure");
          },
        },
      ),
    );
    unresolved(
      new Proxy(new Date(0), {
        getOwnPropertyDescriptor() {
          throw new Error("descriptor failure");
        },
      }),
    );
    const revoked = Proxy.revocable(new Date(0), {});
    revoked.revoke();
    unresolved(revoked.proxy);
  });
});
