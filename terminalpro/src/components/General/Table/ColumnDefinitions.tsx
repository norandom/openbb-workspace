import type { ColDef } from "ag-grid-community";
import dayjs from "dayjs";
import type { WidgetColumnDefT } from "~/components/types";
import type { Widget } from "~/lib/state/app";
import { formatNumber } from "~/lib/utils/utils";
import {
  CellOnClickRenderer,
  CustomCellRenderer,
  HoverCardCellRenderer,
} from "./AgGrid";
import ShowChangeCell from "./CellRenderers/ShowChangeCell";
import {
  convertToReadableLabel,
  determineFilterType,
  extractYearOrReturnInput,
  formatObjectValue,
  getDateFilterParams,
  inferChartDataType,
  inferDataType,
  isDateorYearField,
} from "./ColumnValues";

const CellRendererTypes = {
  hoverCard: HoverCardCellRenderer,
  cellOnClick: CellOnClickRenderer,
  showCellChange: ShowChangeCell,
};

const ChartTypeToCellType = { category: "text" } as const;

const RendererPriority = ["hoverCard", "cellOnClick", "showCellChange"] as const;

function CellRendererComponent(renderFn: WidgetColumnDefT["renderFn"]) {
  if (!renderFn?.length) return undefined;

  const type = RendererPriority.find((type) => renderFn?.includes(type));

  return CellRendererTypes?.[type] ?? CustomCellRenderer;
}

function buildColumn(
  key: string,
  fullData: any[],
  typeCheckData: any[],
  columnDefs: any,
  widget: any,
  decimalPlaces: number,
  considerHide: boolean,
) {
  const globalFormatterFn = widget?.data?.table?.formatterFn;
  const transpose = widget?.data?.table?.transpose;
  const type = typeCheckData
    .filter((item) => item?.[key] !== null && item?.[key] !== undefined)
    .map((item) => typeof item?.[key])
    .reduce(
      (a, b, _i, arr) =>
        arr.filter((v) => v === a).length >= arr.filter((v) => v === b).length ? a : b,
      null,
    );

  const colDef = columnDefs?.[key];

  if (!colDef && globalFormatterFn) {
    columnDefs[key] = { formatterFn: globalFormatterFn };
  }

  const nonNullValue = fullData?.find((item) => typeof item?.[key] === type)?.[key];
  const cellDataType =
    colDef?.cellDataType?.toString() || ChartTypeToCellType?.[colDef?.chartDataType];

  const dataType =
    cellDataType || inferDataType(nonNullValue, colDef?.headerName ?? key);

  const isIndex = key.toLocaleLowerCase() === "index";

  const isDateCol =
    dataType === "date" ||
    (colDef?.chartDataType !== "series" && isDateorYearField(key));

  const chartDataType =
    colDef?.chartDataType || inferChartDataType(nonNullValue, { isDateCol, isIndex });

  const isNumericType = (transpose && !isIndex) || typeof nonNullValue === "number";

  if (columnDefs?.[key]) {
    columnDefs[key].chartDataType = chartDataType;
    columnDefs[key].cellDataType = dataType;
  }

  const cellClass = getCellClass(colDef?.align);

  const columnConfig = {
    colId: key,
    field: key,
    headerName: transpose
      ? extractYearOrReturnInput(colDef?.headerName ?? key)
      : (colDef?.headerName ?? convertToReadableLabel(key)),
    pinned: isIndex ? "left" : (colDef?.pinned ?? null),
    suppressAutoSize: false,
    chartDataType,
    cellDataType: dataType.replace("link", "text"),
    ...((colDef?.minWidth || colDef?.width) && {
      width: colDef?.width ?? colDef?.minWidth,
    }),
    minWidth: isIndex ? 120 : 50,
    maxWidth: isIndex ? 500 : (colDef?.maxWidth ?? null),
    type: isNumericType ? "numericColumn" : "",
    filter: determineFilterType(dataType, colDef?.headerName ?? key, nonNullValue),
    filterParams: {
      ...(dataType === "date" ? getDateFilterParams() : {}),
    },
    hide: colDef?.sparkline
      ? true
      : considerHide
        ? transpose
          ? false
          : (colDef?.hide ?? false)
        : false,
    headerTooltip: colDef?.headerTooltip,
    ...(cellClass && { cellClass }),
    // Add filterValueGetter for columns with hoverCard renderFn to ensure filtering works correctly
    // This extracts the numeric value for filtering without affecting cell rendering
    ...(colDef?.renderFn?.includes("hoverCard") && {
      filterValueGetter: (params) => {
        const cellData = params.getValue(params.column.getColId());

        // Handle aggregated values that come as objects
        const value = cellData?.value ?? cellData;

        if (colDef?.renderFn?.includes("hoverCard") && typeof cellData === "object") {
          const { cellField = "value" } = colDef?.renderFnParams?.hoverCard ?? {};

          return cellData?.[cellField] ?? null;
        }

        return value;
      },
    }),
    valueFormatter: (params) => {
      // Handle aggregated values that come as objects
      const value = params.value?.value ?? params.value;

      if (colDef?.renderFn?.includes("hoverCard") && typeof params.value === "object") {
        const { cellField = "value" } = colDef?.renderFnParams?.hoverCard ?? {};

        return params?.value?.[cellField] ?? "";
      }

      if (params.colDef?.field === "Index" && transpose)
        return (
          columnDefs?.[params.value]?.headerName ??
          convertToReadableLabel(params.value || "")
        );

      if (typeof value === "number" && !isDateCol) {
        return formatNumber(value, colDef?.decimalPlaces ?? decimalPlaces);
      }
      return formatObjectValue(value) ?? "-";
    },
    cellRenderer: CellRendererComponent(colDef?.renderFn),
    cellRendererParams: {
      transpose,
      widgetColDefs: columnDefs,
      decimalPlacesToUse: decimalPlaces,
      ...colDef?.renderFnParams,
    },
  } as ColDef;

  return columnConfig;
}

