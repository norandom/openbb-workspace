import { describe, expect, it } from "vitest";
import { projectHierarchySetup } from "../../../src/components/General/Table/Chart/application/hierarchySetupProjection";
import type { HierarchySnapshot } from "../../../src/components/General/Table/Chart/compatibility/hierarchyContracts";
function fixture(): HierarchySnapshot {
  return {
    kind: "hierarchy",
    sourceMode: "flat",
    stateAddress: "s",
    dataRevision: 1,
    categoryColumnIds: ["region", "desk"],
    selectedColumnIds: ["region", "desk", "size", "color"],
    columns: [
      { id: "region", label: "Region", role: "category" },
      { id: "desk", label: "Desk", role: "category" },
      { id: "size", label: "Size", role: "number", unit: "USD", scale: 1 },
      { id: "color", label: "Color", role: "number" },
    ],
    originalModel: { keep: true },
    selectedRange: {},
    rows: [
      {
        id: "a",
        rawCategoryValues: ["West", "Alpha"],
        categoryPath: ["West", "Alpha"],
        values: { size: 2, color: -10 },
      },
      {
        id: "b",
        rawCategoryValues: ["West", "Alpha"],
        categoryPath: ["West", "Alpha"],
        values: { size: 6, color: 20 },
      },
      {
        id: "c",
        rawCategoryValues: ["East", "Alpha"],
        categoryPath: ["East", "Alpha"],
        values: { size: -3 },
      },
    ],
  };
}
function ready<T>(result: { status: string; value?: T }): T {
  expect(result.status).toBe("ready");
  return result.value!;
}
describe("inactive hierarchy preparation", () => {
  it("reduces full paths independently and retains all raw rows", () => {
    const source = fixture();
    for (const [aggFunc, size, color] of [
      [undefined, 6, 20],
      ["sum", 8, 10],
      ["avg", 4, 5],
      ["count", 2, 2],
      ["first", 2, -10],
      ["last", 6, 20],
      ["min", 2, -10],
      ["max", 6, 20],
    ] as const) {
      const p = ready(
        projectHierarchySetup(source, {
          categoryIds: ["region", "desk"],
          seriesIds: ["size", "color"],
          ...(aggFunc ? { aggFunc } : {}),
        }),
      );
      expect(p.root.children.map((n) => n.label)).toEqual(["West", "East"]);
      expect(p.root.children[0].children[0].datum).toMatchObject({
        sourceRowIds: ["a", "b"],
        values: { size, color },
      });
      expect(p.source).toEqual(source);
      expect(p.source).not.toBe(source);
      expect(Object.isFrozen(p.root.children)).toBe(true);
      expect(p.root.children[1].children[0].ownWeight).toBe(
        aggFunc === "count" ? 1 : 0,
      );
    }
  });
});
it("keeps canonical collisions and corrected null identity separate", () => {
  const s = fixture();
  const raw = [1, "1", true, "true", null, "null", "", "__proto__", "a|b", "West"];
  const source: HierarchySnapshot = {
    ...s,
    rows: raw.map((v, i) => ({
      id: String(i),
      rawCategoryValues: [v, "West"],
      categoryPath: [v === null ? null : String(v), "West"],
      values: { size: i + 1 },
    })),
  };
  const p = ready(
    projectHierarchySetup(source, {
      categoryIds: s.categoryColumnIds,
      seriesIds: ["size"],
      aggFunc: "sum",
    }),
  );
  expect(p.root.children.map((n) => n.label)).toEqual([
    "1",
    "true",
    null,
    "null",
    "",
    "__proto__",
    "a|b",
    "West",
  ]);
  expect(p.root.children[0].subtreeWeight).toBe(3);
  expect(p.source.rows[0].rawCategoryValues[0]).toBe(1);
  expect(p.source.rows[1].rawCategoryValues[0]).toBe("1");
  const changed = ready(
    projectHierarchySetup(
      { ...source, rows: source.rows.map((r) => ({ ...r, values: { size: 1 } })) },
      p.selection,
    ),
  );
  expect(changed.root.children.map((n) => n.id)).toEqual(
    p.root.children.map((n) => n.id),
  );
  expect(p.root.children[7].id).not.toBe(p.root.children[7].children[0].id);
});
it("bypasses every operator with no categories and preserves missingness", () => {
  const s = fixture();
  const source: HierarchySnapshot = {
    ...s,
    columns: s.columns.filter((c) => c.role === "number"),
    categoryColumnIds: [],
    selectedColumnIds: ["size", "color"],
    rows: [
      { id: "missing", rawCategoryValues: [], categoryPath: [], values: { color: 9 } },
      {
        id: "null",
        rawCategoryValues: [],
        categoryPath: [],
        values: { size: null, color: -8 },
      },
      { id: "zero", rawCategoryValues: [], categoryPath: [], values: { size: 0 } },
      { id: "negative", rawCategoryValues: [], categoryPath: [], values: { size: -4 } },
    ],
  };
  for (const aggFunc of [
    undefined,
    "sum",
    "avg",
    "min",
    "max",
    "count",
    "first",
    "last",
  ] as const) {
    const p = ready(
      projectHierarchySetup(source, {
        categoryIds: [],
        seriesIds: ["size", "color"],
        ...(aggFunc ? { aggFunc } : {}),
      }),
    );
    expect(p.root.children).toHaveLength(4);
    expect(p.root.subtreeWeight).toBe(0);
    expect(new Set(p.root.children.map((n) => n.id)).size).toBe(4);
    expect(p.root.children.every((n) => n.label === null && n.path.length === 0)).toBe(
      true,
    );
    expect(p.root.children[0].datum!.values).toEqual({ color: 9 });
    expect(p.observationKind).toBe("raw-observations");
    expect(p.numericColumns[0].unit).toBe("USD");
  }
  expect(
    ready(projectHierarchySetup(source, { categoryIds: [], seriesIds: [] })).root
      .subtreeWeight,
  ).toBe(4);
  const reordered = ready(
    projectHierarchySetup(source, { categoryIds: [], seriesIds: ["color", "size"] }),
  );
  expect(reordered.assignments).toEqual({ sizeId: "color", colorId: "size" });
  expect(reordered.root.subtreeWeight).toBe(9);
});
it("retains absent endpoints, all-missing reductions and signed-zero ties", () => {
  const s = fixture();
  const source: HierarchySnapshot = {
    ...s,
    rows: s.rows.slice(0, 2).map<HierarchySnapshot["rows"][number]>((r, i) => ({
      ...r,
      values: (i ? { size: 0, color: null } : { size: -0 }) as Record<
        string,
        number | null
      >,
    })),
  };
  const selection = { categoryIds: s.categoryColumnIds, seriesIds: ["size", "color"] };
  const leaf = (aggFunc: "first" | "last" | "sum" | "avg" | "min" | "max") =>
    ready(projectHierarchySetup(source, { ...selection, aggFunc })).root.children[0]
      .children[0].datum!;
  expect(leaf("first").values).not.toHaveProperty("color");
  expect(leaf("last").values.color).toBeNull();
  for (const op of ["sum", "avg", "min", "max"] as const)
    expect(leaf(op).values.color).toBeNull();
  expect(Object.is(leaf("min").values.size, -0)).toBe(true);
  expect(Object.is(leaf("max").values.size, -0)).toBe(true);
  expect(Object.is(leaf("avg").values.size, 0)).toBe(true);
  const one = { ...source, rows: source.rows.slice(0, 1) };
  expect(
    Object.is(
      ready(projectHierarchySetup(one, { ...selection, aggFunc: "sum" })).root
        .children[0].children[0].datum!.values.size,
      -0,
    ),
  ).toBe(true);
});
it("rejects finite arithmetic overflow and malformed captures safely", () => {
  const s = fixture();
  const selection = { categoryIds: s.categoryColumnIds, seriesIds: ["size"] };
  const huge = {
    ...s,
    rows: s.rows.slice(0, 2).map((r) => ({ ...r, values: { size: Number.MAX_VALUE } })),
  };
  for (const aggFunc of ["sum", "avg"] as const)
    expect(projectHierarchySetup(huge, { ...selection, aggFunc }).status).toBe(
      "invalid",
    );
  expect(
    projectHierarchySetup(
      {
        ...huge,
        rows: huge.rows.map<HierarchySnapshot["rows"][number]>((r, i) => ({
          ...r,
          rawCategoryValues: [String(i), "x"],
          categoryPath: [String(i), "x"],
        })),
      },
      selection,
    ).status,
  ).toBe("invalid");
  expect(
    projectHierarchySetup(
      { ...s, rows: [{ ...s.rows[0], categoryPath: ["West"] }] },
      selection,
    ).status,
  ).toBe("invalid");
  expect(
    projectHierarchySetup(s, { ...selection, categoryIds: ["desk", "region"] }).status,
  ).toBe("invalid");
  expect(
    projectHierarchySetup(s, { ...selection, seriesIds: ["unknown"] }).status,
  ).toBe("invalid");
  expect(
    projectHierarchySetup(s, { ...selection, aggFunc: "bad" as never }).status,
  ).toBe("invalid");
  const unsafe = new Proxy(
    {},
    {
      ownKeys() {
        throw new Proxy(
          {},
          {
            get() {
              throw "unsafe";
            },
          },
        );
      },
    },
  );
  expect(projectHierarchySetup(unsafe as never, selection).status).toBe("invalid");
});
it("reconciles the retained eight FY2025 component leaves to reported USD revenue", () => {
  // Retained artifacts/chart-hierarchy/fmp/fy2025-hierarchy.csv, SHA256
  // ac090468f0d70e29ff2929dd2dfc4f887aca9629685911d923ba442440b96ebd.
  const csv = `Fiscal quarter,Revenue component,Amount (USD)
FY2025 Q1,Cost of revenue,66025000000
FY2025 Q1,Gross profit,58275000000
FY2025 Q2,Cost of revenue,50492000000
FY2025 Q2,Gross profit,44867000000
FY2025 Q3,Cost of revenue,50318000000
FY2025 Q3,Gross profit,43718000000
FY2025 Q4,Cost of revenue,54125000000
FY2025 Q4,Gross profit,48341000000`;
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line, i) => {
      const [quarter, component, amount] = line.split(",");
      return {
        id: `fmp-${i}`,
        rawCategoryValues: [quarter, component],
        categoryPath: [quarter, component],
        values: { size: Number(amount) },
      };
    });
  const s = fixture();
  const source: HierarchySnapshot = {
    ...s,
    selectedColumnIds: ["region", "desk", "size"],
    columns: s.columns.filter((c) => c.id !== "color"),
    rows,
  };
  const p = ready(
    projectHierarchySetup(source, {
      categoryIds: s.categoryColumnIds,
      seriesIds: ["size"],
      aggFunc: "sum",
    }),
  );
  expect(p.root.children.map((n) => n.subtreeWeight)).toEqual([
    124300000000, 95359000000, 94036000000, 102466000000,
  ]);
  expect(p.root.subtreeWeight).toBe(416161000000);
  expect(p.root.children.flatMap((n) => n.children)).toHaveLength(8);
  expect(
    p.root.children.flatMap((n) => n.children).map((n) => n.datum!.sourceRowIds),
  ).toEqual(rows.map((r) => [r.id]));
  expect(p.numericColumns).toMatchObject([{ id: "size", unit: "USD", scale: 1 }]);
  expect(p.source.rows).toEqual(rows);
});
it("does not read or freeze inherited numeric-record names", () => {
  const s = fixture();
  for (const id of ["__proto__", "toString"]) {
    const source: HierarchySnapshot = {
      ...s,
      columns: [
        ...s.columns.filter((c) => c.role === "category"),
        { id, label: id, role: "number" },
      ],
      selectedColumnIds: [...s.categoryColumnIds, id],
      rows: s.rows.slice(0, 2).map<HierarchySnapshot["rows"][number]>((r, i) => ({
        ...r,
        values: i ? JSON.parse(`{"${id}":7}`) : {},
      })),
    };
    for (const aggFunc of [undefined, "first", "last", "sum"] as const) {
      const p = ready(
        projectHierarchySetup(source, {
          categoryIds: s.categoryColumnIds,
          seriesIds: [id],
          ...(aggFunc ? { aggFunc } : {}),
        }),
      );
      const values = p.root.children[0].children[0].datum!.values;
      expect(Object.hasOwn(values, id)).toBe(aggFunc !== "first");
      if (Object.hasOwn(values, id)) expect(values[id]).toBe(7);
      expect(p.root.subtreeWeight).toBe(aggFunc === "first" ? 0 : 7);
    }
  }
  expect(Object.isFrozen(Object.prototype)).toBe(false);
});
