/** Retained FMP AAPL quarterly income response, retrieved 2026-10-20; raw USD. */
export const radarRevenue = {
  sourceSha256: "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b",
  quarters: ["Q1", "Q2", "Q3", "Q4"],
  series: [
    { fiscalYear: "2023", values: [117154000000, 94836000000, 81797000000, 89498000000] },
    { fiscalYear: "2024", values: [119575000000, 90753000000, 85777000000, 94930000000] },
    { fiscalYear: "2025", values: [124300000000, 95359000000, 94036000000, 102466000000] },
    { fiscalYear: "2026", values: [143756000000, 111184000000, 109417000000, null] },
  ],
} as const;

/** Separate row identities preserve repeated labels in the original Radar chart. */
export const radarOriginalRows = [
  { id: "r1", category: "C", primary: 10, secondary: 5 },
  { id: "r2", category: "A", primary: -5, secondary: 10 },
  { id: "r3", category: "B", primary: 0, secondary: 15 },
  { id: "r4", category: "D", primary: null, secondary: 20 },
  { id: "r5", category: "A", primary: 20, secondary: 25 },
  { id: "r6", category: "E", primary: 30, secondary: 30 },
] as const;
