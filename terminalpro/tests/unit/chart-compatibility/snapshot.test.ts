import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import { invalidSnapshotInputs, validSnapshotInput } from "./snapshot.fixtures";

describe("resolved snapshot validation", () => {
  it.each(invalidSnapshotInputs)("rejects $name at its field path", ({ input, path }) => {
    const result = validateSnapshot(input);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics.map((item) => item.path)).toContainEqual(path);
  });
  it("copies ordered observations and provenance without numeric transformations", () => {
    const input = structuredClone(validSnapshotInput);
    const result = validateSnapshot(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.snapshot).toEqual(input);
    expect(result.snapshot.rows[1].values.revenue).toBe(0);
    expect(result.snapshot.rows[1].values.costs).toBeNull();
    expect(Object.hasOwn(result.snapshot.rows[2].values, "costs")).toBe(false);
    Reflect.set(input.rows[0].values, "revenue", 999);
    (input.originalModel as { chartType: string }).chartType = "changed";
    expect(result.snapshot.rows[0].values.revenue).toBe(123.456789);
    expect(result.snapshot.originalModel).toEqual(validSnapshotInput.originalModel);
    expect(result.snapshot.columns[1].metadata).not.toBe(input.columns[1].metadata);
  });
  it.each(["transformed", "grouped", "pivot", "remote-page"])("preserves valid %s source mode", (sourceMode) => {
    const result = validateSnapshot({ ...validSnapshotInput, sourceMode });
    expect(result.valid && result.snapshot.sourceMode).toBe(sourceMode);
  });
  it.each([
    { columns: [...validSnapshotInput.columns, validSnapshotInput.columns[0]] },
    { columns: validSnapshotInput.columns.slice(1) },
    { categoryColumnId: "revenue" },
    { selectedColumnIds: ["period"] },
    { selectedColumnIds: ["period", "revenue", "revenue"] },
    { selectedColumnIds: ["revenue"] },
    { columns: validSnapshotInput.columns.map((c) => ({ ...c, role: "category" })) },
    { columns: validSnapshotInput.columns.map((c) => ({ ...c, scale: 0 })) },
    { rows: [{ id: "a", category: Number.POSITIVE_INFINITY, values: {} }] },
    { rows: [{ id: "a", category: "A", values: { period: 1 } }] },
    { rows: [{ id: "a", category: "A", values: { unknown: 1 } }] },
    { selectedRange: undefined },
    { columns: validSnapshotInput.columns.map((c) => ({ ...c, metadata: { x: Number.NaN } })) },
  ])("rejects malformed association or data %j", (patch) => {
    expect(validateSnapshot({ ...validSnapshotInput, ...patch }).valid).toBe(false);
  });
  it("rejects cycles and accessors without executing getters or throwing", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(validateSnapshot({ ...validSnapshotInput, originalModel: cycle }).valid).toBe(false);
    const getter = Object.defineProperty({}, "unsafe", { enumerable: true, get() { throw new Error("executed"); } });
    expect(validateSnapshot({ ...validSnapshotInput, selectedRange: getter }).valid).toBe(false);
    expect(validateSnapshot(new Proxy({}, { ownKeys() { throw new Error("proxy"); } })).valid).toBe(false);
    const hostile = new Proxy({}, { get() { throw hostile; }, ownKeys() { throw hostile; } });
    expect(validateSnapshot(hostile).valid).toBe(false);
  });
  it("preserves special descriptor identities as own properties", () => {
    const input = {
      ...validSnapshotInput, selectedColumnIds: ["period", "__proto__", "constructor"],
      columns: [validSnapshotInput.columns[0], { id: "__proto__", label: "X", role: "number" }, { id: "constructor", label: "X", role: "number" }],
      rows: [{ id: "__proto__", category: 0, values: JSON.parse('{"__proto__":1,"constructor":0}') }],
    };
    const result = validateSnapshot(input);
    expect(result.valid).toBe(true);
    if (result.valid) expect(Object.getOwnPropertyDescriptor(result.snapshot.rows[0].values, "__proto__")?.value).toBe(1);
  });
});
