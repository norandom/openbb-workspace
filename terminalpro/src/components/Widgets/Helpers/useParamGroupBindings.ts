import { useCallback, useMemo } from "react";
import { checkCompanyGroup } from "~/components/General/Table/NavBar/companyGroupSafety";
import {
  type CompanyContext,
  type CompanyMember,
  createSourceKey,
  type GroupSnapshot,
  matchBinding,
} from "~/components/General/Table/NavBar/companySelection.contract";
import type { Group, GroupTypeT, ParamDef, WidgetT } from "~/components/types";
import { useWidgetContext } from "~/components/Widget.context";
import { type Item, useAppStore, useShallowAppStore } from "~/lib/state/app";
import { type Source, useBackendConnectorStore } from "~/lib/state/backendConnector";
import { useShallowSharedAppStore, useSharedAppStore } from "~/lib/state/sharedApp";
import { createParamDefs, getEndpointParamName, getJsonWidget } from "~/lib/utils";
import { updateWidgetGroupValues } from "~/lib/utils/app";

export type ParamGroupBinding = [string, GroupTypeT<"endpointParam" | "param">];
const EMPTY_GROUPS: Group[] = [];
const EMPTY_WIDGETS: WidgetT[] = [];
function dashboardData(tab?: Item | null) {
  return {
    widgets: tab?.data?.widgets ?? EMPTY_WIDGETS,
    groups: tab?.data?.groups ?? EMPTY_GROUPS,
  };
}
/** Endpoint groups use stable IDs; plain groups already store the parameter name. */
export function getGroupParamName(
  group: Group,
  paramDefs: ParamDef[],
): string | undefined {
  if (group.type === "endpointParam")
    return getEndpointParamName(paramDefs, group.groupById) ?? group.groupById;
  if (group.type === "param") return group.groupById;
  return undefined;
}
function widgetGroups(widget: WidgetT | undefined, groups: Group[]): Group[] {
  if (!widget) return EMPTY_GROUPS;
  const ids = Object.values(widget.paramGroups ?? {});
  return groups.filter(
    (group) => ids.includes(group.id) || group.id === widget.groupId,
  );
}
function hasProviderConflict(widget: WidgetT, groups: Group[]): boolean {
  const providers = new Set<unknown>();
  for (const group of groups) {
    if (getGroupParamName(group, widget.params ?? []) !== "provider") continue;
    const applied = updateWidgetGroupValues({ ...widget, data: { ...widget.data } }, [
      group,
    ]);
    // Rejected native options leave storage unchanged and cannot affect execution.
    if (applied.storage !== widget.storage)
      providers.add(applied.storage?.params?.provider);
  }
  return providers.size > 1;
}
function resolveCompanyWidget(
  saved: WidgetT | undefined,
  sources: Source[],
  groups: Group[],
) {
  const source = sources.find((entry) => entry.id === saved?.sourceId);
  const widget = {
    ...getJsonWidget(saved ?? {}),
    ...source?.widgets?.[saved?.widgetId ?? ""],
    ...saved,
  } as WidgetT;
  const params = createParamDefs(widget) ?? [];
  const bound = widgetGroups(saved, groups);
  // Native reduction owns group order, option validity and endpoint-param mapping.
  const effectiveWidget = updateWidgetGroupValues(
    {
      ...widget,
      params,
      data: { ...widget.data },
      storage: { ...widget.storage, params: { ...widget.storage?.params } },
    },
    bound,
  );
  const effective = (name: string): unknown => {
    const stored = effectiveWidget.storage?.params?.[name];
    return stored !== undefined
      ? stored
      : params.find((param) => param.paramName === name)?.value;
  };
  const provider = effective("provider");
  const sourceKey = source ? (createSourceKey(source.id, source.url) ?? "") : "";
  const binding = hasProviderConflict({ ...widget, params }, bound)
    ? null
    : matchBinding({
        widgetId: widget.widgetId,
        type: widget.type,
        endpoint: widget.endpoint?.url,
        provider,
        sourceKey,
        runButton: widget.runButton,
        params,
      });
  return {
    widget: effectiveWidget,
    params,
    bound,
    binding,
    provider: typeof provider === "string" ? provider : "",
    sourceKey,
    symbol: effective("symbol"),
  };
}
function companyMember(
  saved: WidgetT,
  sources: Source[],
  groups: Group[],
): CompanyMember {
  const resolved = resolveCompanyWidget(saved, sources, groups);
  const symbolGroups = resolved.bound.filter(
    (group) => getGroupParamName(group, resolved.params) === "symbol",
  );
  const danglingSymbol = Object.entries(saved.paramGroups ?? {}).some(
    ([key, id]) =>
      (key === "symbol" || getEndpointParamName(resolved.params, key) === "symbol") &&
      !groups.some((group) => group.id === id),
  );
  return {
    widgetId: saved.id,
    sourceKey: resolved.sourceKey,
    provider: resolved.provider,
    eligible: !!resolved.binding && !danglingSymbol,
    symbolBindingIds: symbolGroups.map((group) => group.id),
    hasCompetingTickerBinding: resolved.bound.some(
      (group) =>
        group.type === "ticker" ||
        (group.type === "endpointParam" &&
          getGroupParamName(group, resolved.params) === "symbol"),
    ),
  };
}
function companyGroup(
  saved: WidgetT,
  sources: Source[],
  data: ReturnType<typeof dashboardData>,
): GroupSnapshot {
  const member = companyMember(saved, sources, data.groups);
  if (member.hasCompetingTickerBinding)
    return {
      kind: "unavailable",
      reason:
        "Remove competing ticker or endpoint-Symbol bindings before selecting a company.",
    };
  if (member.symbolBindingIds.length === 0) {
    const dangling = saved.paramGroups?.symbol;
    return dangling
      ? {
          kind: "unavailable",
          reason: "The bound Symbol group is unavailable. Check its membership.",
        }
      : { kind: "ungrouped" };
  }
  if (member.symbolBindingIds.length !== 1 || member.hasCompetingTickerBinding)
    return {
      kind: "unavailable",
      reason: "Remove competing Symbol or ticker bindings before selecting a company.",
    };
  const group = data.groups.find((entry) => entry.id === member.symbolBindingIds[0]);
  if (!group || typeof group.value !== "string")
    return {
      kind: "unavailable",
      reason: "The Symbol group value is unavailable. Refresh the group.",
    };
  return {
    kind: "bound",
    id: group.id,
    value: group.value,
    members: data.widgets
      .filter((widget) =>
        widgetGroups(widget, data.groups).some((entry) => entry.id === group.id),
      )
      .map((widget) => companyMember(widget, sources, data.groups)),
  };
}
function companySnapshot(
  context: ReturnType<typeof useWidgetContext>,
  data: ReturnType<typeof dashboardData>,
  sources: Source[],
) {
  const widgetUuid = context.uuid ?? context.widget?.id ?? "";
  const saved = data.widgets.find((widget) => widget.id === widgetUuid);
  const local = context.getWidget?.() ?? context.widget;
  const dashboardMember = !!saved && saved.id === local?.id;
  const origin = context.isPreview ? local : (saved ?? local);
  const resolved = resolveCompanyWidget(
    origin,
    sources,
    context.isPreview || !dashboardMember ? EMPTY_GROUPS : data.groups,
  );
  const group: GroupSnapshot =
    context.isPreview || !dashboardMember
      ? { kind: "ungrouped" }
      : companyGroup(saved, sources, data);
  const companyContext: CompanyContext = {
    widgetUuid,
    dashboardId: context.activeDashboardId ?? "",
    sourceKey: resolved.sourceKey,
    provider: resolved.provider,
    symbol: typeof resolved.symbol === "string" ? resolved.symbol : "",
    immediate: !!resolved.binding,
    isPreview: context.isPreview === true,
    dashboardMember,
    group,
  };
  return {
    companyContext,
    companyBinding: context.isPreview || dashboardMember ? resolved.binding : null,
    companyWidget: resolved.widget,
  };
}

