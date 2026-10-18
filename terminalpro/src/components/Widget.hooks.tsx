import { useCallback, useEffect, useMemo } from "react";
import { useCallbackRef, useCreateRef } from "~/hooks/useRefHooks";
import { useTabContext } from "~/lib/contexts/TabContext";
import { useShallowAppStore } from "~/lib/state/app";
import {
  getCellOnClickParams,
  getEndpointParamGroupByIds,
  getJsonWidget,
  getWidgetInfo,
  isOmniType,
  isSSRMType,
  useEventListener,
} from "~/lib/utils";
import { useIsFirstRender } from "./General/Table/hooks/utils";
import type { NewWidgetT, WidgetProps, WidgetT } from "./types";
import { useWidgetSubscriptions } from "./widgetSync/useWidgetSubscriptions";
import { useWidgetUpdates } from "./widgetSync/useWidgetUpdates";

export { shouldPersistWidgetUpdate } from "./widgetSync/updates";
export function useWidgetSync(props: Omit<WidgetProps, "children">) {
  const { getWidget, isShared } = useTabContext();
  const storeUpdateWidget = useShallowAppStore((state) => state.updateWidget);
  const owner = useWidgetUpdates({
    props,
    storeUpdateWidget,
    initial: props.contextOverride?.widget || (getWidget?.(props.uuid) as WidgetT),
  });
  const { widget: providerWidget, submit, replace, save } = owner;
  const updateWidgetCallback = useCallback(
    (update: NewWidgetT, force = false) => submit(update, force),
    [submit],
  );
  const isFirstRender = useIsFirstRender();
  const widgetFromJSON = useMemo(
    () => getJsonWidget(providerWidget),
    [providerWidget?.widgetId, getWidgetInfo(providerWidget), providerWidget?.params],
  );
  useEffect(() => {
    if (!isFirstRender && props.isPreview && props.contextOverride?.widget)
      replace(props.contextOverride.widget);
  }, [props.contextOverride?.widget]);
  const endpointParams = useMemo(
    () => getEndpointParamGroupByIds(providerWidget),
    [providerWidget?.params, providerWidget?.storage?.sqlParamDefs],
  );
  const cellOnClickParams = useMemo(
    () => getCellOnClickParams(providerWidget, false),
    [providerWidget?.data?.table?.columnsDefs],
  );
  const ignoreParamsRef = useCreateRef(cellOnClickParams);
  const getParamName = useCallbackRef((id: string) => endpointParams?.[id] ?? id);
  useWidgetSubscriptions(props, owner, isShared, getParamName, ignoreParamsRef);
  useEventListener("saveWidgets", save);
  useEventListener("refreshQuery", () => {
    const timestamp = Date.now();
    replace(null, (current) => ({
      widget: { ...current, refreshQuery: timestamp },
      notifications:
        isOmniType(current?.type) || isSSRMType(current?.type)
          ? [{ name: `runParams-${current?.id}` }]
          : [],
    }));
  });
  useEventListener(`updateWidget-${props?.uuid}`, updateWidgetCallback);
  return [
    updateWidgetCallback,
    providerWidget,
    widgetFromJSON,
    owner.transactions,
  ] as const;
}
