import type {
  RadialAssignmentResult,
  RadialSeriesAssignment,
} from "./radialContracts";
function invalid(message: string): RadialAssignmentResult {
  return {
    status: "invalid",
    diagnostics: [{ code: "invalid-input", message }],
  };
}
function resolve(input: unknown): RadialAssignmentResult {
  if (!input || typeof input !== "object")
    return invalid("Expected Radial assignment input.");
  const { chartType, valueColumns } = input as Record<string, unknown>;
  if (chartType !== "radialColumn" && chartType !== "radialBar")
    return invalid("Unsupported Radial family.");
  if (!Array.isArray(valueColumns)) return invalid("Expected value columns.");
  const seen = new Set<string>();
  const assignments: RadialSeriesAssignment[] = [];
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
    seriesType: chartType === "radialColumn" ? "radial-column" : "radial-bar",
    assignments,
    diagnostics: [],
  };
}
/** Selection order is the series order; Radial never truncates selected fields. */
export function resolveRadialAssignments(
  input: unknown,
): RadialAssignmentResult {
  try {
    return resolve(input);
  } catch {
    return invalid("Radial assignment input could not be safely read.");
  }
}
