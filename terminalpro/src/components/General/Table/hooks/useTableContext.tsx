import type { ChartRef, ColDef, CreateRangeChartParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  createContext,
  type FC,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgGridSetLoadingOnResize } from "~/components/DraggableCard/SetLoadingOnResize";
import { useWidgetContext } from "~/components/Widget.context";
import UnsupportedRenderer from "~/components/Widgets/UnsupportedRenderer";
import { useComposeRefs } from "~/hooks/useRefHooks";
import { useStateReducer } from "~/hooks/useStateReducer";
import { useShallowThemeStore } from "~/lib/state/theme";
import { cn } from "~/lib/utils";
import { useAgThemes } from "../Chart/themes";
import { createCallerChartData } from "../Chart/caller/chartInputs";
import type { ApplicationChartHandle } from "../Chart/caller/types";
import {
  COMMUNITY_PAGE_SIZES,
  communityGridOptions,
  communityPaginationOptions,
  unsupportedTableReason,
} from "../communityBoundary";
import { ActiveFiltersBanner } from "../components/ActiveFiltersBanner";
import { NoRowsOverlay } from "../components/NoRowsOverlay";
import type {
  AgGridContextValue,
  AgGridElement,
  AgGridProps,
  GridStateT,
  TableProps,
} from "./types";
import { useApplyColumnState, useUpdateColumnState } from "./useUpdateColumnState";

export { useAgExportFuncs, useQuickActionsSettings } from "./communityActions";

export const AgGridContext = createContext<AgGridContextValue | null>(null);
export const useAgGridContext = () => {
  const context = useContext(AgGridContext);
  if (!context)
    throw new Error("useAgGridContext must be used within a AgGridProvider");
  return context;
};
const EMPTY_ROWS: any[] = [];
const EMPTY_OPTIONS = {};
export function useGridSync(
  rowData: any[] = EMPTY_ROWS,
  columnDefs: ColDef[] = EMPTY_ROWS,
) {
  const { updateAgGrid } = useAgGridContext();
  useEffect(() => {
    updateAgGrid({
      rowData,
      columnDefs,
      needsUpdate: true,
      dataRevision: (previous) => (previous ?? -1) + 1,
    });
  }, [rowData, columnDefs, updateAgGrid]);
  return columnDefs;
}
const Table: FC<TableProps> = memo((props: TableProps) => {
  const childrenMemo = useMemo(() => props.children, [props.children]);

  const gridRef = useRef<AgGridElement | null>(null);
  const columnDefsRef = useRef<ColDef<any, any>[]>([]);
  const chartRef = useRef<ChartRef>(null);
  const applicationChartRef = useRef<ApplicationChartHandle | null>(null);
  const chartViewElementRef = useRef<HTMLDivElement>(null);
  const createRangeChartParamsCbRef = useRef<
    (params: CreateRangeChartParams) => CreateRangeChartParams
  >((params) => params);

  const handleChartViewToggleRef = useRef<(chartView: boolean) => boolean>(
    (chartView) => chartView,
  );
  const flushColumnStateRef = useRef<() => void>(() => {});
  // Shared across every useApplyColumnState instance — tracks that the chart
  // view is (or was just) enabled so table restores keep saved column widths
  const previousChartEnabledRef = useRef<boolean | undefined>(false);
  const isReallyTransposedRef = useRef(false);

  const createChartData = createCallerChartData;

  const [gridState, dispatch] = useStateReducer<GridStateT>({
    columnDefs: [],
    rowData: [],
    gridReady: false,
    needsUpdate: false,
    resized: {},
    dataRevision: null,
  });

  const updateAgGrid = useCallback(
    (options: GridStateT | ((prev: GridStateT) => GridStateT)) => {
      if (typeof options === "function") {
        dispatch((prev) => options(prev));
        return;
      }

      dispatch({
        ...options,
        needsUpdate: (prev) => options.needsUpdate ?? prev,
      });
    },
    [],
  );

  const [columnVisibility, setColumnVisibility] = useState(
    {} as Record<string, boolean>,
  );
  const getGridState = useCallback(() => gridState, [gridState]);

  return (
    <AgGridContext.Provider
      value={{
        gridRef,
        chartRef,
        applicationChartRef,
        chartViewElementRef,
        columnDefsRef,
        columnVisibility,
        setColumnVisibility,
        createChartData,
        gridState,
        getGridState,
        updateAgGrid,
        createRangeChartParamsCbRef,
        handleChartViewToggleRef,
        flushColumnStateRef,
        previousChartEnabledRef,
        isReallyTransposedRef,
      }}
    >
      {childrenMemo}
    </AgGridContext.Provider>
  );
});

Table.displayName = "AgGridProvider";

export function getSideBarOptions(_storage: unknown): undefined {
  return undefined;
}

