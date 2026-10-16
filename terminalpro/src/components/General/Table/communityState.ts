import { communityGridOptions, unsupportedTableReason } from "./communityBoundary.ts";

export function getWidgetStorage(widget: any) {
  const group =
    widget?.storage?.selectedGroup ?? widget?.storage?.params?.selectedGroup;
  return (group && widget?.storage?.[group]) || widget?.storage;
}

export function getStateKey(widget: any, isPivotMode?: boolean) {
  const storage = getWidgetStorage(widget);
  return [
    storage?.period || "default",
    storage?.transpose ? "transpose" : "",
    widget?.storage?.selectedGroup,
    storage?.reversed ? "reversed" : "",
    storage?.currentSheet?.name,
    storage?.selectedRatio,
    (isPivotMode ?? storage?.isPivotMode) ? "pivot" : "",
  ]
    .filter(Boolean)
    .join("_");
}

export function getStateStorage(widget: any, isPivotMode?: boolean) {
  return widget?.storage?.[getStateKey(widget, isPivotMode)];
}

export function getCommunityInitialState(widget: any) {
  const saved = widget?.data?.table?.columnState?.[getStateKey(widget)];
  if (!saved || Array.isArray(saved) || unsupportedTableReason(saved)) return undefined;
  if (saved.orderedColIds || saved.columnSizingModel || saved.hiddenColIds)
    return undefined;
  const {
    cellSelection,
    focusedCell,
    sideBar,
    rowGroup,
    pivot,
    aggregation,
    rowGroupExpansion,
    ...flat
  } = saved;
  return flat;
}

function flattenedColumns(saved: any) {
  const ids =
    saved.orderedColIds ?? saved.columnSizingModel?.map((s: any) => s.colId) ?? [];
  return ids.map((colId: string) => ({
    colId,
    ...saved.columnSizingModel?.find((size: any) => size.colId === colId),
    hide: saved.hiddenColIds?.includes(colId) ?? false,
    pinned: saved.leftColIds?.includes(colId)
      ? "left"
      : saved.rightColIds?.includes(colId)
        ? "right"
        : null,
  }));
}

export function restoreCommunityState(api: any, widget: any): boolean {
  if (
    unsupportedTableReason(widget?.storage) ||
    unsupportedTableReason(widget?.data?.table)
  )
    return false;
  const key = getStateKey(widget);
  const saved = widget?.data?.table?.columnState?.[key];
  if (Array.isArray(saved))
    api.applyColumnState({
      state: saved.map((col) => communityGridOptions(col)),
      applyOrder: true,
    });
  else if (saved?.orderedColIds || saved?.columnSizingModel || saved?.hiddenColIds)
    api.applyColumnState({ state: flattenedColumns(saved), applyOrder: true });
  else if (saved) api.setState(getCommunityInitialState(widget));
  const filter = widget?.data?.table?.filterModel?.[key];
  if (filter !== undefined) api.setFilterModel(filter);
  return true;
}

export function saveCommunityState(widget: any, state: any) {
  const key = getStateKey(widget);
  return {
    ...widget,
    data: {
      ...widget.data,
      table: {
        ...widget.data?.table,
        columnState: { ...widget.data?.table?.columnState, [key]: state },
        filterModel: {
          ...widget.data?.table?.filterModel,
          [key]: state?.filter?.filterModel,
        },
      },
    },
    storage: {
      ...widget.storage,
      paginationPageSize:
        state?.pagination?.pageSize ?? widget.storage?.paginationPageSize,
    },
  };
}
