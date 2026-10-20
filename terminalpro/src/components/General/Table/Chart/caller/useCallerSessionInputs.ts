import type { ApplicationChartFamily } from "../application/comboSessionTypes";
import dayjs from "dayjs";
import type { GridApi } from "ag-grid-community";
import { useMemo } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import { useShallowThemeStore } from "~/lib/state/theme";
import { formatNumber, formatNumberMagnitude } from "~/lib/utils";
import { getWidgetStorage, getStateKey } from "../../communityState";
import { useAgGridContext } from "../../hooks/useTableContext";
import { createChartDisplayPolicy } from "../application/financialFormatting";
import type { IndexColumnDefinition } from "../application/types";
import type { CartesianFamily } from "../echarts/cartesianTypes";
import { useAgThemes } from "../themes";
import { getFiscalPeriodString } from "../utils";
import { resolveCallerChart } from "./chartInputs";
import { projectCallerTheme } from "./themeInputs";
import { callerGeneratedOptions } from "./generatedOptions";
import { dataOnlyOptions } from "./themeInputs";
import type { RuntimeOptions } from "../compatibility/legacyTypes";

export function useCallerSessionInputs() {
  const { widget, widgetFromJSON } = useWidgetContext();
  const { gridState, gridRef } = useAgGridContext();
  const mode = useShallowThemeStore((state) => state.theme);
  const globalDecimalDigits = useShallowThemeStore(
    (state) => state.decimalDigits,
  );
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
        chartType: chartType as CartesianFamily,
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
  if (!result.valid) return result;
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
      dataRevision:
        (gridState?.dataRevision ?? 0) + (gridState?.displayRevision ?? 0),
      theme: projectCallerTheme(
        mode,
        themes.chartThemes,
        themes.customChartThemes,
      ),
      generated:
        (dataOnlyOptions(gridState?.chartThemeOverrides) as RuntimeOptions) ??
        callerGeneratedOptions(widgetFromJSON?.data?.table?.chartView),
      precision,
      display,
    },
  };
}
