import { isResearchStoryWidget, RESEARCH_STORY_ID } from "~/lib/modeling/storyState";
import type { Source } from "~/lib/state/backendConnector";
import {
  EVENTS_DOCUMENTS_STORY_ID,
  hasEventsDocumentsCatalog,
  isEventsDocumentsWidget,
} from "~/utils/nativeStorySchema";
import { widgetSchema } from "~/utils/zodForms";

/** Native research widgets own their requests through authenticated adapters. */
export function isEndpointlessNativeWidget(widget: {
  type?: unknown;
  endpoint?: unknown;
}) {
  return (
    (widget.type === "company_research" ||
      widget.type === RESEARCH_STORY_ID ||
      widget.type === EVENTS_DOCUMENTS_STORY_ID) &&
    widget.endpoint === undefined &&
    widgetSchema.safeParse(widget).success
  );
}

function hasValidCachedStory(source: Source) {
  if (source.status !== "error" || !source.vendorApp) return true;
  const declaration = source.vendorApp.widgetsJsonCache?.[RESEARCH_STORY_ID];
  return declaration?.type === RESEARCH_STORY_ID && isEndpointlessNativeWidget(declaration);
}

export function canUseResearchStorySource(
  { sourceId, endpoint, fileEndpoint, wsEndpoint }: {
    sourceId?: string;
    endpoint?: unknown;
    fileEndpoint?: unknown;
    wsEndpoint?: unknown;
  },
  source?: Source,
) {
  return !sourceId || (
    source?.id === sourceId && hasValidCachedStory(source) &&
    endpoint === undefined && fileEndpoint === undefined && wsEndpoint === undefined
  );
}

type EventsStoryRequest = {
  sourceId?: string;
  widgetId?: unknown;
  type?: unknown;
  defaultViz?: unknown;
  endpoint?: unknown;
  fileEndpoint?: unknown;
  wsEndpoint?: unknown;
};

export function canUseEventsDocumentsStorySource(widget: EventsStoryRequest, source?: Source) {
  if (!widget.sourceId || source?.id !== widget.sourceId) return false;
  return widget.widgetId === EVENTS_DOCUMENTS_STORY_ID &&
    widget.type === EVENTS_DOCUMENTS_STORY_ID && widget.defaultViz === undefined &&
    widget.endpoint === undefined && widget.fileEndpoint === undefined &&
    widget.wsEndpoint === undefined && hasEventsDocumentsCatalog(source.widgets) &&
    (source.status === "success" ||
      (source.status === "error" && hasEventsDocumentsCatalog(source.vendorApp?.widgetsJsonCache)));
}

export function filterRejectedStoryCatalog(source: Source): Source {
  if (source.status !== "error" || !source.vendorApp) return source;
  const widgets = Object.entries(source.widgets ?? {});
  const cachedCatalog = source.vendorApp.widgetsJsonCache;
  const validResearch = hasValidCachedStory(source);
  const validEvents = hasEventsDocumentsCatalog(cachedCatalog) &&
    hasEventsDocumentsCatalog(source.widgets);
  const rejectedEvents = new Set<string>();
  if (!validEvents) rejectedEvents.add(EVENTS_DOCUMENTS_STORY_ID);
  const allowed = widgets.filter(([id, widget]) => {
    if (id === RESEARCH_STORY_ID) return validResearch;
    if (id === EVENTS_DOCUMENTS_STORY_ID) return validEvents;
    if (isEventsDocumentsWidget(widget)) {
      rejectedEvents.add(id);
      return false;
    }
    return !widget || !isResearchStoryWidget(widget);
  });
  const templates = source.templates?.filter((template) =>
    !Object.values(template?.tabs ?? {}).some((tab) =>
      Array.isArray(tab?.layout) && tab.layout.some((item) => item && rejectedEvents.has(item.i)),
    ),
  );
  if (allowed.length === widgets.length && templates?.length === source.templates?.length) {
    return source;
  }
  return { ...source, widgets: Object.fromEntries(allowed), templates };
}
