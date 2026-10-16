import type { CellRangeParams, ChartModel, GridState } from "ag-grid-community";
import isEqual from "lodash.isequal";
import { useCallback, useMemo, useRef } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import type { Widget } from "~/lib/state/app";
import { unsupportedTableReason } from "../communityBoundary";
import {
  getCommunityInitialState,
  getStateKey,
  getStateStorage,
  restoreCommunityState,
  saveCommunityState,
} from "../communityState";
import { doAutoFitColumns } from "./constants";
import { useAgGridContext } from "./useTableContext";

export { getStateKey, getStateStorage, getWidgetStorage } from "../communityState";
export function getCellRangeState(
  widget: Widget,
  chartType?: ChartModel["chartType"],
  isPivotMode?: boolean,
) {
  const noChartType = chartType === undefined;
  const { chartView = {} } = widget.storage;
  const storedState = getStateStorage(widget, isPivotMode);
  const chartModel: Partial<ChartModel> =
    storedState?.chartModel ?? widget?.storage?.chartModel ?? {};
  chartType = chartType ?? chartModel?.chartType ?? chartView?.chartType;

  const stateCellRange: CellRangeParams =
    storedState?.[chartType]?.cellRange ?? chartModel?.cellRange ?? (noChartType && {});

  return { stateCellRange, chartType, chartModel };
}

export function getNewCellRange(
  gridState: GridState,
  columnState: GridState | undefined,
  stateCellRange: CellRangeParams | undefined,
) {
  let newCellRange: undefined | any;
  const newColIds = gridState?.columnOrder?.orderedColIds;

  const stateColOrder = columnState?.columnOrder?.orderedColIds || [];
  const newColumnsAdded = newColIds?.filter((colId) => !stateColOrder?.includes(colId));
  const newColumnsRemoved = stateColOrder?.filter(
    (colId) => !newColIds?.includes(colId),
  );

  if (stateCellRange && newColIds) {
    const columns = stateCellRange.columns
      ?.filter((col: string) => !newColumnsRemoved?.includes(col))
      .concat(newColumnsAdded ?? []);

    newCellRange = { ...stateCellRange, columns };
  }

  return newCellRange;
}

export function needsAutoFitOnRestore(
  columnSizingModel: any[],
  widgetId: any,
  autoFitMaxCols?: number,
) {
  return (
    !columnSizingModel?.length ||
    !!(autoFitMaxCols && columnSizingModel.length < autoFitMaxCols) ||
    doAutoFitColumns.includes(widgetId)
  );
}

export function useSizeColumns() {
  return useCallback((params: any, _state?: any, columns?: string[]) => {
    const api = params?.api;
    if (!api || api.isDestroyed()) return;
    if (columns?.length) api.autoSizeColumns(columns);
    else api.autoSizeAllColumns();
  }, []);
}

export function useApplyColumnState() {
  const { getWidget } = useWidgetContext();
  return useCallback(
    (params: any, ..._options: any[]) => {
      const api = params?.api;
      if (!api || api.isDestroyed()) return;
      const widget = getWidget();
      restoreCommunityState(api, widget);
    },
    [getWidget],
  );
}

export function useUpdateColumnState(restGridReady?: any, restGridPreDestroyed?: any) {
  const { getWidget, updateWidget } = useWidgetContext();
  const { updateAgGrid, flushColumnStateRef } = useAgGridContext();
  const restoring = useRef(false);
  const restore = useApplyColumnState();
  const onGridReady = useCallback(
    (event: any) => {
      restoring.current = true;
      restore(event);
      updateAgGrid({ gridReady: true });
      restGridReady?.(event);
      queueMicrotask(() => {
        restoring.current = false;
      });
    },
    [restore, updateAgGrid, restGridReady],
  );
  const onStateUpdated = useCallback(
    (event: any) => {
      if (restoring.current || event.api?.isDestroyed()) return;
      if (event.sources?.includes("gridInitializing")) return;
      if (
        event.sources?.every((source: string) =>
          ["api", "scroll", "focusedCell", "cellSelection"].includes(source),
        )
      )
        return;
      const widget = getWidget();
      if (
        unsupportedTableReason(widget.storage) ||
        unsupportedTableReason(widget.data?.table)
      )
        return;
      const state = event.state ?? event.api.getState();
      if (isEqual(widget.data?.table?.columnState?.[getStateKey(widget)], state))
        return;
      updateWidget((previous) => saveCommunityState(previous, state));
    },
    [getWidget, updateWidget],
  );
  const onNewColumnsLoaded = useCallback(
    (event: any) => {
      restoring.current = true;
      restore(event);
      queueMicrotask(() => {
        restoring.current = false;
      });
    },
    [restore],
  );
  const onGridPreDestroyed = useCallback(
    (event: any) => {
      onStateUpdated(event);
      flushColumnStateRef.current?.();
      restGridPreDestroyed?.(event);
    },
    [onStateUpdated, restGridPreDestroyed, flushColumnStateRef],
  );
  const onVirtualColumnsChanged = useCallback(() => {}, []);
  const initialState = useMemo(
    () => getCommunityInitialState(getWidget()),
    [getWidget],
  );
  return [
    onGridReady,
    onStateUpdated,
    onNewColumnsLoaded,
    onGridPreDestroyed,
    undefined,
    onVirtualColumnsChanged,
    undefined,
    initialState,
  ] as const;
}
