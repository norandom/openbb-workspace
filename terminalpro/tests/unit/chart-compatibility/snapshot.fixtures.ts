import type { ResolvedSnapshotInput } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import type { ResolvedCartesianStyle } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";

/** Independently known valid input; no dependency on the future validator. */
export const validSnapshotInput: ResolvedSnapshotInput = {
  stateAddress: "synthetic/dashboard/table/chart",
  dataRevision: 7,
  originalModel: { chartType: "line", unknownOption: { enabled: true, levels: [1, null] } },
  sourceMode: "flat",
  selectedColumnIds: ["period", "revenue", "costs"],
  categoryColumnId: "period",
  columns: [
    { id: "period", label: "Period", role: "category" },
    { id: "revenue", label: "Amount", role: "number", unit: "USD", scale: 1000000, metadata: { financialMeaning: "Revenue" } },
    { id: "costs", label: "Amount", role: "number", unit: "USD", scale: 1000000, metadata: { financialMeaning: "Costs" } },
  ],
  rows: [
    { id: "r1", category: "2026-03-31", values: { revenue: 123.456789, costs: -40.125 } },
    { id: "r2", category: "2026-03-31", values: { revenue: 0, costs: null } },
    { id: "r3", category: "2025-12-31", values: { revenue: -5.25 } },
  ],
  selectedRange: { startRow: 0, endRow: 2, columns: ["period", "revenue", "costs"] },
};
export const validStyle: ResolvedCartesianStyle = {
  background: "#ffffff", palette: ["#145da0", "#b33b32"], textColor: "#202020",
  fontFamily: "sans-serif", fontSize: 12, title: "Revenue and Costs (USD millions)",
  legend: { visible: true, position: "bottom" },
  series: { revenue: { color: "#145da0", lineWidth: 2 }, costs: { color: "#b33b32", lineWidth: 1 } },
  precision: 2,
};
/** Runtime malformed inputs remain unknown; TypeScript is not a validation gate. */
export const invalidSnapshotInputs: readonly { readonly name: string; readonly input: unknown; readonly path: readonly (string | number)[] }[] = [
  { name: "nonfinite revision", input: { ...validSnapshotInput, dataRevision: Number.POSITIVE_INFINITY }, path: ["dataRevision"] },
  { name: "duplicate row", input: { ...validSnapshotInput, rows: [validSnapshotInput.rows[0], validSnapshotInput.rows[0]] }, path: ["rows", 1, "id"] },
  { name: "unknown selection", input: { ...validSnapshotInput, selectedColumnIds: ["period", "unknown"] }, path: ["selectedColumnIds", 1] },
  { name: "nonfinite observation", input: { ...validSnapshotInput, rows: [{ id: "r1", category: "A", values: { revenue: Number.NaN } }] }, path: ["rows", 0, "values", "revenue"] },
  { name: "undefined cell", input: { ...validSnapshotInput, rows: [{ id: "r1", category: "A", values: { revenue: undefined } }] }, path: ["rows", 0, "values", "revenue"] },
  { name: "invalid provenance", input: { ...validSnapshotInput, originalModel: { callback: () => 1 } }, path: ["originalModel", "callback"] },
];

