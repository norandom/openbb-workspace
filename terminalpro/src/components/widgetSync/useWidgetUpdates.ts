import { useCallback, useLayoutEffect, useReducer, useRef } from "react";
import { getEndpointParamGroupByIds, triggerCustomEvent } from "~/lib/utils";
import type { NewWidgetT, WidgetProps, WidgetT } from "../types";
import { type Result, reduceWidget } from "./updates";

type Delivery = { through: number; highest: number; pending: Set<number> };
function wasDelivered(delivery: Delivery, id: number) {
  return id <= delivery.through || delivery.pending.has(id);
}
function markDelivered(delivery: Delivery, id: number) {
  delivery.highest = Math.max(delivery.highest, id);
  delivery.pending.add(id);
  while (delivery.pending.delete(delivery.through + 1)) delivery.through++;
}

type Options = {
  props: Omit<WidgetProps, "children">;
  initial: WidgetT;
  storeUpdateWidget: (dashboardId: string, widget: WidgetT) => void;
};
export function useWidgetUpdates({ props, initial, storeUpdateWidget }: Options) {
  const [state, dispatch] = useReducer(reduceWidget, {
    widget: initial,
    dirty: false,
    effects: [],
    revision: 0,
  });
  const latest = useRef({ state, props, storeUpdateWidget });
  const nextId = useRef(0);
  const delivered = useRef<Delivery>({ through: 0, highest: 0, pending: new Set() });
  useLayoutEffect(() => {
    latest.current = { state, props, storeUpdateWidget };
  });
  useLayoutEffect(() => {
    for (const effect of state.effects) {
      if (wasDelivered(delivered.current, effect.id)) continue;
      markDelivered(delivered.current, effect.id);
      // A previously delivered urgent operation can be replayed after deferred work.
      // Its final committed fields must survive the deferred operation's delivery.
      const rebased = effect.id < delivered.current.highest;
      const widget = rebased ? state.widget : effect.widget;
      if (effect.persist) storeUpdateWidget(effect.dashboardId, widget);
      effect.override?.(widget);
      for (const event of effect.notifications ?? [])
        triggerCustomEvent(event.name, event.detail);
    }
    if (state.effects.length)
      dispatch({ type: "ack", ids: state.effects.map((effect) => effect.id) });
  }, [state.effects, state.revision, state.widget, storeUpdateWidget]);
  const submit = useCallback(
    (
      update: NewWidgetT,
      force = false,
      transform?: (widget: WidgetT) => Result,
      internal = false,
    ) => {
      if (!update && !transform) return;
      const { props, state } = latest.current;
      const paramNames = { ...getEndpointParamGroupByIds(state.widget) };
      dispatch({
        type: "update",
        id: ++nextId.current,
        update,
        force,
        transform,
        internal,
        overridden: Boolean(props.contextOverride),
        override: props.contextOverride?.updateWidget,
        dashboardId: props.activeDashboardId,
        paramNames,
      });
    },
    [],
  );
  const replace = useCallback(
    (update: NewWidgetT, transform?: (widget: WidgetT) => Result) =>
      submit(update, false, transform, true),
    [submit],
  );
  const save = useCallback(() => {
    const committed = latest.current;
    if (!committed.state.dirty || committed.props.contextOverride) return;
    committed.storeUpdateWidget(
      committed.props.activeDashboardId,
      committed.state.widget,
    );
    latest.current = { ...committed, state: { ...committed.state, dirty: false } };
    dispatch({
      type: "saved",
      revision: committed.state.revision,
      widget: committed.state.widget,
    });
  }, []);
  return { widget: state.widget, submit, replace, save, latest };
}
