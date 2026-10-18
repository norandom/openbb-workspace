import { useMemo } from "react";
import type { ExtraActionT } from "~/components/DraggableCard/NavBar";
import { useWidgetContext } from "~/components/Widget.context";
import { useAgGridContext } from "./useTableContext";
export function useAgExportFuncs() {
  const { gridRef, applicationChartRef } = useAgGridContext();
  const { widget } = useWidgetContext();
  const enabled = Boolean(widget?.storage?.chartView?.enabled);

  return useMemo(
    () => ({
      csvFunction: (title = "report") => {
        gridRef.current?.api.exportDataAsCsv({ fileName: `${title}.csv` });
      },
      ...(enabled
        ? {
            pngFunction: (title = "report") => {
              const chart = applicationChartRef.current;
              if (!chart || chart.validateCurrent(chart.stamp).status !== "ready")
                throw new Error("Chart image is unavailable");
              const image = chart.host.exportImage(undefined, chart.revision);
              const link = document.createElement("a");
              link.download = `${title}.png`;
              link.href = image;
              link.click();
              link.remove();
            },
          }
        : {}),
    }),
    [gridRef, applicationChartRef, enabled],
  );
}

export function useQuickActionsSettings(transpose?: boolean | undefined) {
  const { gridRef } = useAgGridContext();
  const { widgetFromJSON, updateWidget } = useWidgetContext();

  const memoizedQuickActions = useMemo<ExtraActionT>(() => {
    return {
      icon: "humbleicons-columns-three-thirds",
      id: "quick-actions",
      label: "Quick actions",
      children: [
        {
          icon: "uil-arrows-resize",
          id: "autosize-columns",
          label: "Autosize columns",
          onClick: () => {
            gridRef.current?.api.autoSizeAllColumns();
          },
        },
        {
          icon: "radix-icons-reset",
          id: "reset-columns",
          label: "Reset columns",
          onClick: () => {
            gridRef.current?.api?.resetColumnState();
            gridRef.current?.api?.autoSizeAllColumns();
          },
        },
        {
          icon: "noto-letter-t",
          id: "transpose-data",
          label: "Transpose data",
          hide:
            transpose === undefined ||
            ["financial_ratios", "stock_ownership"].includes(widgetFromJSON?.widgetId),
          onClick: () => {
            updateWidget((prev) => ({
              ...prev,
              storage: {
                ...prev.storage,
                transpose: !prev?.storage?.transpose,
              },
            }));
          },
        },
      ],
    };
  }, [gridRef, widgetFromJSON?.widgetId, updateWidget]);

  return memoizedQuickActions;
}
