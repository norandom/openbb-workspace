import isEqual from "lodash.isequal";
import { useEffect } from "react";
import { type AppState, type Group, type Ticker, useAppStore } from "~/lib/state/app";
import { type SharedAppState, useSharedAppStore } from "~/lib/state/sharedApp";
import {
  addToWidgetParamGroups,
  needsGroupValueUpdate,
  updateWidgetGroupValues,
} from "~/lib/utils";
import type { WidgetProps } from "../types";
import type { Notification } from "./updates";
import type { useWidgetUpdates } from "./useWidgetUpdates";

type SubType = [Group[], Ticker[], string | null];
type Owner = ReturnType<typeof useWidgetUpdates>;
export function useWidgetSubscriptions(
  props: Omit<WidgetProps, "children">,
  owner: Owner,
  isShared: boolean,
  getParamName: (id: string) => string,
  ignoreParamsRef: React.RefObject<string[]>,
) {
  const { widget: providerWidget, replace, save, latest } = owner;
  useEffect(() => {
    const { activeDashboardId, uuid, contextOverride } = props;
    let unsubscribe = null;
    const ctrl = new AbortController();

    if (providerWidget?.external && providerWidget?.staleTime === undefined) {
      replace((currentWidget) => {
        return { ...currentWidget, staleTime: 1000 * 60 * 15 };
      });
    }

    if (!contextOverride) {
      const store = isShared ? useSharedAppStore : useAppStore;
      // @ts-expect-error
      unsubscribe = store.subscribe(
        (s: SharedAppState | AppState) => {
          {
            const storeWidget = s.getWidgetById(uuid);
            return [
              s.getWidgetGroups(activeDashboardId, uuid),
              storeWidget?.data?.secondaryTickers,
              storeWidget?.innerTab,
            ];
          }
        },
        (current: SubType, prev: SubType) => {
          const lastWidget = latest.current.state.widget;

          const [groups, secondaryTickers, innerTab] = current;
          const [prevGroups, prevSecondaryTickers, _] = prev;
          const group = groups?.find((g) => g.type === "ticker");

          const newGroup =
            !isEqual(groups, prevGroups) || lastWidget?.groupId !== group?.id;
          const newSecondaryTickers = !isEqual(secondaryTickers, prevSecondaryTickers);

          const linkedGroups = groups?.filter((g) =>
            needsGroupValueUpdate(lastWidget, g),
          );
          const groupValuesUpdated = linkedGroups?.length > 0;

          if (newGroup || newSecondaryTickers || groupValuesUpdated) {
            const paramNames = Object.fromEntries(
              (groups ?? []).map((g) => [g.groupById, getParamName(g.groupById)]),
            );
            const ignored = [...(ignoreParamsRef.current ?? [])];
            return replace(null, (widget) =>
              applyGroups(
                widget,
                groups,
                linkedGroups,
                secondaryTickers,
                newSecondaryTickers,
                uuid,
                paramNames,
                ignored,
              ),
            );
          }

          if (lastWidget?.innerTab !== innerTab)
            replace((currentWidget) => ({ ...currentWidget, innerTab }));
        },
        { fireImmediately: true },
      );
    }

    // Add event listeners for beforeunload and save shortcut
    window.addEventListener("beforeunload", save, { signal: ctrl.signal });

    return () => {
      if (unsubscribe) {
        unsubscribe();
        save();
      }
      ctrl.abort();
    };
  }, [replace, save, latest, getParamName, ignoreParamsRef]);
}

function applyGroups(
  currentWidget: import("../types").WidgetT,
  groups: Group[],
  linkedGroups: Group[],
  secondaryTickers: Ticker[],
  newSecondaryTickers: boolean,
  uuid: string,
  paramNames: Record<string, string>,
  ignored: string[],
) {
  const group = groups?.find((g) => g.type === "ticker");
  const groupValuesUpdated = linkedGroups?.length > 0;
  const notifications: Notification[] = [];
  const updatedWidget = updateWidgetGroupValues(
    {
      ...currentWidget,
      data: { ...currentWidget.data },
      storage: {
        ...currentWidget.storage,
        params: { ...currentWidget.storage?.params },
      },
    },
    linkedGroups,
  );
  updatedWidget.groupId = group?.id ?? null;
  updatedWidget.paramGroups = (groups || []).reduce((acc, g) => {
    if (g.type === "ticker") return acc;
    acc = addToWidgetParamGroups(acc, g);
    return acc;
  }, {});

  if (newSecondaryTickers) {
    updatedWidget.data.secondaryTickers = secondaryTickers;
  }

  const groupParams = Object.keys(updatedWidget.paramGroups);
  const updatedParams = groupParams.reduce((acc, groupById) => {
    const paramName = paramNames[groupById] ?? groupById;
    const value = updatedWidget.storage?.params?.[paramName];
    if (value !== undefined && ignored?.includes(paramName)) {
      updatedWidget.storage.params[paramName] = undefined;
    }

    acc[paramName] = value;
    return acc;
  }, {});

  if (groupValuesUpdated && groupParams?.length > 0) {
    notifications.push({ name: `updateQueryParams-${uuid}`, detail: updatedParams });
  }

  return { widget: updatedWidget, notifications };
}
