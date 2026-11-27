import { z } from "zod";
import type { GridLayout, WidgetT } from "~/components/types";
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
  RESEARCH_STORY_NAME,
} from "~/lib/modeling/storyState";
import type { Source } from "~/lib/state/backendConnector";
import type { Item, TabData } from "~/lib/state/app";
import { eventsDocumentsDeclaration, isEventsDocumentsWidget } from "~/utils/nativeStorySchema";
import { canUseResearchStorySource } from "./backendValidation/nativeWidget";
import { documentChoices, documentDefinition } from "./documentTemplateState";
import { financialWidgetPolicy } from "./financialQuery";
import { getStoredFileUUIDs } from "./app";

const name = z.enum([
  "symbol",
  "provider",
  "start_date",
  "end_date",
  "page",
  "limit",
  "year",
  "quarter",
]);
const policySchema = z.object({
  maxRequests: z.literal(1),
  required: z.array(name),
  parameters: z.partialRecord(
    name,
    z.object({
      type: z.enum(["string", "integer"]).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      maxLength: z.number().optional(),
    }),
  ),
  dateWindow: z
    .object({
      mode: z.enum(["required_pair", "optional_pair", "independent_optional"]),
      maxInclusiveDays: z.number().positive().optional(),
    })
    .nullish(),
});

type ResolveSource = (sourceId: string) => Source | undefined;

function saveEventsDocumentsWidget(widget: WidgetT, resolveSource: ResolveSource) {
  const source = validStorySource(widget, widget.sourceId ? resolveSource(widget.sourceId) : undefined);
  if (!source || typeof widget.id !== "string" || !widget.id)
    throw new Error("Cannot save an unvalidated Events and Documents declaration.");
  const { widgetId, type, name, category, description } = eventsDocumentsDeclaration.shape;
  return {
    id: widget.id,
    widgetId: widgetId.value,
    type: type.value,
    name: name.value,
    category: category.value,
    description: description.value,
    sourceId: source.id,
    sourceName: widget.isSharedWidget ? `shared-${source.name}` : source.name,
    isSharedWidget: widget.isSharedWidget === true,
    external: true,
    connectionType: "advanced-backend",
    innerTab: typeof widget.innerTab === "string" ? widget.innerTab : undefined,
    isMinimized: widget.isMinimized === true,
    originalH: typeof widget.originalH === "number" && Number.isFinite(widget.originalH) && widget.originalH > 0
      ? widget.originalH : undefined,
    showTitle: typeof widget.showTitle === "boolean" ? widget.showTitle : undefined,
    disableRetrievalForCopilot: true,
    params: [],
    storage: encodeEventsDocumentsStorage(widget.storage?.eventsDocuments, source),
  };
}

function saveWidget(widget: WidgetT, resolveSource: ResolveSource) {
  if (isEventsDocumentsWidget(widget)) return saveEventsDocumentsWidget(widget, resolveSource);
  if (isResearchStoryWidget(widget)) {
    const source = widget.sourceId ? resolveSource(widget.sourceId) : undefined;
    if (!hasResearchStoryIdentity(widget) || !canUseResearchStorySource(widget, source))
      throw new Error("Cannot save an unvalidated research story declaration.");
    return {
      id: widget.id,
      widgetId: RESEARCH_STORY_ID,
      type: RESEARCH_STORY_ID,
      name: RESEARCH_STORY_NAME,
      innerTab: typeof widget.innerTab === "string" ? widget.innerTab : undefined,
      isMinimized: widget.isMinimized === true,
      originalH: Number.isFinite(widget.originalH) ? widget.originalH : undefined,
      showTitle: typeof widget.showTitle === "boolean" ? widget.showTitle : undefined,
      disableRetrievalForCopilot: true,
      params: [],
      storage: encodeStoryStorage(widget.storage?.researchStory),
    };
  }
  if (widget.type !== "company_documents") return widget;
  const definition = documentDefinition(widget);
  if (!definition) throw new Error("Cannot save an unknown document dataset.");
  const choices = documentChoices(widget);
  const url = new URL(widget.endpoint.url);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";

  const identity = Object.fromEntries(
    [
      "id",
      "widgetId",
      "type",
      "sourceId",
      "sourceName",
      "connectionType",
      "external",
      "isSharedWidget",
      "disableRetrievalForCopilot",
      "exportable",
      "name",
      "description",
      "innerTab",
      "groupId",
      "isMinimized",
      "originalH",
      "showTitle",
    ].flatMap((key) => {
      const value = widget[key];
      return ["string", "number", "boolean"].includes(typeof value)
        ? [[key, value]]
        : [];
    }),
  );
  return {
    ...identity,
    endpoint: { url: url.toString(), method: "GET" },
    params: (widget.params ?? [])
      .filter((param) =>
        ["provider", ...definition.names].includes(param.paramName as never),
      )
      .map((param) => ({
        paramName: param.paramName,
        type: param.type,
        label: param.label,
        show: param.show,
        value: choices[param.paramName] ?? null,
      })),
    data: {
      financialQueryPolicy: policySchema.parse(
        financialWidgetPolicy(widget).queryPolicy,
      ),
    },
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    storage: { params: choices },
  };
}

