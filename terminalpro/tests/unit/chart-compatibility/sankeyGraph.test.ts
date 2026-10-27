import { describe, expect, it, vi } from "vitest";
import type {
  SankeyMetadata,
  SankeySnapshot,
} from "../../../src/components/General/Table/Chart/compatibility/sankeyContracts";
import { buildSankeyGraph } from "../../../src/components/General/Table/Chart/compatibility/sankeyGraph";
import { validateSankeySnapshot } from "../../../src/components/General/Table/Chart/compatibility/sankeySnapshot";

const metadata: SankeyMetadata = {
  unit: "currency",
  currency: "USD",
  scale: 1,
  period: "AAPL FY2025",
  measure: "income-allocation",
};
function fixture(
  edges: readonly (readonly [unknown, unknown, unknown])[] = [
    ["Revenue", "Cost", 6],
    ["Revenue", "Profit", 4],
  ],
): SankeySnapshot {
  return {
    kind: "sankey",
    sourceMode: "flat",
    stateAddress: '["w","s"]',
    dataRevision: 2,
    originalModel: { chartType: "sankey" },
    selectedRange: { columns: ["from", "to", "value"] },
    selectedColumnIds: ["from", "to", "value"],
    columns: [
      { id: "from", label: "Source", role: "category" },
      { id: "to", label: "Target", role: "category" },
      { id: "value", label: "Amount", role: "number" },
    ],
    selection: {
      sourceColumnId: "from",
      targetColumnId: "to",
      valueColumnId: "value",
      metadata: { ...metadata },
      metadataColumnIds: {},
    },
    rows: edges.map(([source, target, value], i) => ({
      id: `r${i}`,
      source,
      target,
      value,
      metadata: { ...metadata },
      provenance: { rowId: `r${i}` },
    })),
  } as SankeySnapshot;
}
function ready(snapshot: SankeySnapshot) {
  const result = buildSankeyGraph(snapshot);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  return result;
}
describe("Sankey retained edge validation and allocation", () => {
  it("copies and deeply freezes safe JSON without retaining caller references", () => {
    const input = fixture();
    const result = validateSankeySnapshot(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.snapshot).not.toBe(input);
    expect(Object.isFrozen(result.snapshot.rows[0].metadata)).toBe(true);
    expect(Object.isFrozen(result.snapshot.originalModel)).toBe(true);
    expect(Object.isFrozen(ready(input).graph.links[0].rowIds)).toBe(true);
  });
  it("does not execute getters and rejects cycles, exotic data and sparse JSON", () => {
    const getter = vi.fn();
    const input = fixture();
    Object.defineProperty(input, "rows", { get: getter, enumerable: true });
    expect(validateSankeySnapshot(input).valid).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const sparse = Array(2);
    sparse[1] = 1;
    for (const value of [new Date(), sparse, { x: undefined }, { x: Symbol() }]) {
      expect(validateSankeySnapshot({ ...fixture(), originalModel: value }).valid).toBe(
        false,
      );
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(validateSankeySnapshot({ ...fixture(), selectedRange: cyclic }).valid).toBe(
      false,
    );
  });
  it.each([
    null,
    "",
    " ",
    {},
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ])("rejects invalid source %j without partial geometry", (source) => {
    const result = buildSankeyGraph(
      fixture([
        ["a", "b", 1],
        [source, "c", 2],
      ]),
    );
    expect(result).toMatchObject({
      status: "invalid",
      diagnostics: [{ severity: "error", rowIds: ["r1"], path: ["rows", 1, "source"] }],
    });
    expect(result).not.toHaveProperty("graph");
  });
  it.each([
    null,
    "1",
    -1,
    Number.POSITIVE_INFINITY,
    Number.NaN,
    true,
  ])("rejects invalid amount %j", (value) => {
    expect(buildSankeyGraph(fixture([["a", "b", value]]))).toMatchObject({
      status: "invalid",
      diagnostics: [{ rowIds: ["r0"], path: ["rows", 0, "value"] }],
    });
  });
  it("keeps typed node identities, whitespace, negative-zero normalization and dangerous object keys", () => {
    const { graph } = ready(
      fixture([
        [1, "sink", 1],
        ["1", "sink", 2],
        [true, "sink", 3],
        [-0, "sink", 4],
        [0, "sink", 5],
        [" a ", "__proto__", 6],
      ]),
    );
    expect(graph.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([
        '["number",1]',
        '["string","1"]',
        '["boolean",true]',
        '["number",0]',
        '["string"," a "]',
        '["string","__proto__"]',
      ]),
    );
    expect(graph.links.find((l) => l.source === '["number",0]')).toMatchObject({
      value: 9,
      rowIds: ["r3", "r4"],
    });
  });
  it("compensates duplicate sums in captured order and retains every contributing row", () => {
    const { graph } = ready(
      fixture([
        ["a", "b", 1e16],
        ["a", "b", 1],
        ["a", "b", 1],
        ["a", "b", 0],
      ]),
    );
    expect(graph.links).toHaveLength(1);
    expect(graph.links[0]).toMatchObject({
      value: 10000000000000002,
      rowIds: ["r0", "r1", "r2", "r3"],
    });
    expect(graph.links[0].id).toBe(
      JSON.stringify([
        JSON.stringify(["string", "a"]),
        JSON.stringify(["string", "b"]),
      ]),
    );
  });
  it("compensates distinct incoming/outgoing links without a sum-of-links total", () => {
    const { graph } = ready(
      fixture([
        ["a", "b", 1e16],
        ["a", "c", 1],
        ["a", "d", 1],
        ["b", "z", 1e16],
        ["c", "z", 1],
        ["d", "z", 1],
      ]),
    );
    expect(graph.nodes.find((n) => n.label === "a")?.outgoing).toBe(10000000000000002);
    expect(graph.nodes.find((n) => n.label === "z")?.incoming).toBe(10000000000000002);
    expect(graph).not.toHaveProperty("total");
  });
  it("rejects aggregate and node-total overflow", () => {
    for (const edges of [
      [
        ["a", "b", 1e308],
        ["a", "b", 1e308],
      ],
      [
        ["a", "b", 1e308],
        ["a", "c", 1e308],
      ],
    ] as const)
      expect(buildSankeyGraph(fixture(edges))).toMatchObject({ status: "invalid" });
  });
  it("rejects self-links and cycles including zero-valued edges", () => {
    for (const edges of [
      [["a", "a", 0]],
      [
        ["a", "b", 1],
        ["b", "c", 0],
        ["c", "a", 0],
      ],
    ] as const) {
      const result = buildSankeyGraph(fixture(edges));
      expect(result.status).toBe("invalid");
      if (result.status === "invalid")
        expect(result.diagnostics[0].rowIds).toEqual(edges.map((_, i) => `r${i}`));
    }
  });
  it("omits zero geometry while distinguishing no rows and zero-only", () => {
    expect(buildSankeyGraph(fixture([]))).toMatchObject({
      status: "empty",
      reason: "no-rows",
    });
    expect(buildSankeyGraph(fixture([["a", "b", 0]]))).toMatchObject({
      status: "empty",
      reason: "zero-only",
    });
    const { graph } = ready(
      fixture([
        ["a", "b", 0],
        ["x", "y", 1],
      ]),
    );
    expect(graph.snapshot.rows).toHaveLength(2);
    expect(graph.nodes.map((n) => n.label)).toEqual(["x", "y"]);
  });
  it("reports internal residual/tolerance without inventing source/sink observations", () => {
    const result = ready(
      fixture([
        ["a", "b", 10],
        ["b", "c", 9],
      ]),
    );
    expect(result.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "a",
          role: "source",
          residual: null,
          tolerance: null,
          balanced: null,
        }),
        expect.objectContaining({
          label: "b",
          role: "internal",
          incoming: 10,
          outgoing: 9,
          residual: 1,
          tolerance: 1e-9,
          balanced: false,
        }),
        expect.objectContaining({ label: "c", role: "sink", residual: null }),
      ]),
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          nodeId: '["string","b"]',
          rowIds: ["r0", "r1"],
          message: expect.stringContaining("residual 1"),
        }),
      ]),
    );
    const near = ready(
      fixture([
        ["a", "b", 0.3],
        ["b", "c", 0.1 + 0.2],
      ]),
    );
    expect(near.graph.nodes.find((n) => n.label === "b")?.balanced).toBe(true);
  });
  it.each([
    [10, 0, 10, ["a", "b"]],
    [0, 10, -10, ["b", "c"]],
  ] as const)("retains an observed zero counterpart for internal reconciliation (%s/%s)", (incoming, outgoing, residual, labels) => {
    const result = ready(
      fixture([
        ["a", "b", incoming],
        ["b", "c", outgoing],
      ]),
    );
    expect(result.graph.snapshot.rows).toHaveLength(2);
    expect(result.graph.links).toHaveLength(1);
    expect(result.graph.nodes.map((node) => node.label)).toEqual(labels);
    expect(result.graph.nodes.find((node) => node.label === "b")).toMatchObject({
      role: "internal",
      incoming,
      outgoing,
      residual,
      tolerance: 1e-9,
      balanced: false,
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "sankey-imbalance",
        severity: "warning",
        nodeId: '["string","b"]',
        rowIds: ["r0", "r1"],
        message: expect.stringContaining(`residual ${residual}`),
      }),
    ]);
  });
  it("rejects metadata disagreement even on zero rows and invalid monetary declarations", () => {
    for (const patch of [
      { currency: "EUR" },
      { scale: 2 },
      { period: "other" },
      { measure: "assets" },
      { currency: "usd" },
      { unit: "shares" },
      { scale: 0 },
    ]) {
      const input = fixture([
        ["a", "b", 1],
        ["b", "c", 0],
      ]);
      Object.assign(input.rows[1].metadata, patch);
      expect(buildSankeyGraph(input).status).toBe("invalid");
    }
  });
  it("keeps incomplete bound metadata unknown despite a declaration", () => {
    const input = fixture();
    Object.assign(input.rows[1].metadata, { period: null });
    const result = ready(input);
    expect(result.graph.reconciliation).toBe("unspecified-units");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          message:
            "Units or allocation scope unspecified; numerical balance is not financial reconciliation",
        }),
      ]),
    );
  });
  it("rejects duplicate row/column IDs and missing/distinct/range mappings", () => {
    for (const mutate of [
      (x: any) => (x.rows[1].id = "r0"),
      (x: any) => (x.columns[1].id = "from"),
      (x: any) => (x.selection.sourceColumnId = null),
      (x: any) => (x.selection.targetColumnId = "from"),
      (x: any) => (x.selectedColumnIds = ["from", "value"]),
      (x: any) => (x.selection.metadataColumnIds = { period: "missing" }),
    ]) {
      const input = fixture();
      mutate(input);
      expect(buildSankeyGraph(input).status).toBe("invalid");
    }
  });
  it("reconciles 12 explicit FY2025 allocation edges independently with BigInt identities", () => {
    const reported = [
      [124300000000, 66025000000, 58275000000],
      [95359000000, 50492000000, 44867000000],
      [94036000000, 50318000000, 43718000000],
      [102466000000, 54125000000, 48341000000],
    ];
    const edges = reported.flatMap(([revenue, cost, profit], i) => {
      expect(BigInt(cost) + BigInt(profit)).toBe(BigInt(revenue));
      return [
        ["FY2025 revenue (derived sum)", `Q${i + 1}`, revenue],
        [`Q${i + 1}`, "Cost of revenue", cost],
        [`Q${i + 1}`, "Gross profit", profit],
      ] as const;
    });
    const { graph, diagnostics } = ready(fixture(edges));
    expect(graph.links).toHaveLength(12);
    expect(
      graph.nodes.filter((n) => n.role === "internal").map((n) => n.residual),
    ).toEqual([0, 0, 0, 0]);
    expect(graph.nodes[0].outgoing).toBe(
      Number(reported.reduce((sum, row) => sum + BigInt(row[0]), 0n)),
    );
    expect(graph.nodes[0].outgoing).toBe(416161000000);
    expect(graph.reconciliation).toBe("declared-units");
    expect(diagnostics).toEqual([]);
  });
});
