import type { RadarChartType, RadarSeriesAssignment } from "./radarContracts";
export type RadarAssignmentResult =
  | {
      readonly status: "resolved";
      readonly chartType: RadarChartType;
      readonly seriesType: "radar-line" | "radar-area";
      readonly assignments: readonly RadarSeriesAssignment[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly diagnostics: readonly {
        readonly code: "invalid-input";
        readonly message: string;
      }[];
    };
function invalid(message: string): RadarAssignmentResult {
  return { status: "invalid", diagnostics: [{ code: "invalid-input", message }] };
}
function resolve(input: unknown): RadarAssignmentResult {
  if (!input || typeof input !== "object")
    return invalid("Expected Radar assignment input.");
  const { chartType, valueColumns } = input as Record<string, unknown>;
  if (chartType !== "radarLine" && chartType !== "radarArea")
    return invalid("Unsupported Radar family.");
  if (!Array.isArray(valueColumns)) return invalid("Expected value columns.");
  const seen = new Set<string>();
  const assignments: RadarSeriesAssignment[] = [];
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
    seriesType: chartType === "radarLine" ? "radar-line" : "radar-area",
    assignments,
    diagnostics: [],
  };
}
/** Selection order is the series order; Radar never truncates selected fields. */
export function resolveRadarAssignments(input: unknown): RadarAssignmentResult {
  try {
    return resolve(input);
  } catch {
    return invalid("Radar assignment input could not be safely read.");
  }
}