export function useSyncTableData(gridOptions: any = EMPTY_OPTIONS) {
  const { gridRef, gridState, columnDefsRef } = useAgGridContext();
  const restore = useApplyColumnState();
  const storage = useWidgetContext()?.widget?.storage;
  const tablePagination = useShallowThemeStore((state) => state.tablePagination);
  const pagination = communityPaginationOptions(
    gridState.rowData?.length ?? 0,
    storage,
    tablePagination,
    gridOptions,
  );
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || api.isDestroyed() || !gridState.gridReady) return;
    const columnDefs = communityGridOptions({
      columnDefs: gridState.columnDefs,
    }).columnDefs;
    columnDefsRef.current = columnDefs;
    api.updateGridOptions(
      communityGridOptions({
        ...gridOptions,
        ...pagination,
        columnDefs,
        rowData: gridState.rowData,
      }),
    );
    restore({ api });
  }, [
    gridState.dataRevision,
    gridState.gridReady,
    gridOptions,
    restore,
    pagination.pagination,
    pagination.paginationPageSize,
  ]);
}

const CommunityGrid = forwardRef<AgGridElement, AgGridProps>((props, ref) => {
  const { extraClassName, className = extraClassName, hideHeader, ...rest } = props;
  const { gridRef, updateAgGrid } = useAgGridContext();
  const composeRefs = useComposeRefs(gridRef, ref);
  const theme = useShallowThemeStore((s) => s.theme);
  const tablePagination = useShallowThemeStore((s) => s.tablePagination);
  const storage = useWidgetContext()?.widget?.storage;
  const { agTheme } = useAgThemes(theme);
  useGridSync(rest.rowData, rest.columnDefs as ColDef[]);
  const [
    onGridReady,
    onStateUpdated,
    onNewColumnsLoaded,
    onGridPreDestroyed,
    ,
    onVirtualColumnsChanged,
    ,
    initialState,
  ] = useUpdateColumnState(props.onGridReady, props.onGridPreDestroyed);
  useSyncTableData(rest.gridOptions);
  // Grid definition changes reload columns and restore saved state. Keep their
  // identities stable while filter/sort notifications update the display.
  const definitions = useMemo(
    () => communityGridOptions({
      columnDefs: rest.columnDefs,
      defaultColDef: rest.defaultColDef,
      gridOptions: rest.gridOptions,
    }),
    [rest.columnDefs, rest.defaultColDef, rest.gridOptions],
  );
  const options = communityGridOptions(rest);
  // Absent local defaults must not replace globally configured filter actions.
  if ("columnDefs" in options) options.columnDefs = definitions.columnDefs;
  if ("defaultColDef" in options) options.defaultColDef = definitions.defaultColDef;
  if ("gridOptions" in options) options.gridOptions = definitions.gridOptions;
  const pagination = communityPaginationOptions(
    rest.rowData?.length ?? 0,
    storage,
    tablePagination,
    { ...rest.gridOptions, ...rest },
  );
  return (
    <AgGridSetLoadingOnResize>
      <div className="ag-grid-stack flex flex-col h-full w-full">
        <ActiveFiltersBanner />
        <div className="flex-1 min-h-0">
          <AgGridReact
            {...options}
            {...pagination}
            paginationPageSizeSelector={COMMUNITY_PAGE_SIZES}
            suppressContextMenu={true}
            className={cn(
              "relative ag-grid h-full w-full",
              { "hide-grid-header": hideHeader },
              className,
            )}
            theme={agTheme}
            ref={composeRefs}
            noRowsOverlayComponent={NoRowsOverlay}
            onGridReady={onGridReady}
            onStateUpdated={onStateUpdated}
            onNewColumnsLoaded={onNewColumnsLoaded}
            onGridPreDestroyed={onGridPreDestroyed}
            onVirtualColumnsChanged={onVirtualColumnsChanged}
            onFilterChanged={(event) => {
              updateAgGrid({ displayRevision: (previous) => (previous ?? 0) + 1 });
              props.onFilterChanged?.(event);
            }}
            onSortChanged={(event) => {
              updateAgGrid({ displayRevision: (previous) => (previous ?? 0) + 1 });
              props.onSortChanged?.(event);
            }}
            initialState={initialState}
          />
        </div>
      </div>
    </AgGridSetLoadingOnResize>
  );
});

const AgGridProvider = forwardRef<AgGridElement, AgGridProps>((props, ref) => {
  const { widget } = useWidgetContext();
  const reason =
    unsupportedTableReason(widget?.storage) ??
    unsupportedTableReason(widget?.data?.table) ??
    unsupportedTableReason({ ...props, rowData: undefined });
  return reason ? (
    <UnsupportedRenderer reason={reason} />
  ) : (
    <CommunityGrid {...props} ref={ref} />
  );
});

export { AgGridProvider, Table };
