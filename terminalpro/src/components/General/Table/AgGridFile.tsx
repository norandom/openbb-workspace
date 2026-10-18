import ExcelJS from "exceljs";
import { get } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import DraggableCard from "~/components/DraggableCard";
import NewAdvancedSelect from "~/components/NewAdvancedSelect";
import { useWidgetContext } from "~/components/Widget.context";
import { useStateReducer } from "~/hooks/useStateReducer";
import { useJsonData } from "~/lib/api";
import type { Widget } from "~/lib/state/app";
import { useShallowThemeStore } from "~/lib/state/theme";
import { cn } from "~/lib/utils";
import { getColumnDefs, getContextMenuItems, onPivotModeChanged } from "./AgGridUtils";
import { ChartViewButton, ChartViewElement } from "./Chart/AgChartView";
import useChartOptions, {
  useChartToolPanelAction,
} from "./Chart/hooks/useChartOptions";
import { getCSVData, getExcelData, getExcelWorkBook } from "./fileData";
import { AgGridProvider, getSideBarOptions, useAgGridContext } from "./hooks";
import type { AgGridEvents } from "./hooks/types";
import { useColumnVisibility } from "./hooks/useColumnVisibility";
import { useCopilotFilteredWidgetData } from "./hooks/useCopilotFilteredData";
import TableSettings, { type EnableSettings } from "./SubMenus/TableSettings";
import { getTableData } from "./utils";

