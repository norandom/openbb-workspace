import { describe, expect, it } from "vitest";
import { validateHierarchySnapshot } from "../../../src/components/General/Table/Chart/compatibility/hierarchySnapshot";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
function fixture(): any {
  return {
    kind: "hierarchy",
    sourceMode: "flat",
    stateAddress: "s",
    dataRevision: 2,
    originalModel: { nested: [true] },
    selectedRange: { columns: ["region", "desk", "size"] },
    selectedColumnIds: ["region", "desk", "size"],
    categoryColumnIds: ["region", "desk"],
    columns: [
      { id: "region", label: "Region", role: "category" },
      { id: "desk", label: "Desk", role: "category" },
      { id: "size", label: "Size", role: "number", unit: "USD", scale: 1 },
    ],
    rows: [
      {
        id: "a",
        rawCategoryValues: [1, ""],
        categoryPath: ["1", ""],
        values: { size: -4 },
      },
      {
        id: "b",
        rawCategoryValues: ["1", null],
        categoryPath: ["1", null],
        values: {},
      },
      {
        id: "c",
        rawCategoryValues: [true, false],
        categoryPath: ["true", "false"],
        values: { size: 0 },
      },
    ],
  };
}
describe("hierarchy snapshot boundary", () => {
  it("retains raw scalar distinctions, signed values, missingness and detached frozen provenance", () => {
    const data = fixture();
    const result = validateHierarchySnapshot(data);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.snapshot).toEqual(data);
    expect(result.snapshot).not.toBe(data);
    expect(Object.isFrozen(result.snapshot.rows[0].rawCategoryValues)).toBe(
      true,
    );
    expect(Object.isFrozen(result.snapshot.originalModel)).toBe(true);
    expect(Object.isFrozen(data.originalModel)).toBe(false);
    data.originalModel.nested[0] = false;
    expect(result.snapshot.originalModel).toEqual({ nested: [true] });
  });
  it("preserves independent empty paths without numeric selections", () => {
    const data = fixture();
    Object.assign(data, {
      columns: [],
      selectedColumnIds: [],
      categoryColumnIds: [],
      rows: ["a", "b"].map((id) => ({
        id,
        rawCategoryValues: [],
        categoryPath: [],
        values: {},
      })),
    });
    expect(validateHierarchySnapshot(data)).toMatchObject({
      valid: true,
      snapshot: { rows: data.rows },
    });
  });
  it.each([
    ["kind", (d: any) => (d.kind = "ordinary")],
    ["sourceMode", (d: any) => (d.sourceMode = "pivot")],
    ["stateAddress", (d: any) => (d.stateAddress = "")],
    ["dataRevision", (d: any) => (d.dataRevision = Number.POSITIVE_INFINITY)],
    ["originalModel", (d: any) => delete d.originalModel],
    ["selectedColumnIds", (d: any) => d.selectedColumnIds.push("size")],
    ["categoryColumnIds", (d: any) => d.categoryColumnIds.reverse()],
    [
      "columns",
      (d: any) =>
        d.columns.push({ id: "extra", label: "Extra", role: "category" }),
    ],
    ["columns", (d: any) => (d.columns[2].scale = 0)],
    ["rows", (d: any) => (d.rows[1].id = "a")],
    ["rows", (d: any) => (d.rows[0].categoryPath = ["wrong", ""])],
    ["rows", (d: any) => (d.rows[0].rawCategoryValues = [])],
    ["rows", (d: any) => (d.rows[0].values.region = 2)],
    ["rows", (d: any) => (d.rows[0].values.size = undefined)],
    ["categoryColumnId", (d: any) => (d.categoryColumnId = "region")],
    ["rangeCategory", (d: any) => (d.rangeCategory = {})],
  ])("rejects invalid %s at the source root", (key, mutate) => {
    const d = fixture();
    mutate(d);
    const result = validateHierarchySnapshot(d);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].path[0]).toBe(key);
  });
  it("does not invoke getters or coercion hooks", () => {
    let calls = 0;
    const d = fixture();
    Object.defineProperty(d.originalModel, "secret", {
      enumerable: true,
      get() {
        calls++;
        throw Error("secret");
      },
    });
    expect(validateHierarchySnapshot(d).valid).toBe(false);
    expect(calls).toBe(0);
    const c = fixture();
    c.originalModel.self = c.originalModel;
    expect(validateHierarchySnapshot(c).valid).toBe(false);
  });
  it("safely rejects reflection traps with hostile thrown values", () => {
    let reads = 0;
    const thrown = new Proxy(
      {},
      {
        get() {
          reads++;
          throw 1;
        },
      },
    );
    const data = new Proxy(
      {},
      {
        ownKeys() {
          throw thrown;
        },
      },
    );
    expect(() => validateHierarchySnapshot(data)).not.toThrow();
    expect(validateHierarchySnapshot(data)).toMatchObject({
      valid: false,
      diagnostics: [{ path: [] }],
    });
    expect(reads).toBe(0);
  });
  it("preserves ordinary hostile-reflection fallback through the extracted copier", () => {
    let reads = 0;
    const thrown = new Proxy(
      {},
      {
        get() {
          reads++;
          throw 1;
        },
      },
    );
    const data = new Proxy(
      {},
      {
        ownKeys() {
          throw thrown;
        },
      },
    );
    expect(validateSnapshot(data)).toEqual({
      valid: false,
      diagnostics: [
        {
          code: "invalid-snapshot",
          path: [],
          message: "Snapshot could not be inspected safely",
        },
      ],
    });
    expect(reads).toBe(0);
  });
  it("retains unselected numeric descriptors and refuses sparse vectors and unsafe numeric values", () => {
    const d = fixture();
    d.columns.push({ id: "retained", label: "Retained", role: "number" });
    expect(validateHierarchySnapshot(d).valid).toBe(true);
    for (const mutate of [
      (x: any) => delete x.rows[0].categoryPath[0],
      (x: any) => (x.rows[0].values.size = Number.POSITIVE_INFINITY),
      (x: any) => (x.rows[0].rawCategoryValues[0] = undefined),
    ]) {
      const x = fixture();
      mutate(x);
      expect(validateHierarchySnapshot(x).valid).toBe(false);
    }
  });
});
