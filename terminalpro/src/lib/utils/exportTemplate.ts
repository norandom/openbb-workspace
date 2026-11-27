import type { useGetWidgetsStore } from "~/components/AI/hooks/useGetAppWidgets";
import { getParamsOrder } from "~/components/DataConnectors/common/helpers";
import type { AppMetadataForm } from "~/components/General/AppDialog/schema";
import { trimPrompts } from "~/components/General/AppDialog/schema";
import { getSeriesType } from "~/components/General/Table/Chart/utils";
import { getStateStorage } from "~/components/General/Table/hooks/useUpdateColumnState";
import { isTruthy } from "~/components/General/Table/utils";
import { validStorySource } from "~/lib/eventsDocuments/access";
import {
  encodeEventsDocumentsGrid,
  encodeEventsDocumentsStorage,
  eventsDocumentsCompanions,
  eventsDocumentsNavigationTabs,
  widgetUsesLayoutGroup,
} from "~/lib/eventsDocuments/state";
import {
  encodeStoryGridItem,
  encodeStoryStorage,
  hasResearchStoryIdentity,
  isResearchStoryWidget,
  RESEARCH_STORY_ID,
} from "~/lib/modeling/storyState";
import type { TabData } from "~/lib/state/app";
import type {
  BackendTemplate,
  useBackendConnectorStore,
} from "~/lib/state/backendConnector";
import type { TabLayout } from "~/lib/templates";
import { EVENTS_DOCUMENTS_STORY_ID, isEventsDocumentsWidget } from "~/utils/nativeStorySchema";
import { canUseResearchStorySource } from "./backendValidation/nativeWidget";
import { documentTemplateState } from "./documentTemplateState";
import { researchTemplateState } from "./researchTemplateState";
import { createParamDefs } from "./widgetParams";

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
  if (isEventsDocumentsWidget(widget)) {
    const source = validStorySource(widget, widget.sourceId ? ports.getSourceById(widget.sourceId) : undefined);
    if (!source)
      throw new Error("Cannot export an unvalidated Events and Documents declaration.");
    return { storage: encodeEventsDocumentsStorage(widget.storage?.eventsDocuments, source) };
  }
  if (isResearchStoryWidget(widget)) {
    const source = widget.sourceId ? ports.getSourceById(widget.sourceId) : undefined;
    if (!hasResearchStoryIdentity(widget) || !canUseResearchStorySource(widget, source))
      throw new Error("Cannot export an unvalidated research story declaration.");
    return { storage: encodeStoryStorage(widget.storage?.researchStory) };
  }
  const documentState = documentTemplateState(widget);
  if (documentState) return documentState;
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
    if (paramValue !== undefined && paramValue !== null && paramValue !== param.value) {
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
  const widgets = dashboardData.widgets ?? [];
  const hasEventsDocuments = widgets.some(isEventsDocumentsWidget);
  const companions = hasEventsDocuments ? eventsDocumentsCompanions(widgets) : widgets;
  const { widgetIdMap, widgetStateMap, widgetMinimizedMap, optionEndpoints } =
    widgets.reduce(
      (acc, widget) => {
        acc.widgetIdMap[widget.id] = isEventsDocumentsWidget(widget) ? EVENTS_DOCUMENTS_STORY_ID : widget.widgetId;
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
        widgetIdMap: {} as Partial<Record<string, TabLayout["i"]>>,
        widgetStateMap: {} as Record<string, ReturnType<typeof serializeWidgetState>>,
        widgetMinimizedMap: {} as Partial<Record<string, number>>,
        optionEndpoints: {},
      },
    );

  const navigationBarNames = widgets.reduce<Record<string, string>>((acc, widget) => {
    if (widget.widgetId === "navigation_bar") {
      const tabs = hasEventsDocuments ? eventsDocumentsNavigationTabs(widget) : widget.storage?.tabs ?? [];
      for (const tab of tabs) acc[tab.id] = tab.name;
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
    widgetIds: companions
      .filter((widget) => widgetUsesLayoutGroup(widget, group))
      .map((widget) => widget.id),
  })).filter((group) => !hasEventsDocuments || group.widgetIds.length > 0);

  const tabs = Object.entries(dashboardData.gridLayout).reduce(
    (acc, [tabId, layouts]) => {
      const effectiveTabId = tabId ?? "overview";
      const tabName = navigationBarNames[effectiveTabId] || effectiveTabId;

      acc[effectiveTabId] = {
        id: effectiveTabId,
        name: tabName,
        layout: layouts
          .filter(({ i }) => {
            if (hasEventsDocuments && (!i || !Object.hasOwn(widgetIdMap, i))) return false;
            return !i || widgetIdMap[i] !== "navigation_bar";
          })
          .map((layout) => {
            const instanceId = layout.i!;
            const isMinimized = instanceId in widgetMinimizedMap;
            const originalH = widgetMinimizedMap[instanceId];
            const position: TabLayout<{ minimized?: boolean }> = {
              i: (widgetIdMap[instanceId] || instanceId) as TabLayout["i"],
              x: layout.x!,
              y: layout.y!,
              w: layout.w!,
              h: isMinimized && originalH ? originalH : layout.h!,
              ...(isMinimized && { minimized: true }),
            };
            if (position.i === EVENTS_DOCUMENTS_STORY_ID || position.i === RESEARCH_STORY_ID) {
              const encodeGrid = position.i === EVENTS_DOCUMENTS_STORY_ID
                ? encodeEventsDocumentsGrid : encodeStoryGridItem;
              return {
                ...encodeGrid(position),
                i: position.i,
                state: widgetStateMap[instanceId],
                groups: [],
              };
            }
            return {
              ...position,
              ...(Object.keys(widgetStateMap[instanceId] || {}).length && {
                state: widgetStateMap[instanceId],
              }),
              groups: groups
                .filter((group) => group.widgetIds.includes(instanceId))
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
