import type { HierarchySnapshot } from "../compatibility/hierarchyContracts";
import { copySnapshotJson } from "../compatibility/snapshotJson";
import { invalidSession } from "./applicationSessionEdit";
import { captureDisplayedHierarchy } from "./hierarchyCapture";
import { hierarchyColumns } from "./hierarchySessionSelection";
import type {
  HierarchySessionInputs,
  HierarchySessionState,
} from "./hierarchySessionTypes";
import { selectHierarchySetup } from "./hierarchySetupSelection";
import type { SessionResult } from "./types";

/** Public grid reads occur before the replayable Widget transaction. */
export function captureHierarchySession(
  inputs: HierarchySessionInputs,
  state: HierarchySessionState,
  categoryIds?: readonly string[],
  requiredIds: readonly string[] = [],
): SessionResult<HierarchySnapshot> {
  if (!inputs.api) return { status: "waiting" };
  try {
    const available = hierarchyColumns(inputs);
    const selection = selectHierarchySetup(
      state.local.baseline.model,
      state.local.range,
      available,
    );
    if (selection.status !== "ready") return selection;
    const categories = categoryIds ?? selection.value.categoryIds;
    const numericIds = new Set(
      [
        ...selection.value.seriesIds,
        ...requiredIds,
        ...(state.capture?.selectedColumnIds ?? []),
      ].filter((id) =>
        available.some((column) => column.id === id && column.role === "number"),
      ),
    );
    const columnIds = [...categories, ...numericIds];
    return captureDisplayedHierarchy({
      api: inputs.api,
      stamp: state.local.stamp,
      range: { ...state.local.range, columnIds },
      categoryColumnIds: categories,
      columns: available.filter(
        (column) => column.role === "number" || categories.includes(column.id),
      ),
      originalModel: copySnapshotJson(state.local.baseline.model),
    });
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid hierarchy capture",
    );
  }
}