const getCellClass = (align: "left" | "center" | "right") => {
  if (align === "center") return "text-center";
  if (align === "right") return "ag-right-aligned-cell";
  if (align === "left") return "ag-left-aligned-cell";
};

export function getColumnDefs(
  data: object[] | object,
  widget: Pick<
    Partial<Widget & { widgetId?: Widget["widgetId"] }>,
    "data" | "widgetId" | "external" | "storage"
  >,
  decimalPlaces = 3,
  considerHide = true,
): ColDef[] {
  if (!data) return [];
  const newColumnDefs: ColDef[] = [];

  const globalFormatterFn = widget?.data?.table?.formatterFn;

  const columnDefs = Object.fromEntries(
    widget?.data?.table?.columnsDefs?.map((column) => {
      return [
        column.field,
        {
          field: column.field,
          headerName: column.headerName,
          cellDataType: column.cellDataType,
          chartDataType: column.chartDataType,
          renderFn: column.renderFn,
          renderFnParams: column.renderFnParams ?? {},
          formatterFn: column.formatterFn || globalFormatterFn,
          decimalPlaces: column.decimalPlaces,
          prefix: column.prefix,
          suffix: column.suffix,
          rowGroup: column.rowGroup,
          hide: column.hide,
          headerTooltip: column.headerTooltip,
          width: column.width,
          maxWidth: column.maxWidth,
          minWidth: column.minWidth,
          aggFunc: column.aggFunc,
          pinned: column.pinned,
          sparkline: column.sparkline,
          align: column.align,
        } as Partial<ColDef> & {
          renderFn?: WidgetColumnDefT["renderFn"];
          formatterFn?: WidgetColumnDefT["formatterFn"];
          decimalPlaces?: WidgetColumnDefT["decimalPlaces"];
          renderFnParams?: WidgetColumnDefT["renderFnParams"];
          prefix?: WidgetColumnDefT["prefix"];
          suffix?: WidgetColumnDefT["suffix"];
          sparkline?: WidgetColumnDefT["sparkline"];
          align?: WidgetColumnDefT["align"];
        },
      ];
    }) ?? [],
  );

  const fullData = Array.isArray(data) ? data : [data];

  data = fullData[0];

  const transpose = widget?.data?.table?.transpose;

  const typeCheckData = [
    fullData?.[Math.floor(fullData.length / 2)],
    fullData?.[Math.floor(fullData.length / 3)],
    fullData?.[Math.floor(fullData.length / 4)],
    fullData?.[fullData.length - 1],
    ...(fullData?.slice(0, 100) || []),
  ];

  for (const key in data)
    newColumnDefs.push(
      buildColumn(
        key,
        fullData,
        typeCheckData,
        columnDefs,
        widget,
        decimalPlaces,
        considerHide,
      ),
    );

  const colOrderMap = new Map(
    (widget?.data?.table?.columnsDefs || []).map((col, index) => [col.field, index]),
  );

  newColumnDefs.sort((a, b) => {
    const aIndex = colOrderMap.get(a.field);
    const bIndex = colOrderMap.get(b.field);

    if (aIndex !== undefined && bIndex !== undefined) {
      return aIndex - bIndex;
    }

    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return 0;
  });

  return newColumnDefs;
}

export function getQuarterColumnDefs(
  rowData: any[],
  columnDefs: ColDef[],
  reversed = false,
): ColDef[] {
  const indexCol = columnDefs.find((col) => col.headerName === "Index");

  if (!indexCol) return columnDefs;

  const newColumnDefs = [indexCol];

  const years = Array.from(
    new Set(
      Object.keys(rowData[0])
        .filter((key) => key !== "Index")
        .map((date) => dayjs(date).format("YYYY")),
    ),
  ).sort((a, b) => (reversed ? Number(a) - Number(b) : Number(b) - Number(a)));

  for (const date of years) {
    const groupCol = {
      headerName: date,
      field: date,
      children: columnDefs
        .filter(
          (col) =>
            col.headerName !== "Index" && [col.field, col.headerName].includes(date),
        )
        .map((col) => {
          return {
            ...col,
            headerName: `Q${dayjs(col.field).quarter()}`,
          };
        }),
    } as ColDef;
    newColumnDefs.push(groupCol);
  }

  return newColumnDefs;
}
