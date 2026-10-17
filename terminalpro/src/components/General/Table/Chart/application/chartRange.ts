import cloneDeep from "lodash/cloneDeep";
import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type { ResolveChartRange } from "./types";

/** Preserve source selection order; generated IDs supply visibility, not a new ordering. */
export const resolveChartRange: ResolveChartRange = (input) => {
  const diagnostics: SnapshotDiagnostic[] = [];
  const stored =
    !input.ignoreCellRange && (input.storedRange?.columnIds.length ?? 0) > 1
      ? input.storedRange
      : undefined;
  let selected = stored?.columnIds;
  if (!selected && input.configuredColumnIds !== undefined) {
    selected = input.configuredColumnIds.filter((id) =>
      input.definitionColumnIds.includes(id),
    );
    if (selected.length === 0) {
      diagnostics.push({
        code: "empty-configured-range",
        path: ["configuredColumnIds"],
        message: "Configured columns match no definitions; using generated columns",
      });
      selected = undefined;
    }
  }
  selected ??= input.generatedColumnIds;
  const columnIds = selected.filter((id) => input.generatedColumnIds.includes(id));
  if (columnIds.length === 0)
    return {
      status: "unresolved",
      diagnostics: [
        ...diagnostics,
        {
          code: "empty-generated-intersection",
          path: ["generatedColumnIds"],
          message: "Selected range contains no generated columns",
        },
      ],
    };
  return {
    status: "ready",
    diagnostics,
    range: stored
      ? { ...cloneDeep(stored), columnIds }
      : { columnIds, originalRange: { columns: [...columnIds] } },
  };
};
