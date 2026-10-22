import {
  rangeCategoryModelOverride,
  resolveRangeCategoryKind,
} from "../compatibility/rangeCategoryProvenance";
import { isPieChartFamily } from "../application/pieSessionTypes";
import { restoreAxisSettings } from "../application/axisPersistence";
import type { ColDef, ColGroupDef, GridApi } from "ag-grid-community";
import { getStateKey, getWidgetStorage } from "../../communityState";
import { selectOptionBaseline } from "../compatibility/optionState";
import type { ValidationResult } from "../compatibility/legacyTypes";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import type { ApplicationAxisRuntime } from "../application/axisStructureTypes";
import type { ResolvedRange } from "../application/types";
import { resolveChartRange } from "../application/chartRange";
import { DEFAULT_SETUP_CATEGORY } from "../application/setupTypes";
import type { ApplicationSessionInputs } from "../application/applicationSessionTypes";
import { callerOrientation } from "./orientation";
import type { ChartDataT } from "../../hooks/types";
import { isHorizontalCartesianFamily } from "../echarts/cartesianTypes";

export function leafChartDefinitions(
  definitions: readonly (ColDef | ColGroupDef)[],
): ColDef[] {
  return definitions.flatMap((definition) =>
    "children" in definition ? leafChartDefinitions(definition.children) : [definition],
  );
}
export function hasCallerSeries(definitions: readonly (ColDef | ColGroupDef)[]) {
  return leafChartDefinitions(definitions).some(
    (definition) => definition.chartDataType === "series",
  );
}
function descriptors(
  definitions: readonly (ColDef | ColGroupDef)[],
  range = false,
): SnapshotColumn[] {
  return leafChartDefinitions(definitions).flatMap((definition) => {
    const id = definition.colId ?? definition.field;
    if (
      !id ||
      !(
        range ? ["category", "series", "time", "number"] : ["category", "series"]
      ).includes(definition.chartDataType ?? "")
    )
      return [];
    return [
      {
        id,
        label: definition.headerName ?? id,
        role: definition.chartDataType === "series" ? "number" : "category",
      },
    ];
  });
}
function storedRange(value: any): ResolvedRange | undefined {
  if (value == null) return;
  if (
    !Array.isArray(value.columns) ||
    value.columns.some((id: unknown) => typeof id !== "string")
  )
    throw new Error("Saved chart range must contain column IDs");
  return {
    columnIds: value.columns,
    originalRange: value,
    ...(value.rowStartIndex === undefined
      ? {}
      : { rowStartIndex: value.rowStartIndex }),
    ...(value.rowEndIndex === undefined ? {} : { rowEndIndex: value.rowEndIndex }),
  };
}
export interface CallerChart {
  readonly chartType: string;
  readonly range: ResolvedRange;
  readonly categoryColumnId: string;
  readonly columns: readonly SnapshotColumn[];
  readonly initialAxes: ApplicationAxisRuntime;
  readonly rangePolicy: NonNullable<ApplicationSessionInputs["rangePolicy"]>;
  readonly pendingReason?: string;
}
/** Raw observations keep their original magnitude; ordinary definitions declare no unit/scale. */
export function resolveCallerChart(
  widget: any,
  widgetFromJSON: any,
  definitions: readonly (ColDef | ColGroupDef)[],
  api?: GridApi,
  rowData: readonly any[] = [],
): ValidationResult<CallerChart> {
  try {
    const stateKey = getStateKey(widget);
    const partition = widget.storage?.[stateKey];
    const view =
      getWidgetStorage(widget)?.chartView ??
      widgetFromJSON?.data?.table?.chartView ??
      {};
    const initialChartType =
      partition?.chartModel?.chartType ||
      widget.storage?.chartModel?.chartType ||
      view.chartType ||
      "groupedColumn";
    const baseline = selectOptionBaseline({
      kind: "initialize",
      stateAddress: "caller",
      initialChartType,
      partitionModel: partition?.chartModel,
      rootModel: widget.storage?.chartModel,
      rootOptions: widget.storage?.chartOptions,
    });
    if (!baseline.valid) return baseline;
    const model = baseline.value.model;
    const chartType = baseline.value.chartType;
    const isRange = chartType === "rangeBar" || chartType === "rangeArea";
    const columns: SnapshotColumn[] = [
      { id: DEFAULT_SETUP_CATEGORY, label: "(None)", role: "category" },
      ...descriptors(definitions, isRange),
    ];
    const generated =
      api
        ?.getAllDisplayedColumns()
        .filter((column) => column.isVisible())
        .map((column) => column.getColId()) ??
      columns
        .filter((column) => column.id !== DEFAULT_SETUP_CATEGORY)
        .map((column) => column.id);
    const rangePolicy = {
      configuredColumnIds: widget.data?.table?.chartView?.cellRangeCols?.[
        chartType
      ]?.filter((id: unknown) => typeof id === "string"),
      definitionColumnIds: columns.map((column) => column.id),
      generatedColumnIds: generated.filter((id) =>
        columns.some((column) => column.id === id),
      ),
    };
    const orientation = callerOrientation(widget, generated, rowData);
    const range = resolveChartRange({
      ...rangePolicy,
      storedRange:
        widget.storage?.ignoreCellRange === true
          ? undefined
          : storedRange(partition?.[chartType]?.cellRange ?? model.cellRange),
      ignoreCellRange: widget.storage?.ignoreCellRange === true,
    });
    if (range.status !== "ready")
      throw new Error(range.diagnostics[0]?.message ?? "Chart range is unavailable");
    const category =
      range.range.columnIds.find((id) =>
        columns.some((column) => column.id === id && column.role === "category"),
      ) ?? DEFAULT_SETUP_CATEGORY;
    const categoryFact = leafChartDefinitions(definitions).find(
      (d) => (d.colId ?? d.field) === category,
    );
    const resolvedCategory = resolveRangeCategoryKind(
      {
        columnChartDataType: isRange ? (categoryFact?.chartDataType ?? null) : null,
        firstCategoryIsDate: false,
      },
      isRange ? rangeCategoryModelOverride(model) : undefined,
    );
    if (!resolvedCategory.valid) throw Error(resolvedCategory.diagnostic.message);
    const categoryType = resolvedCategory.kind;
    const horizontal = isHorizontalCartesianFamily(chartType);
    return {
      valid: true,
      value: {
        chartType,
        rangePolicy,
        ...(orientation.custom || orientation.transposed
          ? { pendingReason: "custom or transposed chart data pending renderer parity" }
          : {}),
        range: range.range,
        categoryColumnId: category,
        columns,
        initialAxes: restoreAxisSettings(isPieChartFamily(chartType) ? {} : model, {
          categoryAxisType: categoryType,
          axes: [
            {
              id: "category",
              direction: horizontal ? "y" : "x",
              type: categoryType,
              position: horizontal ? "left" : "bottom",
              options: {},
            },
            {
              id: "number",
              direction: horizontal ? "x" : "y",
              type: "number",
              position: horizontal ? "bottom" : "left",
              options: {},
            },
          ],
        }),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid saved chart",
    };
  }
}
export function createCallerChartData(props: {
  gridApi: GridApi;
  rowData: any[];
  columnDefs: ColDef[];
  widget: any;
  chartType?: string;
}): ChartDataT {
  const storage = getWidgetStorage(props.widget);
  return {
    rowData: props.rowData,
    columnDefs: props.columnDefs,
    columns: props.gridApi
      .getAllDisplayedColumns()
      .filter((column) => column.isVisible())
      .map((column) => column.getColId()),
    widgetId: props.widget.widgetId,
    transpose: storage?.transpose,
    period: storage?.period ?? storage?.params?.period,
    chartType: props.chartType as ChartDataT["chartType"],
    isReallyTransposed: Boolean(storage?.transpose),
  };
}
/** Type selection updates source fields while retaining inactive options and unknown model data. */
export function changeCallerChartType<T extends { storage?: any; data?: any }>(
  widget: T,
  chartType: string,
): T {
  const stateKey = getStateKey(widget);
  const storage = widget.storage ?? {};
  const partition = storage[stateKey] ?? {};
  const model = { ...(partition.chartModel ?? storage.chartModel), chartType };
  const previousFamily =
    partition.chartModel?.chartType ??
    storage.chartModel?.chartType ??
    storage.chartType ??
    widget.data?.table?.chartView?.chartType ??
    "groupedColumn";
  if (previousFamily !== chartType) delete model.qopenbbAxisSettings;
  return {
    ...widget,
    storage: {
      ...storage,
      chartType,
      [stateKey]: {
        ...partition,
        chartModel: model,
      },
    },
  };
}
