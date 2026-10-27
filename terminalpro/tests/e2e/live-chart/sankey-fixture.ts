import { expect } from "./fixtures";
import { hash, retainedHierarchy } from "./hierarchy-fixture";

export const sankeyColumns = ["source", "target", "value"] as const;
export const sankeyRoot = "FY2025 revenue (derived sum)";

export function retainedSankey() {
  const retained = retainedHierarchy();
  const quarters = retained.revenues.map((revenue, index) => {
    const leaves = retained.leaves.slice(index * 2, index * 2 + 2);
    expect(leaves).toHaveLength(2);
    expect(leaves[0].quarter).toBe(leaves[1].quarter);
    expect(leaves[0].date).toBe(leaves[1].date);
    expect(leaves.reduce((sum, leaf) => sum + BigInt(leaf.usd), 0n)).toBe(
      BigInt(revenue),
    );
    return {
      quarter: `${leaves[0].quarter} revenue (${leaves[0].date})`,
      date: leaves[0].date,
      revenue,
      leaves,
    };
  });
  // Reported amounts define widths; the graph structure is a derived allocation.
  const edges = quarters.flatMap(({ quarter, date, revenue, leaves }) => [
    {
      source: sankeyRoot,
      target: quarter,
      value: revenue,
      quarter,
      date,
      measure: "revenue",
      valueOrigin: "reported" as const,
    },
    ...leaves.map((leaf) => ({
      source: quarter,
      target: leaf.component,
      value: leaf.usd,
      quarter,
      date,
      measure: leaf.component === "Cost of revenue" ? "costOfRevenue" : "grossProfit",
      valueOrigin: "reported" as const,
    })),
  ]);
  expect(edges).toHaveLength(12);
  const rootTotal = quarters.reduce((sum, quarter) => sum + BigInt(quarter.revenue), 0n);
  expect(rootTotal).toBe(BigInt(retained.total));
  for (const edge of edges) expect(Number.isSafeInteger(edge.value)).toBe(true);
  const csv = `source,target,value\n${edges.map((edge) => `${edge.source},${edge.target},${edge.value}`).join("\n")}\n`;
  const provenance = {
    source: retained.provenance.source,
    source_sha256: retained.hashes.raw,
    endpoint: retained.provenance.endpoint,
    parameters: retained.provenance.parameters,
    retrieved_at: retained.provenance.retrieved_at,
    hierarchy_csv_sha256: retained.hashes.csv,
    hierarchy_provenance_sha256: retained.hashes.provenance,
    csv_sha256: hash(csv),
    symbol: "AAPL",
    fiscal_year: 2025,
    unit: "currency",
    currency: "USD",
    scale: 1,
    period: "AAPL FY2025",
    measure: "income-allocation",
    semantic: "derived-income-allocation",
    derivation: "Reported quarterly revenue is allocated to reported cost of revenue and gross profit. Directed links are derived, not supplied by FMP and not cash flows. The fiscal-year root is the sum of these four quarters, not an independently reported annual total. Shared component sinks aggregate the four selected quarters.",
    root: { label: sankeyRoot, total: Number(rootTotal), valueOrigin: "derived" },
    quarters: quarters.map(({ quarter, date, revenue, leaves }) => ({
      quarter,
      date,
      revenue,
      costOfRevenue: leaves[0].usd,
      grossProfit: leaves[1].usd,
      residual: 0,
    })),
  };
  return {
    csv,
    edges,
    total: retained.total,
    provenance,
    hashes: { ...retained.hashes, sankeyCsv: hash(csv) },
  };
}
