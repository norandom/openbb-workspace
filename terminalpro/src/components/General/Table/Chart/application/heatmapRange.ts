import cloneDeep from "lodash/cloneDeep";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import { resolveChartRange } from "./chartRange";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import type { RangeResolutionResult, ResolveChartRangeInput } from "./types";

/** A saved single field retains the native selection, including no-series recovery. */
export function resolveHeatmapRange(
  input: ResolveChartRangeInput,
  columns: readonly SnapshotColumn[],
): RangeResolutionResult {
  const saved = !input.ignoreCellRange ? input.storedRange : undefined;
  if (!saved || saved.columnIds.length !== 1) return resolveChartRange(input);
  const id = saved.columnIds[0];
  const known = columns.some((column) => column.id === id);
  const available =
    input.definitionColumnIds.includes(id) &&
    (id === DEFAULT_SETUP_CATEGORY || input.generatedColumnIds.includes(id));
  if (!known || !available)
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-heatmap-range",
          path: ["storedRange", "columnIds"],
          message: "Saved Heatmap field must be available",
        },
      ],
    };
  return { status: "ready", range: cloneDeep(saved), diagnostics: [] };
}
