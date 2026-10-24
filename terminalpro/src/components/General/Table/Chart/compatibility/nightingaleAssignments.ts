import type {
  NightingaleChartType,
  NightingaleSeriesAssignment,
} from "./nightingaleContracts";
export type NightingaleAssignmentResult =
  | {
      readonly status: "resolved";
      readonly chartType: NightingaleChartType;
      readonly seriesType: "nightingale";
      readonly assignments: readonly NightingaleSeriesAssignment[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly diagnostics: readonly {
        readonly code: "invalid-input";
        readonly message: string;
      }[];
    };
function invalid(message: string): NightingaleAssignmentResult {
  return { status: "invalid", diagnostics: [{ code: "invalid-input", message }] };
}
function resolve(input: unknown): NightingaleAssignmentResult {
  if (!input || typeof input !== "object")
    return invalid("Expected Nightingale assignment input.");
  const { chartType, valueColumns } = input as Record<string, unknown>;
  if (chartType !== "nightingale") return invalid("Unsupported Nightingale family.");
  if (!Array.isArray(valueColumns)) return invalid("Expected value columns.");
  const seen = new Set<string>();
  const assignments: NightingaleSeriesAssignment[] = [];
  for (const column of valueColumns) {
    if (!column || typeof column !== "object")
      return invalid("Malformed value column.");
    const { colId, selected } = column;
    if (
      typeof colId !== "string" ||
      !colId ||
      typeof selected !== "boolean" ||
      seen.has(colId)
    )
      return invalid("Malformed or duplicate value column.");
    seen.add(colId);
    if (selected) assignments.push({ colId });
  }
  return {
    status: "resolved",
    chartType,
    seriesType: "nightingale",
    assignments,
    diagnostics: [],
  };
}
/** Selection order is the series order; Nightingale never truncates selected fields. */
export function resolveNightingaleAssignments(
  input: unknown,
): NightingaleAssignmentResult {
  try {
    return resolve(input);
  } catch {
    return invalid("Nightingale assignment input could not be safely read.");
  }
}
