import type { WidgetT } from "../../../../types";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import { hierarchyInputs, isHierarchyChartFamily } from "./applicationSessionGuards";
import type {
  ApplicationSessionContext,
  ApplicationSessionInputs,
} from "./applicationSessionTypes";
import { resolveChartRange } from "./chartRange";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import { resolveHeatmapRange } from "./heatmapRange";
import { hierarchySessionRange } from "./hierarchySessionSelection";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import type { ResolvedRange } from "./types";

/** Grid availability belongs to the current frame; configuration belongs to the latest Widget. */
export function latestWidgetRangeInputs<F extends ApplicationChartFamily>(
  inputs: ApplicationSessionInputs<F>,
  widget: WidgetT,
): ApplicationSessionInputs<F> {
  if (!inputs.rangePolicy) return inputs;
  return {
    ...inputs,
    rangePolicy: {
      ...inputs.rangePolicy,
      configuredColumnIds: widget.data?.table?.chartView?.cellRangeCols?.[
        inputs.family
      ]?.filter((id): id is string => typeof id === "string"),
    },
  };
}
export function sessionRangeFrameKey<F extends ApplicationChartFamily>(
  inputs: ApplicationSessionInputs<F>,
  storage: ChartStorageOutput,
) {
  return inputs.rangePolicy
    ? JSON.stringify([inputs.rangePolicy, storage.ignoreCellRange === true])
    : undefined;
}
function readRange(value: unknown, ignored = false): ResolvedRange | undefined {
  if (value === undefined || value === null) return;
  const saved = value as RuntimeOptions;
  if (
    !Array.isArray(saved.columns) ||
    saved.columns.some((id) => typeof id !== "string")
  ) {
    if (ignored) return;
    throw new Error("Invalid original range columns");
  }
  return {
    columnIds: saved.columns as string[],
    originalRange: JSON.parse(JSON.stringify(saved)),
    ...(saved.rowStartIndex === undefined
      ? {}
      : { rowStartIndex: saved.rowStartIndex as number }),
    ...(saved.rowEndIndex === undefined
      ? {}
      : { rowEndIndex: saved.rowEndIndex as number }),
  };
}
export function resolveSessionRange<F extends ApplicationChartFamily>(
  storage: ChartStorageOutput,
  context: Pick<ApplicationSessionContext<F>, "inputs" | "local">,
): ResolvedRange {
  const { inputs } = context;
  if (isHierarchyChartFamily(inputs.family))
    return hierarchySessionRange(storage, {
      inputs: hierarchyInputs(inputs),
      local: context.local,
    });
  const partition = storage[inputs.address.stateKey] as RuntimeOptions | undefined;
  const family = partition?.[inputs.family] as RuntimeOptions | undefined;
  if (!inputs.rangePolicy) return readRange(family?.cellRange) ?? inputs.range;
  const model = (partition?.chartModel ??
    storage.chartModel ??
    context.local.baseline.model) as RuntimeOptions;
  const local = context.local;
  const stored =
    storage.ignoreCellRange === true && local.rangeFrameKey === undefined
      ? undefined
      : readRange(
          family?.cellRange ?? model.cellRange,
          storage.ignoreCellRange === true,
        );
  if (
    stored &&
    local.rangeFrameKey === sessionRangeFrameKey(inputs, storage) &&
    JSON.stringify(stored?.columnIds) === JSON.stringify(local.range.columnIds) &&
    stored?.rowStartIndex === local.range.rowStartIndex &&
    stored?.rowEndIndex === local.range.rowEndIndex
  ) {
    return {
      ...local.range,
      columnIds: stored.columnIds.filter(
        (id) =>
          id === DEFAULT_SETUP_CATEGORY ||
          inputs.rangePolicy!.generatedColumnIds.includes(id),
      ),
    };
  }
  const rangeInput = {
    ...inputs.rangePolicy,
    ignoreCellRange: storage.ignoreCellRange === true,
    storedRange: storage.ignoreCellRange === true ? undefined : stored,
  };
  const result =
    inputs.family === "heatmap"
      ? resolveHeatmapRange(rangeInput, inputs.columns)
      : resolveChartRange(rangeInput);
  if (result.status !== "ready")
    throw new Error(result.diagnostics[0]?.message ?? "Chart range is unavailable");
  return result.range;
}
