import type { WidgetT } from "~/components/types";
import widgets from "./widgets.json";

export const modelingWidgets = Object.values(widgets).map((widget) => ({
  ...widget,
  endpoint: {
    url: widget.endpoint,
    method: widget.endpointMethod,
    query: {},
    headers: {},
  },
  data: "data" in widget ? widget.data : {},
  // Retrieval must go through the session-aware modeling adapter, including for saved runs.
  disableRetrievalForCopilot: true,
  connectionType: "advanced-backend",
  sourceName: "QOpenBB Modeling",
  external: true,
})) as WidgetT[];
