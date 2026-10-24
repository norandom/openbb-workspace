/** Retained FMP AAPL quarterly income response, retrieved 2026-10-20; reported USD. */
export const nightingaleRevenueComponents = {
  sourceSha256: "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b",
  fiscalYear: "2025",
  quarters: ["Q1", "Q2", "Q3", "Q4"],
  dates: ["2024-12-28", "2025-03-29", "2025-06-28", "2025-09-27"],
  costOfRevenue: [66025000000, 50492000000, 50318000000, 54125000000],
  grossProfit: [58275000000, 44867000000, 43718000000, 48341000000],
  // Reconciliation reference only: never a third stacked component.
  revenue: [124300000000, 95359000000, 94036000000, 102466000000],
} as const;

/** Distinct IDs retain repeated labels; missing is not an invented zero. */
export const nightingaleOriginalRows = [
  { id: "r1", category: "C", primary: 10, secondary: 5 },
  { id: "r2", category: "A", primary: -5, secondary: 10 },
  { id: "r3", category: "B", primary: 0, secondary: 15 },
  { id: "r4", category: "D", primary: null, secondary: 20 },
  { id: "r5", category: "A", primary: 20, secondary: 25 },
  { id: "r6", category: "E", primary: 30, secondary: 30 },
] as const;
