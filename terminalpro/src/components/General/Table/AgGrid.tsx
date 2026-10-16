import type { IHeaderParams } from "ag-grid-community";
import { provideGlobalGridOptions } from "ag-grid-community";
import { useEffect, useState } from "react";
import { TriggerElement } from "./CellContent";

export {
  CellOnClickRenderer,
  CustomCellRenderer,
  colDefFormatter,
  HoverCardCellRenderer,
  TriggerElement,
} from "./CellContent";
export const TOTAL_CELL_LIMIT = 500_000;

export function CustomHeader(props: IHeaderParams) {
  const [sort, setSort] = useState(props.column?.getSort());
  useEffect(() => {
    const update = () => setSort(props.column.getSort());
    props.column.addEventListener("sortChanged", update);
    return () => props.column.removeEventListener("sortChanged", update);
  }, [props.column]);
  return (
    <div className="flex w-full items-center gap-1">
      <button
        type="button"
        className="truncate grow text-left"
        onClick={(event) => props.progressSort(event.shiftKey)}
      >
        {props.displayName}
        {sort === "asc" ? " ↑" : sort === "desc" ? " ↓" : ""}
      </button>
      {props.enableFilterButton && (
        <button
          type="button"
          aria-label={`Filter ${props.displayName}`}
          onClick={(event) => props.showFilter(event.currentTarget)}
        >
          ⌕
        </button>
      )}
    </div>
  );
}

export function getMainMenuItems() {
  return [];
}

export function setGlobalGridOptions() {
  return provideGlobalGridOptions({
    paginationPageSize: 100,
    suppressContextMenu: true,
    rowSelection: { enableClickSelection: true, mode: "singleRow", checkboxes: false },
    rowBuffer: 10,
    suppressAnimationFrame: true,
    rowHeight: 32,
    headerHeight: 32,
    animateRows: false,
    tooltipShowDelay: 1000,
    suppressColumnMoveAnimation: true,
    maintainColumnOrder: true,
    suppressFieldDotNotation: true,
    suppressMoveWhenColumnDragging: true,
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: "agTextColumnFilter",
      suppressAutoSize: true,
      minWidth: 50,
      cellRenderer: TriggerElement,
      filterParams: {
        buttons: ["apply", "clear", "reset", "cancel"],
        closeOnApply: true,
        maxNumConditions: 5,
      },
    },
    components: { agColumnHeader: CustomHeader },
  });
}
