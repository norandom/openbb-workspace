import type { TabData } from "~/lib/state/app";
import type { BackendTemplate } from "~/lib/state/backendConnector";
import type { TabLayout } from "~/lib/templates";
import type { useGetWidgetsStore } from "~/components/AI/hooks/useGetAppWidgets";
import type { useBackendConnectorStore } from "~/lib/state/backendConnector";
import type { AppMetadataForm } from "~/components/General/AppDialog/schema";
import { trimPrompts } from "~/components/General/AppDialog/schema";
import { createParamDefs } from "./widgetParams";
import { getParamsOrder } from "~/components/DataConnectors/common/helpers";
import { getSeriesType } from "~/components/General/Table/Chart/utils";
import { getStateStorage } from "~/components/General/Table/hooks/useUpdateColumnState";
import { isTruthy } from "~/components/General/Table/utils";
import { researchTemplateState } from "./researchTemplateState";

type ExportTemplatePorts = {
  getAppWidget: ReturnType<typeof useGetWidgetsStore.getState>["getAppWidget"];
  getSourceById: ReturnType<
    typeof useBackendConnectorStore.getState
  >["getApiSourceById"];
};

function serializeWidgetState(
  widget: TabData["widgets"][number],
  ports: ExportTemplatePorts,
  optionEndpoints: Record<string, string>,
) {
  const { getAppWidget, getSourceById } = ports;
  const state = {} as TabLayout["state"];
  const research = researchTemplateState(widget.storage, widget.params);

  const source = widget.sourceId ? getSourceById(widget.sourceId) : undefined;
  const sourceWidget = getAppWidget(widget.widgetId, widget.sourceName);

  if (sourceWidget && widget.params) {
    state.paramOrder = getParamsOrder(
      createParamDefs(sourceWidget, source?.url),
      widget.params,
    );
  }

  state.params = (widget?.params || [])?.reduce((paramsAcc, param) => {
    const paramValue = widget.storage?.params?.[param.paramName];
    // to not include default values in the template
    if (paramValue && paramValue !== param.value) {
      paramsAcc[param.paramName] = paramValue;
    }
    if (param.type === "endpoint") {
      optionEndpoints[param.groupById] = param.paramName;
    }
    return paramsAcc;
  }, {});

  const ignoreKeys = [
    "version",
    "chartId",
    "unlinkChart",
    "chartThemeName",
    "chartPalette",
  ];
  state.chartModel = {};
  state.chartView = widget.storage?.chartView || {};
  state.storage = {};

  const storedState = getStateStorage(widget);
  const seriesType = getSeriesType(state.chartModel?.chartType);

  for (const key of Object.keys(storedState?.chartModel || {})) {
    const value = storedState?.chartModel?.[key];
    if (!ignoreKeys.includes(key) && value) {
      state.chartModel[key] = key === "cellRange" ? { columns: value.columns } : value;
    }
  }

  if (Object.keys(state.chartModel).length > 0) {
    state.chartModel.chartOptions = {
      [seriesType]: state.chartModel?.chartOptions?.[seriesType],
    };
  }

  const wColState = widget.data?.table?.columnState || {};
  state.filterModel = widget.data?.table?.filterModel || {};
  state.columnState = Object.keys(wColState).reduce((columnAcc, colId) => {
    const { sideBar, columnSizing, pagination, version, ...colState } =
      wColState[colId] || {};

    if (Object.keys(colState).some((key) => isTruthy(colState[key]))) {
      columnAcc[colId] = colState;
    }

    return columnAcc;
  }, {});

  for (const storageKey of [
    "timezones",
    "text",
    "html",
    "rawDataView",
    "chartNavigatorEnabled",
    "chartMiniChartEnabled",
    "chartBarFillEnabled",
  ]) {
    if (widget?.storage?.[storageKey]) {
      state.storage[storageKey] = widget?.storage?.[storageKey];
    }
  }

  Object.assign(state.storage, research.storage);
  Object.assign(state.params, research.params);
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => isTruthy(value)),
  );
}

export function formatDashboardDataForTemplate(
  dashboardData: TabData,
  formData: AppMetadataForm,
  ports: ExportTemplatePorts,
) {
  const { widgetIdMap, widgetStateMap, widgetMinimizedMap, optionEndpoints } =
    dashboardData.widgets.reduce(
      (acc, widget) => {
        acc.widgetIdMap[widget.id] = widget.widgetId;
        if (widget.isMinimized) {
          acc.widgetMinimizedMap[widget.id] = widget.originalH;
        }
        acc.widgetStateMap[widget.id] = serializeWidgetState(
          widget,
          ports,
          acc.optionEndpoints,
        );

        return acc;
      },
      {
        widgetIdMap: {},
        widgetStateMap: {},
        widgetMinimizedMap: {},
        optionEndpoints: {},
      },
    );

  const navigationBarNames = dashboardData.widgets.reduce((acc, widget) => {
    if (widget.widgetId === "navigation_bar") {
      for (const tab of widget.storage.tabs) acc[tab.id] = tab.name;
    }
    return acc;
  }, {});

  const groups = dashboardData.groups.map((group) => ({
    name: group.name,
    type: group.type,
    ...((group.type === "endpointParam" || group.type === "param") && {
      paramName: optionEndpoints?.[group.groupById] ?? group.groupById,
    }),
    defaultValue: group.type === "ticker" ? group.value?.symbol : group.value,
    widgetIds: dashboardData.widgets
      .filter((widget) => {
        if (group.type === "param" || group.type === "endpointParam")
          return widget?.paramGroups?.[group?.groupById] === group.id;

        return widget.groupId === group.id;
      })
      .map((widget) => widget.id),
  }));

  const tabs = Object.entries(dashboardData.gridLayout).reduce(
    (acc, [tabId, layouts]) => {
      const effectiveTabId = tabId ?? "overview";
      const tabName = navigationBarNames[effectiveTabId] || effectiveTabId;

      acc[effectiveTabId] = {
        id: effectiveTabId,
        name: tabName,
        layout: layouts
          .filter((layout) => widgetIdMap[layout.i] !== "navigation_bar")
          .map((layout) => {
            const isMinimized = layout.i in widgetMinimizedMap;
            const originalH = widgetMinimizedMap[layout.i];
            return {
              i: widgetIdMap[layout.i] || layout.i,
              x: layout.x,
              y: layout.y,
              w: layout.w,
              h: isMinimized && originalH ? originalH : layout.h,
              ...(isMinimized && { minimized: true }),
              ...(Object.keys(widgetStateMap[layout.i] || {}).length && {
                state: widgetStateMap[layout.i],
              }),
              groups: groups
                .filter((group) => group.widgetIds.includes(layout.i))
                .map((group) => group.name),
            };
          }),
      };
      return acc;
    },
    {} as BackendTemplate["tabs"],
  );

  const promptsList = trimPrompts(formData.prompts);

  return {
    name: formData.name,
    img: formData.imageUrl || "",
    img_dark: formData.imageUrl || "",
    img_light: formData.imageUrl || "",
    description: formData.description,
    allowCustomization: true,
    tabs,
    groups: groups.map((group) => {
      const { widgetIds, ...rest } = group;
      return rest;
    }),
    ...(promptsList.length > 0 && { prompts: promptsList }),
  } as BackendTemplate;
}
