import { z } from "zod";
import type { GridLayout, WidgetT } from "~/components/types";
import {
  encodeStoryGridItem,
  encodeStoryStorage,
  hasResearchStoryIdentity,
  isResearchStoryWidget,
  RESEARCH_STORY_ID,
  RESEARCH_STORY_NAME,
} from "~/lib/modeling/storyState";
import type { Source } from "~/lib/state/backendConnector";
import { canUseResearchStorySource } from "./backendValidation/nativeWidget";
import { documentChoices, documentDefinition } from "./documentTemplateState";
import { financialWidgetPolicy } from "./financialQuery";

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

function saveWidget(widget: WidgetT, resolveSource: ResolveSource) {
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
  const storyIds = new Set(widgets.filter(isResearchStoryWidget).map(({ id }) => id));
  if (!grid || !storyIds.size) return grid;
  return Object.fromEntries(
    Object.entries(grid).map(([tabId, layouts]) => [
      tabId,
      layouts.map((layout) => storyIds.has(layout.i) ? encodeStoryGridItem(layout) : layout),
    ]),
  );
}

// Project scoped widgets before their configuration reaches the dashboard API.
export function documentDashboardState(
  items: Record<string, any>,
  resolveSource: ResolveSource = () => undefined,
) {
  return Object.fromEntries(
    Object.entries(items).map(([key, item]) => {
      if (item === "DELETE" || !Array.isArray(item?.data?.widgets)) return [key, item];
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
