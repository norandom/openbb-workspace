import type { GridApi } from "ag-grid-community";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import { useShallowThemeStore } from "~/lib/state/theme";
import { formatNumber, formatNumberMagnitude } from "~/lib/utils";
import { getStateKey, getWidgetStorage } from "../../communityState";
import { useAgGridContext } from "../../hooks/useTableContext";
import type { ApplicationChartFamily } from "../application/comboSessionTypes";
import { createChartDisplayPolicy } from "../application/financialFormatting";
import type { IndexColumnDefinition } from "../application/types";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { useAgThemes } from "../themes";
import { getFiscalPeriodString } from "../utils";
import { resolveCallerChart } from "./chartInputs";
import { callerGeneratedOptions } from "./generatedOptions";
import { heatmapThemePaint } from "./heatmapThemePaint";
import { projectHierarchyThemePalette } from "./hierarchyThemePalette";
import { dataOnlyOptions, projectCallerTheme } from "./themeInputs";

export function useCallerSessionInputs() {
  const { widget, widgetFromJSON } = useWidgetContext();
  const { gridState, gridRef } = useAgGridContext();
  const mode = useShallowThemeStore((state) => state.theme);
  const globalDecimalDigits = useShallowThemeStore((state) => state.decimalDigits);
  const themes = useAgThemes(mode);
  const api = (gridState?.gridReady ? gridRef.current?.api : undefined) as
    | GridApi<Record<string, unknown>>
    | undefined;
  const definitions = gridState?.columnDefs ?? [];
  const result = resolveCallerChart(
    widget,
    widgetFromJSON,
    definitions,
    api,
    gridState?.rowData ?? [],
  );
  const chartType = result.valid ? result.value.chartType : undefined;
  const storage = getWidgetStorage(widget);
  const precision = storage?.decimalDigits ?? globalDecimalDigits ?? 3;
  const stateKey = getStateKey(widget);
  const widgetId = widget.id;
  const categoryId = result.valid ? result.value.categoryColumnId : undefined;
  const display = useMemo(
    () =>
      createChartDisplayPolicy({
        chartType: chartType as ApplicationChartFamily,
        period: storage?.period ?? storage?.params?.period,
        decimalDigits: precision,
        globalDecimalDigits,
        category: {
          cellDataType: categoryId
            ? api?.getColumn(categoryId)?.getColDef()?.cellDataType
            : undefined,
          indexColDef: (api?.getColumnDef("Index") ?? undefined) as
            | IndexColumnDefinition
            | undefined,
        },
        helpers: {
          formatNumber,
          formatNumberMagnitude,
          getFiscalPeriodString,
          isValidDate: (value) => dayjs(value).isValid(),
        },
      }),
    [
      chartType,
      storage?.period,
      storage?.params?.period,
      precision,
      globalDecimalDigits,
      api,
      categoryId,
      definitions,
    ],
  );
  if (result.valid === false) return result;
  const theme = projectCallerTheme(
    mode,
    themes.chartThemes,
    themes.customChartThemes,
    chartType,
  );
  return {
    valid: true as const,
    value: {
      ...result.value,
      family: chartType as ApplicationChartFamily,
      api,
      address: {
        widgetId,
        stateKey,
        stateAddress: JSON.stringify([widgetId, stateKey]),
      },
      dataRevision: (gridState?.dataRevision ?? 0) + (gridState?.displayRevision ?? 0),
      ...(chartType === "heatmap"
        ? {
            heatmapThemePaint: heatmapThemePaint(
              themes.customChartThemes[themes.chartThemes[0] ?? `openbb-${mode}`]
                ?.palette,
              theme.colors.base === "ag-default-dark",
              theme.colors.chartBackgroundColor,
            ),
          }
        : {}),
      hierarchyThemePalette: projectHierarchyThemePalette(
        mode,
        themes.chartThemes,
        themes.customChartThemes,
      ),
      theme,
      generated:
        (dataOnlyOptions(gridState?.chartThemeOverrides) as RuntimeOptions) ??
        callerGeneratedOptions(widgetFromJSON?.data?.table?.chartView),
      precision,
      display,
    },
  };
}
