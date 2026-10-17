import isEqual from "lodash.isequal";
import { getEndpointParamName, type triggerCustomEvent } from "~/lib/utils";
import type { NewWidgetT, WidgetT } from "../types";
/**
 * Decides whether an in-memory widget update must also be persisted to the
 * app store. Param-group, group, and ticker changes are the historical
 * triggers; everything else stays in provider state until an explicit save.
 * Extracted from updateWidgetCallback so the gate is testable in isolation.
 */
export function shouldPersistWidgetUpdate(
  currentWidget: WidgetT,
  newWidget: WidgetT,
  getParamName: (groupById: string) => string,
): boolean {
  const prevMainTicker = currentWidget.data?.mainTicker?.symbol;
  const prevParams = currentWidget.storage?.params;
  const prevGroupById = currentWidget.groupById;
  const newMainTicker = newWidget.data?.mainTicker?.symbol;
  const newParams = newWidget.storage?.params;

  // Identity fields set by update_widget (MCP/copilot) arrive without any
  // param/group change — they must persist or the rename is a silent no-op.
  // The `in` guard keeps partial update objects from forcing store churn.
  if (
    ("name" in newWidget && currentWidget.name !== newWidget.name) ||
    ("description" in newWidget &&
      currentWidget.description !== newWidget.description) ||
    ("source" in newWidget && currentWidget.source !== newWidget.source)
  ) {
    return true;
  }

  if (newWidget.paramGroups) {
    const paramNames = Object.keys(newWidget.paramGroups);

    if (
      paramNames.some((groupById) => {
        const paramName = getParamName(groupById);

        return newParams?.[paramName] !== prevParams?.[paramName];
      })
    ) {
      return true;
    }
  }

  if (prevGroupById || newWidget.groupId) {
    const params = (newWidget.params ?? []).concat(
      newWidget.storage?.sqlParamDefs ?? [],
    );
    const paramName = getEndpointParamName(params, newWidget.groupById);
    if (
      prevGroupById !== newWidget.groupId ||
      prevMainTicker !== newMainTicker ||
      (paramName && prevParams?.[paramName] !== newParams?.[paramName])
    ) {
      return true;
    }
  }

  return false;
}

export type Notification = {
  name: Parameters<typeof triggerCustomEvent>[0];
  detail?: unknown;
};
export type Result = { widget: WidgetT; notifications?: Notification[] };
export type Effect = {
  id: number;
  widget: WidgetT;
  persist: boolean;
  override?: (widget: WidgetT) => void;
  dashboardId: string;
  notifications?: Notification[];
};
export type OwnerState = {
  widget: WidgetT;
  dirty: boolean;
  effects: Effect[];
  revision: number;
};
export type Operation = {
  type: "update";
  id: number;
  update: NewWidgetT;
  transform?: (widget: WidgetT) => Result;
  internal?: boolean;
  force?: boolean;
  overridden: boolean;
  override?: (widget: WidgetT) => void;
  dashboardId: string;
  paramNames: Record<string, string>;
};
export type Action =
  | Operation
  | { type: "ack"; ids: number[] }
  | { type: "saved"; revision: number; widget: WidgetT };
export function reduceWidget(state: OwnerState, action: Action): OwnerState {
  if (action.type === "ack")
    return {
      ...state,
      effects: state.effects.filter((effect) => !action.ids.includes(effect.id)),
    };
  if (action.type === "saved")
    return action.revision === state.revision && action.widget === state.widget
      ? { ...state, dirty: false }
      : state;
  const result = action.transform?.(state.widget);
  const widget =
    result?.widget ??
    ((typeof action.update === "function"
      ? action.update(state.widget)
      : action.update) as WidgetT);
  const persist =
    !action.internal &&
    !action.overridden &&
    (action.force ||
      shouldPersistWidgetUpdate(
        state.widget,
        widget,
        (id) => action.paramNames[id] ?? id,
      ));
  const dirty =
    state.dirty ||
    (!action.internal && !action.overridden && !isEqual(state.widget, widget));
  const effect: Effect = {
    id: action.id,
    widget,
    persist: Boolean(persist),
    override: action.internal ? undefined : action.override,
    dashboardId: action.dashboardId,
    notifications: result?.notifications,
  };
  return { widget, dirty, revision: action.id, effects: [...state.effects, effect] };
}