/** Reads exact local/shared membership while retaining the existing group writers. */
export function useParamGroupBindings(params?: {
  includeDashboardGroups?: boolean;
  endpointParamsOnly?: boolean;
  filterAllowedParams?: boolean;
}) {
  const {
    includeDashboardGroups = false,
    endpointParamsOnly = false,
    filterAllowedParams = false,
  } = params ?? {};
  const context = useWidgetContext();
  const { widgetFromJSON, activeDashboardId, isShared } = context;
  const local = useShallowAppStore((s) =>
    dashboardData(isShared ? undefined : s.getTabById(activeDashboardId)),
  );
  const shared = useShallowSharedAppStore((s) =>
    dashboardData(isShared ? s.getDashboardById(activeDashboardId) : undefined),
  );
  const sources = useBackendConnectorStore((s) => s.apiSources);
  const updateGroup = useShallowAppStore((s) => s.updateGroup);
  const data = isShared ? shared : local;
  const activeWidgetGroups = useMemo(
    () =>
      widgetGroups(
        data.widgets.find(
          (widget) => widget.id === (context.uuid ?? widgetFromJSON?.id),
        ),
        data.groups,
      ),
    [data.widgets, data.groups, context.uuid, widgetFromJSON?.id],
  );
  const activeDashboardGroups = includeDashboardGroups ? data.groups : EMPTY_GROUPS;
  const allowedParams = useMemo(() => {
    if (!widgetFromJSON?.params) return undefined;
    return new Set(
      widgetFromJSON.params
        .filter((p) => (endpointParamsOnly ? p.type === "endpoint" : true))
        .map((p) => p.paramName)
        .filter(Boolean),
    );
  }, [widgetFromJSON?.params, endpointParamsOnly]);
  const bindings = useMemo<ParamGroupBinding[]>(() => {
    const result: ParamGroupBinding[] = [];
    const seen = new Set<string>();
    for (const group of [...activeWidgetGroups, ...activeDashboardGroups]) {
      if (group.type !== "endpointParam" && group.type !== "param") continue;
      if (seen.has(group.id)) continue;
      const name = getGroupParamName(group, widgetFromJSON?.params ?? []);
      if (!name || (filterAllowedParams && allowedParams && !allowedParams.has(name)))
        continue;
      seen.add(group.id);
      result.push([name, group]);
    }
    return result;
  }, [
    activeWidgetGroups,
    activeDashboardGroups,
    widgetFromJSON?.params,
    allowedParams,
    filterAllowedParams,
  ]);
  const updateGroupedParam = useCallback(
    (paramName: string, value: string | string[]) => {
      const group = bindings.find(([name]) => name === paramName)?.[1];
      if (!group?.id) return false;
      updateGroup(activeDashboardId, group.id, { ...group, value } as Group);
      return true;
    },
    [activeDashboardId, bindings, updateGroup],
  );
  const updateGroupedParams = useCallback(
    (params: Record<string, string | string[]>) => {
      for (const [name, group] of bindings) {
        if (!Object.prototype.hasOwnProperty.call(params, name)) continue;
        const value = params[name];
        if (group.value === value) continue;
        updateGroup(activeDashboardId, group.id, { ...group, value } as Group);
      }
    },
    [activeDashboardId, bindings, updateGroup],
  );
  const snapshot = useMemo(
    () => companySnapshot(context, data, sources),
    [context, data, sources],
  );
  const readContextNow = useCallback(() => {
    const tab = isShared
      ? useSharedAppStore.getState().getDashboardById(activeDashboardId)
      : useAppStore.getState().getTabById(activeDashboardId);
    return companySnapshot(
      context,
      dashboardData(tab),
      useBackendConnectorStore.getState().apiSources,
    ).companyContext;
  }, [context, activeDashboardId, isShared]);
  const writeBoundSymbol = useCallback(
    (groupId: string, symbol: string) => {
      const current = readContextNow();
      const decision = checkCompanyGroup(current);
      if (decision.kind !== "allowed") throw new Error(decision.reason);
      if (decision.groupId !== groupId || current.group.kind !== "bound")
        throw new Error("The live Symbol binding changed. Select the company again.");
      const tab = isShared
        ? useSharedAppStore.getState().getDashboardById(activeDashboardId)
        : useAppStore.getState().getTabById(activeDashboardId);
      // The existing writer prefers local records if a shared ID also exists.
      if (
        useAppStore.getState().getTabById(activeDashboardId) &&
        useSharedAppStore.getState().getDashboardById(activeDashboardId)
      )
        throw new Error("The dashboard identity is ambiguous. Reopen the dashboard.");
      const group = tab?.data?.groups.find((entry) => entry.id === groupId);
      if (!group) throw new Error("The Symbol group is unavailable.");
      updateGroup(activeDashboardId, groupId, { ...group, value: symbol } as Group);
    },
    [readContextNow, activeDashboardId, isShared, updateGroup],
  );
  return useMemo(
    () => ({
      bindings,
      updateGroupedParam,
      updateGroupedParams,
      ...snapshot,
      readContextNow,
      writeBoundSymbol,
    }),
    [
      bindings,
      updateGroupedParam,
      updateGroupedParams,
      snapshot,
      readContextNow,
      writeBoundSymbol,
    ],
  );
}
