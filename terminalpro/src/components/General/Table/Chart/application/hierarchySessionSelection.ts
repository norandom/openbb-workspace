import isEqual from "lodash.isequal";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import { copySnapshotJson } from "../compatibility/snapshotJson";
import { validateHierarchySnapshot } from "../compatibility/hierarchySnapshot";
import { invalidSession } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { sessionBaseline } from "./applicationSessionSelection";
import { resolveHierarchyAppearance } from "./hierarchyAppearance";
import { projectHierarchyEditorState } from "./hierarchyEditorState";
import { resolveHierarchyRange } from "./hierarchyRange";
import { projectHierarchySetup } from "./hierarchySetupProjection";
import { selectHierarchySetup } from "./hierarchySetupSelection";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import type {
  HierarchyPreparedSelection,
  HierarchySessionContext,
  HierarchySessionInputs,
} from "./hierarchySessionTypes";
import type { ResolvedRange, SessionResult } from "./types";

export const hierarchyColumns = (inputs: HierarchySessionInputs) =>
  inputs.columns.filter((column) => column.id !== DEFAULT_SETUP_CATEGORY);
export const hierarchyRangeFrameKey = (
  inputs: HierarchySessionInputs,
  storage: ChartStorageOutput,
) =>
  inputs.rangePolicy
    ? JSON.stringify([inputs.rangePolicy, storage.ignoreCellRange === true])
    : undefined;
function savedRange(value: unknown): ResolvedRange | undefined {
  if (value == null) return;
  const copied = copySnapshotJson(value);
  const raw: Record<string, unknown> =
    copied && typeof copied === "object" && !Array.isArray(copied)
      ? Object.fromEntries(Object.entries(copied))
      : {};
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !Array.isArray(raw.columns) ||
    raw.columns.some((id) => typeof id !== "string")
  )
    throw Error("Invalid original range columns");
  return {
    columnIds: raw.columns as string[],
    originalRange: copied,
    ...(raw.rowStartIndex === undefined
      ? {}
      : { rowStartIndex: raw.rowStartIndex as number }),
    ...(raw.rowEndIndex === undefined
      ? {}
      : { rowEndIndex: raw.rowEndIndex as number }),
  };
}
export function hierarchySessionRange(
  storage: ChartStorageOutput,
  context: Pick<HierarchySessionContext, "inputs" | "local">,
): ResolvedRange {
  const { inputs, local } = context;
  const partition = storage[inputs.address.stateKey] as RuntimeOptions | undefined;
  const family = partition?.[inputs.family] as RuntimeOptions | undefined;
  const model = (partition?.chartModel ??
    storage.chartModel ??
    local.baseline.model) as RuntimeOptions;
  const matchingFrame =
    local.rangeFrameKey !== undefined &&
    local.rangeFrameKey === hierarchyRangeFrameKey(inputs, storage);
  const ignored = storage.ignoreCellRange === true;
  const stored =
    ignored && !matchingFrame
      ? undefined
      : savedRange(family?.cellRange ?? model.cellRange);
  const localOverride =
    matchingFrame &&
    stored &&
    isEqual(stored.columnIds, local.range.columnIds) &&
    stored.rowStartIndex === local.range.rowStartIndex &&
    stored.rowEndIndex === local.range.rowEndIndex;
  const range = resolveHierarchyRange({
    storedRange: localOverride
      ? local.range
      : (stored ?? (!inputs.rangePolicy ? inputs.range : undefined)),
    ignoreCellRange: localOverride ? false : ignored,
    configuredColumnIds: inputs.rangePolicy?.configuredColumnIds,
    generatedColumnIds:
      inputs.rangePolicy?.generatedColumnIds ??
      hierarchyColumns(inputs).map((column) => column.id),
    numericCollectionIds:
      inputs.rangePolicy?.numericCollectionIds ??
      hierarchyColumns(inputs)
        .filter((column) => column.role === "number")
        .map((column) => column.id),
    columns: hierarchyColumns(inputs),
  });
  if (range.status !== "ready")
    throw Error(range.diagnostics[0]?.message ?? "Invalid hierarchy range");
  return range.range;
}
/** Selection identity is checked without arithmetic, so an overflow can be repaired. */
export function selectHierarchySessionFrame(
  storage: ChartStorageOutput,
  context: HierarchySessionContext,
) {
  if (!isEqual(context.inputs.address, context.local.stamp.address))
    throw Error("Session address does not match the current frame");
  const baseline = sessionBaseline(storage, context);
  const range = hierarchySessionRange(storage, context);
  const setup = selectHierarchySetup(
    baseline.model,
    range,
    hierarchyColumns(context.inputs),
  );
  if (setup.status !== "ready") throw Error(setup.diagnostics[0].message);
  const capture = validateHierarchySnapshot(context.capture);
  if (!capture.valid) throw Error(capture.diagnostics[0].message);
  if (
    capture.snapshot.stateAddress !== context.inputs.address.stateAddress ||
    capture.snapshot.dataRevision !== context.local.stamp.dataRevision
  )
    throw Error("Capture does not match the current frame");
  return { baseline, range, setup: setup.value };
}
export function selectHierarchySession(
  storage: ChartStorageOutput,
  context: HierarchySessionContext,
  viewport: { readonly width: number; readonly height: number },
): SessionResult<HierarchyPreparedSelection> {
  try {
    const frame = selectHierarchySessionFrame(storage, context);
    const projected = projectHierarchySetup(context.capture, frame.setup);
    if (projected.status !== "ready") return projected;
    const projection = projected.value;
    const style = resolveHierarchyAppearance({
      family: context.inputs.family,
      baseline: frame.baseline,
      generated: context.inputs.generated,
      theme: context.inputs.theme,
      themePalette: context.inputs.hierarchyThemePalette,
      precision: context.inputs.precision,
      assignments: projection.assignments,
    });
    if (!style.valid) return invalidSession(style.error);
    return {
      status: "ready",
      stamp: context.local.stamp,
      value: {
        ...frame,
        projection,
        mapping: {
          family: context.inputs.family,
          projection,
          style: style.value,
          context: {
            display:
              projection.observationKind === "count"
                ? countDisplayPolicy(context.inputs.display)
                : context.inputs.display,
            viewport: { ...viewport },
          },
        },
        editor: projectHierarchyEditorState(style.value, projection.assignments),
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid hierarchy selection",
    );
  }
}
