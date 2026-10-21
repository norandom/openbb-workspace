import { commitFamilyTransition, familyColumns } from "./familyTransition";
import cloneDeep from "lodash/cloneDeep";
import {
  resolveComboAssignments,
  type ComboChartType,
} from "../compatibility/comboAssignments";
import type {
  ChartModel,
  ChartStorageOutput,
} from "../compatibility/legacyTypes";
import { sessionBaseline, sessionRange } from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
  ApplicationSessionLocal,
} from "./applicationSessionTypes";
import {
  isComboChartFamily,
  type ApplicationChartFamily,
  type ComboAssignmentCommand,
  type ComboSessionAssignmentSelection,
  type ComboSessionContext,
} from "./comboSessionTypes";
import type { ResolvedRange, SessionResult, SessionStamp } from "./types";

function invalid(message: string): SessionResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "combo-session", path: [], message }],
  };
}
function resolve(
  context: ApplicationSessionContext<ApplicationChartFamily>,
  range: ResolvedRange,
  chartType: ComboChartType,
  saved?: unknown,
) {
  return resolveComboAssignments({
    chartType,
    valueColumns: familyColumns(context, range),
    ...(saved === undefined ? {} : { seriesChartTypes: saved }),
  });
}
export function initializeComboSession(
  context: ComboSessionContext,
): SessionResult<ApplicationSessionLocal> {
  const { local, inputs } = context;
  const resolved = resolve(
    context,
    local.range,
    inputs.family,
    local.baseline.model.seriesChartTypes,
  );
  if (resolved.status !== "resolved")
    return invalid(resolved.diagnostics[0].message);
  const model = {
    ...local.baseline.model,
    chartType: resolved.chartType,
    seriesChartTypes: cloneDeep(resolved.seriesChartTypes),
  } as unknown as ChartModel;
  return {
    status: "ready",
    stamp: local.stamp,
    value: {
      ...local,
      baseline: { ...local.baseline, chartType: resolved.chartType, model },
      ...(resolved.chartType === "customCombo"
        ? { savedCustomSeriesChartTypes: cloneDeep(resolved.seriesChartTypes) }
        : {}),
    },
  };
}
function captureMatches(
  context: ApplicationSessionContext<ApplicationChartFamily>,
  range: ResolvedRange,
) {
  const { capture, local, inputs } = context;
  if (
    capture.stateAddress !== inputs.address.stateAddress ||
    capture.dataRevision !== local.stamp.dataRevision
  )
    return false;
  if (
    local.stamp.address.stateAddress !== inputs.address.stateAddress ||
    local.baseline.stateAddress !== inputs.address.stateAddress
  )
    return false;
  if (JSON.stringify(range) !== JSON.stringify(local.range)) return false;
  return familyColumns(context, range)
    .filter((c) => c.selected)
    .every(
      (c) =>
        capture.selectedColumnIds.includes(c.colId) &&
        capture.columns.some(
          (value) => value.id === c.colId && value.role === "number",
        ),
    );
}
export function selectComboSessionAssignments(
  storage: ChartStorageOutput,
  context: ComboSessionContext,
): SessionResult<ComboSessionAssignmentSelection> {
  try {
    const baseline = sessionBaseline(storage, context);
    const range = sessionRange(storage, context);
    if (!captureMatches(context, range)) return { status: "stale" };
    if (!isComboChartFamily(baseline.chartType)) return { status: "stale" };
    // Live builtin selection bypasses initialization: serialized builtin assignments do not change its identity.
    const restoredCustom =
      context.local.baseline.chartType === "customCombo" &&
      baseline.chartType === context.inputs.family;
    const saved =
      baseline.chartType === "customCombo" || restoredCustom
        ? baseline.model.seriesChartTypes
        : undefined;
    const resolved = resolve(
      context,
      range,
      restoredCustom ? "customCombo" : baseline.chartType,
      saved,
    );
    if (resolved.status !== "resolved")
      return invalid(resolved.diagnostics[0].message);
    return {
      status: "ready",
      stamp: context.local.stamp,
      value: {
        baseline: {
          ...baseline,
          chartType: resolved.chartType,
          model: { ...baseline.model, chartType: resolved.chartType },
        },
        range,
        chartType: resolved.chartType,
        seriesChartTypes: resolved.seriesChartTypes,
        diagnostics: resolved.diagnostics,
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Selected chart family changed"
    )
      return { status: "stale" };
    return invalid(
      error instanceof Error ? error.message : "Invalid combo selection",
    );
  }
}
export function applyComboAssignmentTransaction(
  storage: ChartStorageOutput,
  context: ComboSessionContext,
  command: ComboAssignmentCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(
    command.stamp,
    context.local.stamp,
  );
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  const selected = selectComboSessionAssignments(storage, context);
  if (selected.status !== "ready") return selected;
  if (
    !familyColumns(context, selected.value.range).some(
      (c) => c.selected && c.colId === command.intent.colId,
    )
  )
    return { status: "stale" };
  const current = resolve(
    context,
    selected.value.range,
    "customCombo",
    selected.value.baseline.model.seriesChartTypes ??
      selected.value.seriesChartTypes,
  );
  if (current.status !== "resolved")
    return invalid(current.diagnostics[0].message);
  const requested = current.seriesChartTypes.map((value) =>
    value.colId !== command.intent.colId
      ? value
      : {
          ...value,
          ...(command.intent.edit.kind === "type"
            ? { chartType: command.intent.edit.value }
            : { secondaryAxis: command.intent.edit.value }),
        },
  );
  const resolved = resolve(
    context,
    selected.value.range,
    "customCombo",
    requested,
  );
  if (resolved.status !== "resolved")
    return invalid(resolved.diagnostics[0].message);
  const local = {
    ...context.local,
    savedCustomSeriesChartTypes: cloneDeep(resolved.seriesChartTypes),
  };
  return commitFamilyTransition(
    storage,
    { ...context, local },
    selected.value.baseline,
    "customCombo",
    resolved.seriesChartTypes,
  );
}
export function applyComboFamilyTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
  stamp: SessionStamp,
  chartType: ApplicationChartFamily,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  try {
    const baseline = sessionBaseline(storage, context);
    const range = sessionRange(storage, context);
    if (!captureMatches(context, range)) return { status: "stale" };
    if (!isComboChartFamily(chartType))
      return commitFamilyTransition(storage, context, baseline, chartType, undefined, true);
    const saved =
      chartType === "customCombo"
        ? context.local.savedCustomSeriesChartTypes
        : undefined;
    const resolved = resolve(context, range, chartType, saved);
    if (resolved.status !== "resolved")
      return invalid(resolved.diagnostics[0].message);
    const local =
      chartType === "customCombo"
        ? {
            ...context.local,
            savedCustomSeriesChartTypes: cloneDeep(resolved.seriesChartTypes),
          }
        : context.local;
    return commitFamilyTransition(
      storage,
      { ...context, local },
      baseline,
      resolved.chartType,
      resolved.seriesChartTypes,
      true,
    );
  } catch (error) {
    return invalid(
      error instanceof Error
        ? error.message
        : "Invalid combo family transition",
    );
  }
}
