import type {
  HierarchyChartType,
  HierarchySnapshot,
} from "../compatibility/hierarchyContracts";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { RetainedApplicationCapture } from "./hierarchyTypes";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import type {
  HierarchySessionContext,
  HierarchySessionInputs,
} from "./hierarchySessionTypes";

export function isHierarchyChartFamily(value: unknown): value is HierarchyChartType {
  return value === "treemap" || value === "sunburst";
}
export function isHierarchyCapture(
  capture: RetainedApplicationCapture | undefined,
): capture is HierarchySnapshot {
  return (
    !!capture &&
    Object.hasOwn(capture, "kind") &&
    "kind" in capture &&
    capture.kind === "hierarchy"
  );
}
export function isOrdinaryCapture(
  capture: RetainedApplicationCapture | undefined,
): capture is ChartSnapshot {
  return !!capture && !isHierarchyCapture(capture);
}
export function hierarchyInputs(
  inputs: Omit<ApplicationSessionInputs<ApplicationChartFamily>, "categoryColumnId"> & {
    readonly categoryColumnId?: string;
  },
): HierarchySessionInputs {
  if (!isHierarchyChartFamily(inputs.family) || !inputs.hierarchyThemePalette)
    throw Error("Hierarchy theme and family are required");
  const policy = inputs.rangePolicy;
  if (policy && !policy.numericCollectionIds)
    throw Error("Hierarchy numeric collection is unavailable");
  const { categoryColumnId: _category, ...hierarchy } = inputs;
  return {
    ...hierarchy,
    family: inputs.family,
    hierarchyThemePalette: inputs.hierarchyThemePalette,
    rangePolicy: policy
      ? { ...policy, numericCollectionIds: policy.numericCollectionIds! }
      : undefined,
  };
}
export function hierarchyContextFor(
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
): HierarchySessionContext {
  if (!isHierarchyCapture(state.capture))
    throw Error("Chart is waiting for hierarchy rows");
  return {
    inputs: hierarchyInputs({ ...inputs, ...state.appearance }),
    local: state.local,
    capture: state.capture,
  };
}
