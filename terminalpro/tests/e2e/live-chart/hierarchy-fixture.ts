import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { expect } from "./fixtures";

export const hierarchyFamilies = ["Treemap", "Sunburst"] as const;
export type HierarchyFamily = (typeof hierarchyFamilies)[number];
export const categories = ["Fiscal Quarter", "Revenue Component"];
export const amount = "Amount (USD)";
export const components = ["Cost of revenue", "Gross profit"];
export const duplicatePaths =
  "Region,Desk,Size,Color,Reserve\nWest,Alpha,2,-10,101\nEast,Alpha,3,10,102\nWest,Beta,5,0,103\nWest,Alpha,6,20,104\nEast,Gamma,4,,105\n";
export const edgeSizes =
  "Group,Leaf,Size\nEdge,Missing,\nEdge,Zero,0\nEdge,Negative,-4\nEdge,Valid,8\n";
export const equalColors = "Group,Leaf,Size,Color\nKeep,A,8,50\nKeep,B,12,50\n";
export const signedColors =
  "Group,Leaf,Size,Color\nKeep,Negative,8,-10\nKeep,Positive,12,20\nKeep,Missing,4,\n";
export const missingColors =
  "Group,Leaf,Size,Color\nDrop,Anchor,1,50\nKeep,A,8,\nKeep,B,12,\n";
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const rawHash = "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b";
const csvHash = "ac090468f0d70e29ff2929dd2dfc4f887aca9629685911d923ba442440b96ebd";
const amounts = [
  [66025000000, 58275000000],
  [50492000000, 44867000000],
  [50318000000, 43718000000],
  [54125000000, 48341000000],
];
const revenues = [124300000000, 95359000000, 94036000000, 102466000000];
const dates = ["2024-12-28", "2025-03-29", "2025-06-28", "2025-09-27"];

export function retainedHierarchy() {
  const directory = (name: string) => {
    const value = process.env[name];
    if (!value || !isAbsolute(value))
      throw Error(`Absolute retained evidence directory required: ${name}`);
    return value;
  };
  const root = directory("QOPENBB_HIERARCHY_FMP_EVIDENCE");
  const raw = readFileSync(
    join(directory("QOPENBB_HIERARCHY_RAW_FMP_EVIDENCE"), "raw.json"),
  );
  const csv = readFileSync(join(root, "fy2025-hierarchy.csv"), "utf8");
  const provenanceBytes = readFileSync(join(root, "provenance.json"));
  const provenance = JSON.parse(provenanceBytes.toString("utf8"));
  expect(hash(raw)).toBe(rawHash);
  expect(hash(csv)).toBe(csvHash);
  expect(provenance).toMatchObject({
    currency: "USD",
    fiscal_year: 2025,
    source_sha256: rawHash,
    csv_sha256: csvHash,
    total: 416161000000,
  });
  const records = (
    JSON.parse(raw.toString("utf8")) as Record<string, unknown>[]
  ).filter((row) => row.symbol === "AAPL" && String(row.fiscalYear) === "2025");
  expect(records).toHaveLength(4);
  const leaves = amounts.flatMap((values, q) => {
    const period = `Q${q + 1}`;
    const expected = {
      period,
      date: dates[q],
      costOfRevenue: values[0],
      grossProfit: values[1],
      revenue: revenues[q],
    };
    expect(records.filter((row) => row.period === period)).toHaveLength(1);
    expect(records.find((row) => row.period === period)).toMatchObject({
      ...expected,
      reportedCurrency: "USD",
    });
    expect(provenance.quarters[q]).toMatchObject(expected);
    for (const value of [...values, revenues[q]])
      expect(Number.isSafeInteger(value)).toBe(true);
    expect(BigInt(values[0]) + BigInt(values[1])).toBe(BigInt(revenues[q]));
    return values.map((usd, field) => ({
      quarter: `FY2025 ${period}`,
      component: components[field],
      usd,
      revenue: revenues[q],
      date: dates[q],
    }));
  });
  expect(provenance.quarters).toHaveLength(4);
  expect(leaves.reduce((sum, leaf) => sum + BigInt(leaf.usd), 0n)).toBe(416161000000n);
  expect(csv.replaceAll("\r\n", "\n")).toBe(
    `Fiscal quarter,Revenue component,Amount (USD)\n${leaves.map((leaf) => `${leaf.quarter},${leaf.component},${leaf.usd}`).join("\n")}\n`,
  );
  return {
    csv,
    leaves,
    revenues,
    total: 416161000000,
    provenance,
    hashes: { raw: hash(raw), csv: hash(csv), provenance: hash(provenanceBytes) },
  };
}
