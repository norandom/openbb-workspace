import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { translateHierarchy } from "../echarts/hierarchy";
import { projectHierarchyHover } from "../echarts/hierarchyChrome";
import { invalidSession } from "./applicationSessionEdit";
import { hierarchyColumns, selectHierarchySession } from "./hierarchySessionSelection";
import type {
  HierarchySessionInputs,
  HierarchySessionReady,
  HierarchySessionState,
} from "./hierarchySessionTypes";
import type { SessionResult } from "./types";

export function projectHierarchySession(
  storage: ChartStorageOutput,
  inputs: HierarchySessionInputs,
  state: HierarchySessionState,
): SessionResult<HierarchySessionReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectHierarchySession(
      storage,
      { inputs, local: state.local, capture: state.capture },
      state.viewport,
    );
    if (selected.status !== "ready") return selected;
    const selection = selected.value;
    const rendered = translateHierarchy(selection.mapping);
    if (rendered.status !== "supported")
      return {
        status: rendered.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: rendered.diagnostics,
      };
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "hierarchy",
        family: inputs.family,
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: rendered.options,
        hierarchyHover: projectHierarchyHover(selection.mapping),
        editor: selection.editor,
        model: selection.baseline.model,
        snapshot: selection.projection.source,
        setupProps: { columns: hierarchyColumns(inputs), selection: selection.setup },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid hierarchy projection",
    );
  }
}
