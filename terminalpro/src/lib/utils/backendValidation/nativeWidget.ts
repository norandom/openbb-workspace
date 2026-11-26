import { isResearchStoryWidget, RESEARCH_STORY_ID } from "~/lib/modeling/storyState";
import type { Source } from "~/lib/state/backendConnector";
import { widgetSchema } from "~/utils/zodForms";

/** Native research widgets own their requests through authenticated adapters. */
export function isEndpointlessNativeWidget(widget: {
  type?: string;
  endpoint?: unknown;
}) {
  return (
    (widget.type === "company_research" || widget.type === RESEARCH_STORY_ID) &&
    widget.endpoint === undefined &&
    widgetSchema.safeParse(widget).success
  );
}

function hasValidCachedStory(source: Source) {
  if (source.status !== "error" || !source.vendorApp) return true;
  const declaration = source.vendorApp.widgetsJsonCache?.[RESEARCH_STORY_ID];
  return declaration?.type === RESEARCH_STORY_ID && isEndpointlessNativeWidget(declaration);
}

export function canUseResearchStorySource(sourceId?: string, source?: Source) {
  return !sourceId || (source?.id === sourceId && hasValidCachedStory(source));
}

export function filterRejectedStoryCatalog(source: Source): Source {
  if (source.status !== "error" || !source.vendorApp) return source;
  const widgets = Object.entries(source.widgets ?? {});
  const valid = hasValidCachedStory(source);
  const allowed = widgets.filter(([id, widget]) => {
    if (id === RESEARCH_STORY_ID) return valid;
    return !widget || !isResearchStoryWidget(widget);
  });
  if (allowed.length === widgets.length) return source;
  return { ...source, widgets: Object.fromEntries(allowed) };
}