function saveStoryGrid(grid: GridLayout | undefined, widgets: WidgetT[]) {
  const researchIds = new Set(widgets.filter(isResearchStoryWidget).map(({ id }) => id));
  const eventsIds = new Set(widgets.filter(isEventsDocumentsWidget).map(({ id }) => id));
  if (!grid || (!researchIds.size && !eventsIds.size)) return grid;
  const widgetIds = new Set(widgets.map(({ id }) => id));
  const navigationIds = new Set(widgets.filter(({ widgetId }) => widgetId === "navigation_bar").map(({ id }) => id));
  return Object.fromEntries(
    Object.entries(grid).map(([tabId, layouts]) => [
      tabId,
      layouts.filter(({ i }) => !eventsIds.size || (i && widgetIds.has(i))).map((layout) => {
        if (layout.i && (eventsIds.has(layout.i) || (eventsIds.size && navigationIds.has(layout.i))))
          return encodeEventsDocumentsGrid(layout);
        if (layout.i && researchIds.has(layout.i)) return encodeStoryGridItem(layout);
        return layout;
      }),
    ]),
  );
}

const savedItemMetadata = z.object({
  index: z.string().optional(),
  name: z.string().optional(),
  children: z.array(z.string()).optional(),
  isFolder: z.boolean().optional(),
  isShared: z.boolean().optional(),
  isRoot: z.boolean().optional(),
  parentId: z.string().optional(),
  created_date: z.string().optional(),
  updated_date: z.string().optional(),
  created_by: z.string().optional(),
});

const savedTabMetadata = z.object({
  name: z.string(),
  type: z.enum(["custom", "template"]).optional(),
  templateId: z.string().optional(),
  locked: z.boolean().optional(),
  lastUpdated: z.number().optional(),
  numberOfChanges: z.number().optional(),
  currentTab: z.string().optional(),
});

function saveEventsNavigation(widget: WidgetT) {
  return {
    id: widget.id,
    widgetId: "navigation_bar",
    name: "Navigation Bar",
    innerTab: typeof widget.innerTab === "string" ? widget.innerTab : undefined,
    showTitle: typeof widget.showTitle === "boolean" ? widget.showTitle : undefined,
    disableRetrievalForCopilot: true,
    params: [],
    storage: { tabs: eventsDocumentsNavigationTabs(widget) },
  };
}

function saveEventsDashboard(item: Item & { data: TabData & { widgets: WidgetT[] } }, resolveSource: ResolveSource) {
  const { data } = item;
  const companions = eventsDocumentsCompanions(data.widgets);
  return {
    ...savedItemMetadata.parse(item),
    data: {
      ...savedTabMetadata.parse(data),
      gridLayout: saveStoryGrid(data.gridLayout, data.widgets),
      widgets: data.widgets.map((widget) => widget.widgetId === "navigation_bar"
        ? saveEventsNavigation(widget) : saveWidget(widget, resolveSource)),
      groups: (data.groups ?? []).filter((group) => companions.some((widget) => widgetUsesLayoutGroup(widget, group))),
      storedFileUUIDs: getStoredFileUUIDs(companions),
    },
  };
}

// Project scoped widgets before their configuration reaches the dashboard API.
export function documentDashboardState(
  items: Record<string, any>,
  resolveSource: ResolveSource = () => undefined,
) {
  return Object.fromEntries(
    Object.entries(items).map(([key, item]) => {
      if (item === "DELETE" || !Array.isArray(item?.data?.widgets)) return [key, item];
      if (item.data.widgets.some(isEventsDocumentsWidget)) return [key, saveEventsDashboard(item, resolveSource)];
      return [
        key,
        {
          ...item,
          data: {
            ...item.data,
            ...(item.data.gridLayout && {
              gridLayout: saveStoryGrid(item.data.gridLayout, item.data.widgets),
            }),
            widgets: item.data.widgets.map((widget) => saveWidget(widget, resolveSource)),
          },
        },
      ];
    }),
  );
}
