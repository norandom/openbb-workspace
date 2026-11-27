import type { WidgetContextType, WidgetT } from "~/components/types";
import type { EventsDocumentsAccess } from "~/lib/eventsDocuments/reader";
import { useAppStore } from "~/lib/state/app";
import { useAuthStore } from "~/lib/state/auth";
import { useBackendConnectorStore, type Source } from "~/lib/state/backendConnector";
import { usePermissionsStore } from "~/lib/state/permissions";
import { useSharedAppStore } from "~/lib/state/sharedApp";
import { canUseEventsDocumentsStorySource } from "~/lib/utils/backendValidation/nativeWidget";
import { EVENTS_DOCUMENTS_STORY_ID } from "~/utils/nativeStorySchema";

export function validStorySource(widget: WidgetT, source?: Source): Source | undefined {
  if (!widget.sourceId) return;
  if (!source || widget.disabled || widget.params?.length !== 0) return;
  const prefix = widget.isSharedWidget ? "shared-" + source.name : source.name;
  const widgetId = widget.sourceName === prefix && widget.widgetId === `${prefix}-${EVENTS_DOCUMENTS_STORY_ID}`
    ? EVENTS_DOCUMENTS_STORY_ID : widget.widgetId;
  if (canUseEventsDocumentsStorySource({ ...widget, widgetId }, source)) return source;
}

export function storyAccess(getContext: () => WidgetContextType, owner?: string): EventsDocumentsAccess {
  const source = () => {
    const { widget } = getContext();
    if (!widget.sourceId) return;
    return useBackendConnectorStore.getState().getApiSourceById(widget.sourceId);
  };
  // A shared dashboard must have explicit backend and widget grants even when
  // the connection itself is locally installed.
  const isShared = () => {
    const context = getContext();
    return Boolean(context.isShared || source()?.isSharedSource || context.widget.isSharedWidget);
  };
  function allowedWidget(sourceId: string, widgetId: string) {
    return usePermissionsStore.getState().hasAccess(sourceId, widgetId);
  }
  return {
    getSource: () => validStorySource(getContext().widget, source()),
    hasDashboardAccess() {
      const { activeDashboardId, isPreview, isShared } = getContext();
      const { user } = useAuthStore.getState();
      if (!owner || user?.uuid !== owner || !user.token || isPreview || !activeDashboardId) return false;
      return isShared
        ? Boolean(useSharedAppStore.getState().sharedItems?.[activeDashboardId])
        : Boolean(useAppStore.getState().items?.[activeDashboardId]);
    },
    hasSourceAccess(sourceId) {
      if (source()?.id !== sourceId) return false;
      if (!isShared()) return true;
      return usePermissionsStore.getState().permissions.backends.some(
        (backend) => backend.uuid === sourceId && backend.access === "access",
      ) && allowedWidget(sourceId, EVENTS_DOCUMENTS_STORY_ID);
    },
    hasWidgetAccess(sourceId, widgetId) {
      return Boolean(source()?.widgets?.[widgetId]) &&
        (!isShared() || allowedWidget(sourceId, widgetId));
    },
  };
}

export function subscribeStoryAccess(sync: () => void) {
  const unsubscribe = [
    useAuthStore.subscribe(sync),
    useAppStore.subscribe(sync),
    useSharedAppStore.subscribe(sync),
    useBackendConnectorStore.subscribe(sync),
    usePermissionsStore.subscribe(sync),
  ];
  return () => unsubscribe.forEach((dispose) => dispose());
}
