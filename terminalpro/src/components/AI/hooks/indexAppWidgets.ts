import type { WidgetItem } from "~/components/LayoutAuth/Search/WidgetMenu";
import type { WidgetT } from "~/components/types";
import { modelingWidgets } from "~/lib/modeling/catalog";
import { getJsonWidget } from "~/lib/utils";
import type { BackendName } from "./appWidgetsStore";

export function indexAppWidgets({
  apiEndpointWidgets,
  openbbSandboxWidgets,
  openbbHubWidgets,
  openbbWorkspaceWidgets,
  openbbStudioWidgets,
  customBackendWidgets,
  sharedUserAppWidgets,
  sharedWidgets,
}: {
  apiEndpointWidgets: WidgetT[];
  openbbSandboxWidgets: WidgetT[];
  openbbHubWidgets: WidgetT[];
  openbbWorkspaceWidgets: WidgetT[];
  openbbStudioWidgets: WidgetT[];
  customBackendWidgets: WidgetT[];
  sharedUserAppWidgets: WidgetT[];
  sharedWidgets: WidgetItem[];
}) {
  const map = new Map<BackendName, Map<string, WidgetT>>();

  function addWidgets(backendName: BackendName, widgets: WidgetT[]) {
    const widgetMap = widgets.reduce((acc, widget) => {
      if (!widget.widgetId) return acc;
      acc.set(widget.widgetId, widget);
      return acc;
    }, new Map<string, WidgetT>());
    map.set(backendName, widgetMap);
  }

  addWidgets("API Endpoints", apiEndpointWidgets);
  addWidgets("OpenBB Sandbox", openbbSandboxWidgets);
  addWidgets("OpenBB Hub", openbbHubWidgets);
  addWidgets("OpenBB Workspace", openbbWorkspaceWidgets);
  addWidgets("Widget Studio", openbbStudioWidgets);
  addWidgets("QOpenBB Modeling", modelingWidgets);

  // Handle custom backends dynamically
  for (const widget of customBackendWidgets) {
    const backendName = widget.sourceName;
    if (!(backendName && widget.widgetId)) continue;

    if (!map.has(backendName)) {
      map.set(backendName, new Map<string, WidgetT>());
    }
    map.get(backendName)!.set(widget.widgetId, widget);
  }

  for (const widget of sharedWidgets) {
    const isFileWidget = widget.connectionType === "file";
    const backendName = isFileWidget ? "OpenBB Hub" : widget.sourceName;
    if (!(backendName && widget.widgetId)) continue;

    if (!map.has(backendName)) {
      map.set(backendName, new Map<string, WidgetT>());
    }
    map.get(backendName)!.set(widget.widgetId, widget as WidgetT);
  }

  for (const widget of sharedUserAppWidgets) {
    // Skip if widgetId conflicts with built-in JSON widget
    if (!widget.external && getJsonWidget(widget.widgetId)) continue;
    const connectionMap = {
      single: "API Endpoints",
      file: "OpenBB Hub",
      widget_studio: "Widget Studio",
      widgetMetadata: "OpenBB Workspace",
    } as const;

    // Widget Studio widgets carry their viz type in `type` (e.g. "table"), so
    // resolve them by their id prefix to match the origin the copilot looks them
    // up with (`getWidgetOrigin` → "Widget Studio"). Otherwise they fall through
    // to `connectionType: "widgetMetadata"` and get misfiled under "OpenBB
    // Workspace", causing "Widget … not found" on data fetch.
    const backendName = widget.widgetId?.startsWith("widget_studio")
      ? "Widget Studio"
      : connectionMap[widget.type] ||
        connectionMap[widget.connectionType] ||
        widget.sourceName;

    if (map.get(backendName)?.has(widget.widgetId)) {
      if (import.meta.env.DEV)
        console.warn(
          `Widget ID conflict for "${widget.widgetId}" in backend "${backendName}".
          Skipping this widget to avoid overwriting.`,
        );
      continue;
    }
    if (!map.has(backendName)) {
      map.set(backendName, new Map<string, WidgetT>());
    }
    map.get(backendName)!.set(widget.widgetId, widget);
  }

  return map;
}
