type Options = Record<string, any>;

const unsupportedFlags = new Set([
  "isPivotMode",
  "pivotMode",
  "treeData",
  "masterDetail",
  "rowGroup",
  "pivot",
]);
const unsupportedLists = new Set([
  "groupColIds",
  "pivotColIds",
  "aggregationModel",
  "expandedRowGroupIds",
]);
const enterpriseOptions = new Set([
  "cellSelection",
  "enableRangeSelection",
  "enableCharts",
  "sideBar",
  "statusBar",
  "enableRowGroup",
  "enablePivot",
  "enableValue",
  "aggFunc",
  "allowedAggFuncs",
  "defaultAggFunc",
  "rowGroup",
  "rowGroupIndex",
  "pivot",
  "pivotIndex",
  "pivotMode",
  "treeData",
  "getDataPath",
  "masterDetail",
  "detailCellRenderer",
  "detailCellRendererParams",
  "serverSideDatasource",
  "serverSideInitialRowCount",
  "serverSideStoreType",
  "getContextMenuItems",
  "getMainMenuItems",
  "createChartContainer",
  "chartThemes",
  "customChartThemes",
  "chartThemeOverrides",
  "getChartToolbarItems",
  "onCellDoubleClicked",
  "onChartRangeSelectionChanged",
  "onChartDestroyed",
  "onColumnPivotModeChanged",
  "onColumnRowGroupChanged",
  "onColumnValueChanged",
  "processCellForClipboard",
  "processDataFromClipboard",
  "sendToClipboard",
  "defaultExcelExportParams",
  "excelStyles",
  "excelExportParams",
  "groupDefaultExpanded",
  "autoGroupColumnDef",
  "groupDisplayType",
  "rowGroupPanelShow",
]);

function active(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== false && value !== null && value !== undefined;
}

function ownReason(key: string, value: any): string | undefined {
  if (key === "filterType" && ["set", "multi"].includes(value))
    return "legacy Enterprise filters";
  if (key === "aggFunc" && value) return "legacy aggregation";
  if (key === "filter" && ["agSetColumnFilter", "agMultiColumnFilter"].includes(value))
    return "legacy Enterprise filters";
  if (key === "advancedFilterModel" && value) return "legacy advanced filters";
  if (unsupportedFlags.has(key) && value === true)
    return "grouping, pivots or hierarchical rows";
  if (unsupportedLists.has(key) && active(value)) return "grouping or aggregation";
  if (
    ["rowGroupIndex", "pivotIndex"].includes(key) &&
    typeof value === "number" &&
    value >= 0
  )
    return "grouping or pivots";
  if (key === "rowModelType" && value && value !== "clientSide")
    return "remote row models";
  if (key === "chartModel" && value && Object.keys(value).length)
    return "integrated charts";
  if (key === "chartView" && value?.enabled) return "integrated charts";
  if (key === "formulas" && Array.isArray(value) && value.length)
    return "legacy table formulas";
  return undefined;
}

export const COMMUNITY_PAGE_SIZES = [100, 200, 500, 1000];

export function communityPaginationOptions(
  rowCount: number,
  storage: Options = {},
  tablePagination = false,
  options: Options = {},
) {
  const paginationPageSize =
    storage.paginationPageSize ?? options.paginationPageSize ?? 100;
  return {
    pagination:
      rowCount > 100 &&
      Boolean(storage.enablePagination ?? options.pagination ?? tablePagination),
    paginationPageSize,
  };
}

export function unsupportedTableReason(
  value: unknown,
  seen = new WeakSet<object>(),
): string | undefined {
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const reason = ownReason(key, child) ?? unsupportedTableReason(child, seen);
    if (reason) return reason;
  }
  return undefined;
}

export function communityGridOptions<T extends Options>(options: T): T {
  const result: Options = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    if (enterpriseOptions.has(key)) continue;
    if (key === "suppressContextMenu") {
      result[key] = true;
      continue;
    }
    if (key === "filter" && value === true) {
      result[key] =
        options.cellDataType === "number"
          ? "agNumberColumnFilter"
          : options.cellDataType === "date"
            ? "agDateColumnFilter"
            : "agTextColumnFilter";
      continue;
    }
    if (key === "gridOptions" || key === "defaultColDef")
      result[key] = communityGridOptions(value ?? {});
    else if (key === "columnDefs" || key === "children")
      result[key] = value?.map((column: Options) => communityGridOptions(column));
    else if (key === "cellRenderer" && value === "agSparklineCellRenderer")
      result.hide = true;
    else result[key] = value;
  }
  return result as T;
}