export default function AgGridFile() {
  const { widget, updateWidget } = useWidgetContext();
  const gridRef = useAgGridContext()?.gridRef;
  const decimalDigits = useShallowThemeStore((state) => state.decimalDigits);

  const chartView = widget.storage?.chartView?.enabled;
  const decimalDigitsToUse = widget?.storage?.decimalDigits ?? decimalDigits;
  const currentSheet = widget?.storage?.currentSheet as Sheet;
  const fileType = getFileType(widget.endpoint.url);

  // API Loading information
  const [state, dispatch] = useStateReducer<AgGridFileState>({
    sheetData: null,
    decimalDigitsSettings: decimalDigitsToUse,
    enableSettings: {
      enableStats: !!widget.storage?.enableStats,
      enableAdvanced: !!widget.storage?.enableAdvanced,
      enablePagination: widget.storage?.enablePagination,
      enableFormulas: !!widget.storage?.enableFormulas,
    },
  });

  const setCurrentSheet = useCallback(
    (sheet: Sheet) => {
      updateWidget((prev) => ({
        ...prev,
        storage: {
          ...prev.storage,
          currentSheet: sheet,
        },
      }));
    },
    [updateWidget],
  );

  const { isLoading, error, data, dataUpdatedAt } = useJsonData<
    { workbook: ExcelJS.Workbook; sheets: Sheet[] } | object[]
  >(
    {
      url: widget.endpoint.url,
      addBearerToken: true,
      responseCb: async (response, resolve, reject) => {
        if (fileType === FileType.xls) {
          return reject(
            new Error("XLS files are not supported. Please convert to XLSX format."),
          );
        }
        if (fileType === FileType.json) {
          const data = await response.json();
          const dataKey = widget?.data?.dataKey;
          const results = get(data, dataKey, data);

          return resolve(Array.isArray(results) ? results : [results]);
        }
        if (fileType === FileType.csv) {
          return getCSVData(await response.text(), resolve);
        }

        if (fileType === FileType.xlsx) {
          return getExcelWorkBook(await response.arrayBuffer(), resolve, reject);
        }

        reject("Unsupported file type");
      },
    },
    {
      enabled: true,
      staleTime: 1000 * 60 * 60 * 24 * 7,
    },
  );

  useEffect(() => {
    if (!isExcelFile(data)) return;
    const { workbook, sheets } = data;

    const tempSheet =
      sheets.find((sheet) => sheet.name === currentSheet?.name) ?? sheets[0];

    getExcelData(workbook, tempSheet, (value) => dispatch({ sheetData: value }));
  }, [data, currentSheet, dispatch]);

  const rowData = useMemo(() => {
    const finalData = isExcelFile(data) ? state.sheetData : data;
    if (!finalData) return [];

    return getTableData(finalData, { external: true } as Widget);
  }, [data, state.sheetData]);

  const columnDefs = useMemo(() => {
    if (rowData) {
      const fakeWidget = {
        external: true,
        storage: { enableAdvanced: state.enableSettings.enableAdvanced },
      };
      return getColumnDefs(rowData, fakeWidget, decimalDigitsToUse).map((column) => {
        // Need to remove quotes from the column header name
        column.headerName = column.headerName?.replace(/"/g, "");
        return column;
      });
    }
    return [];
  }, [rowData, decimalDigitsToUse, state.enableSettings.enableAdvanced]);

  const handleSave = useColumnVisibility(
    state.decimalDigitsSettings,
    state.enableSettings,
  );

  const contextMenuItems = useCallback(
    (params) => getContextMenuItems(params, { widgetId: widget?.id }),
    [],
  );
  const agChartViewProps = useChartOptions();
  const chartToolPanelActions = useChartToolPanelAction();

  useCopilotFilteredWidgetData(rowData, dataUpdatedAt, fileType);

  const gridOptions = useMemo(() => {
    const sideBar = getSideBarOptions(widget.storage);

    return {
      sideBar,
    };
  }, [
    widget.storage.enableStats,
    widget.storage.enableAdvanced,
    widget.storage.enableFormulas,
    widget.storage.openedToolPanel,
    widget.storage.isPivotMode,
  ]);

  const onColumnPivotModeChanged = useCallback(
    (event: AgGridEvents) => onPivotModeChanged(event, updateWidget),
    [updateWidget],
  );

  return (
    <DraggableCard
      aiEnabled={true}
      aiData={true}
      showActionsSettings={true}
      onSaveSettings={handleSave}
      settings={dropdownSettings}
      settingsModalChildren={
        <TableSettings
          decimalDigitsSettings={state.decimalDigitsSettings}
          setDecimalDigitsSettings={(decimalDigitsSettings) =>
            dispatch({ decimalDigitsSettings })
          }
          enableSettings={state.enableSettings}
          setEnableSettings={(enabled) =>
            dispatch({ enableSettings: (prev) => ({ ...prev, ...enabled }) })
          }
        />
      }
      elementRightNextToTitle={
        isExcelFile(data) && (
          <NewAdvancedSelect
            values={data.sheets.map((sheet) => ({
              label: sheet.name,
              value: sheet.id.toString(),
            }))}
            selected={currentSheet?.id.toString()}
            onSelect={(value) => {
              const sheet = data.sheets.find((sheet) => sheet.id.toString() === value);
              if (sheet) {
                setCurrentSheet(sheet);
              }
            }}
            label={currentSheet?.name ?? "Sheet"}
          />
        )
      }
      loading={isLoading}
      exportFns={{
        csvFunction: (title = "report") => {
          gridRef.current?.api.exportDataAsCsv({
            fileName: `${title}.csv`,
          });
        },
      }}
      error={error || rowData?.length === 0}
      extraNavbarElements={!!widget?.storage?.chartView && <ChartViewButton />}
      errorMessage={error?.message}
      extraSettings={[
        {
          icon: "uil-arrows-resize",
          id: "autosize-columns",
          label: "Autosize columns",
          onClick: () => gridRef.current?.api?.autoSizeAllColumns(),
        },
        {
          icon: "radix-icons-reset",
          id: "reset-columns",
          label: "Reset columns",
          onClick: () => {
            gridRef.current?.api?.resetColumnState();
            gridRef.current?.api?.resetColumnGroupState();
            gridRef.current?.api?.autoSizeAllColumns();
          },
        },
        ...(chartView ? chartToolPanelActions : []),
      ]}
    >
      {chartView && <ChartViewElement />}
      <div
        className={cn("grid", {
          "h-[calc(100%-5px)] min-h-[100px]": !chartView,
          "h-0 w-0 max-h-0": chartView,
        })}
      >
        <AgGridProvider
          columnDefs={columnDefs}
          rowData={rowData}
          getContextMenuItems={contextMenuItems}
          paginationPageSizeSelector={[100, 500, 1000, 5000]}
          gridOptions={gridOptions}
          onColumnPivotModeChanged={onColumnPivotModeChanged}
          {...agChartViewProps}
        />
      </div>
    </DraggableCard>
  );
}

const dropdownSettings = {
  showSettings: true,
  showFunctions: false,
  showShare: true,
  showDuplicate: true,
  showExport: true,
  showMaximize: true,
  showMove: true,
};

type Sheet = {
  name: string;
  id: number;
};

enum FileType {
  json = "json",
  xlsx = "xlsx",
  csv = "csv",
  xls = "xls",
}

type AgGridFileState = {
  sheetData: object[] | null;
  decimalDigitsSettings: number;
  enableSettings?: EnableSettings;
};

function getFileType<T extends string>(url: T): FileType {
  const extension = url.split(".").pop() as keyof typeof FileType;

  return FileType[extension];
}

function isExcelFile(
  data: any,
): data is { workbook: ExcelJS.Workbook; sheets: Sheet[] } {
  return data?.workbook instanceof ExcelJS.Workbook;
}
