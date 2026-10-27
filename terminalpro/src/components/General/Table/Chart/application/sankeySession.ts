import type { SankeySnapshot } from "../compatibility/sankeyContracts";
import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import { captureDisplayedSankey } from "./sankeyCapture";
import { readSankeySetup } from "./sankeySelection";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import type {
  RangeResolutionResult,
  ResolveChartRangeInput,
  SessionResult,
} from "./types";

export function resolveSankeyRange(
  input: ResolveChartRangeInput,
): RangeResolutionResult {
  const stored = input.ignoreCellRange ? undefined : input.storedRange;
  const selected =
    stored?.columnIds ?? input.configuredColumnIds ?? input.generatedColumnIds;
  const columnIds = selected.filter((id) => input.generatedColumnIds.includes(id));
  return {
    status: "ready",
    diagnostics: [],
    range: {
      ...stored,
      columnIds,
      originalRange: { ...(stored?.originalRange as object), columns: columnIds },
    },
  };
}

export const sankeyColumns = (
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
) => inputs.columns.filter((column) => column.id !== DEFAULT_SETUP_CATEGORY);
export function captureSankeySession(
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
): SessionResult<SankeySnapshot> {
  const selected = readSankeySetup(state.local.sankeySetup);
  if (selected.diagnostics.length)
    return { status: "invalid", diagnostics: selected.diagnostics };
  if (!inputs.api) return { status: "waiting" };
  return captureDisplayedSankey({
    api: inputs.api,
    stamp: state.local.stamp,
    range: state.local.range,
    selection: selected.selection,
    columns: sankeyColumns(inputs),
    originalModel: JSON.parse(JSON.stringify(state.local.baseline.model)),
  });
}
export function sankeyCaptureDiagnostics(diagnostics: readonly SnapshotDiagnostic[]) {
  return diagnostics.map((issue) => ({
    ...issue,
    message: issue.path.length
      ? `${issue.message} (${issue.path.join(".")})`
      : issue.message,
    severity:
      "severity" in issue && issue.severity === "warning"
        ? ("warning" as const)
        : ("error" as const),
    rowIds:
      "rowIds" in issue && Array.isArray(issue.rowIds)
        ? (issue.rowIds as string[])
        : [],
  }));
}
