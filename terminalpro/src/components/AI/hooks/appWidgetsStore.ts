import isEqual from "lodash.isequal";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { shallow } from "zustand/shallow";
import { createWithEqualityFn } from "zustand/traditional";
import type { WidgetT } from "~/components/types";
import type { WidgetId } from "~/components/Widgets";
import type { Selector } from "~/lib/state/app";

type BackendTypes =
  | "API Endpoints"
  | "OpenBB Sandbox"
  | "OpenBB Hub"
  | "OpenBB Workspace"
  | "Widget Studio"
  | "Shared App Widgets";

export type BackendName<T extends BackendTypes = BackendTypes> = T | (string & {});

type GetWidgetsState = {
  lastUpdated: number;
  backendNameToWidgetMap: Map<BackendName, Map<string, WidgetT>>;
  getAllAppWidgets: () => WidgetT[];
  setAppWidgets: (
    backendNameToWidgetMap: Map<BackendName, Map<string, WidgetT>>,
  ) => void;
  getAppWidget: (widgetId: WidgetId, sourceName?: BackendName) => WidgetT | undefined;
  getSqlWidget: () => WidgetT | undefined;
  getRunCodeWidget: () => WidgetT | undefined;
};

export const useGetWidgetsStore = createWithEqualityFn<GetWidgetsState>()(
  subscribeWithSelector((set, get) => ({
    lastUpdated: Date.now(),
    backendNameToWidgetMap: new Map<BackendName, Map<string, WidgetT>>(),
    getSqlWidget: () => get().getAppWidget("global_sql_builder" as WidgetId),
    getRunCodeWidget: () => get().getAppWidget("run_code" as WidgetId),
    setAppWidgets: (backendNameToWidgetMap) =>
      set({ backendNameToWidgetMap, lastUpdated: Date.now() }),
    getAppWidget: (widgetId, sourceName) => {
      const map = get().backendNameToWidgetMap;
      if (sourceName)
        return map.get(sourceName)?.get(widgetId.replace(`${sourceName}-`, ""));

      // Search all sources for the widgetId
      for (const sourceMap of map.values()) {
        if (sourceMap.has(widgetId)) {
          return sourceMap.get(widgetId);
        }
      }

      return undefined;
    },
    getAllAppWidgets: () =>
      Array.from(get().backendNameToWidgetMap.values()).flatMap((widgetMap) =>
        Array.from(widgetMap.values()).filter((widget) => !widget.disabled),
      ),
  })),
  shallow,
);

export function useShallowAppWidgetsStore<S extends GetWidgetsState, T>(
  selector: Selector<S, T>,
): T {
  return useGetWidgetsStore(useShallow(selector), (prev, next) => isEqual(prev, next));
}
