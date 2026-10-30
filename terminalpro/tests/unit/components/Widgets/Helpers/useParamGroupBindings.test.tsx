import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCompanyGroup } from "~/components/General/Table/NavBar/companyGroupSafety";
import type { Group, ParamDef, WidgetContextType, WidgetT } from "~/components/types";
import {
  getGroupParamName,
  useParamGroupBindings,
} from "~/components/Widgets/Helpers/useParamGroupBindings";
import { type Item, useAppStore } from "~/lib/state/app";
import { type Source, useBackendConnectorStore } from "~/lib/state/backendConnector";
import { useSharedAppStore } from "~/lib/state/sharedApp";
import { needsGroupValueUpdate, updateWidgetGroupValues } from "~/lib/utils/app";
import { createWidgetInitParams } from "~/lib/utils/widgetParams";

vi.mock("~/components/General/Table/AgGridUtils", () => ({
  convertToReadableLabel: (v: string) => v,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "test",
}));
const mocked = vi.hoisted(() => ({ context: {} as WidgetContextType }));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => mocked.context,
}));
const writer = vi.fn(useAppStore.getState().updateGroup);
const symbolDef = {
  type: "text",
  paramName: "symbol",
  show: true,
  multiple: false,
} as ParamDef;
const endpointDef = {
  ...symbolDef,
  type: "endpoint",
  groupById: "symbol-options",
} as ParamDef;
const group = (id = "symbol", value = "AAPL", groupById = "symbol"): Group =>
  ({ id, type: "param", name: "Symbol", color: "#fff", groupById, value }) as Group;
const ticker = {
  ...group("ticker"),
  type: "ticker",
  value: { symbol: "AAPL", id: "AAPL" },
} as Group;
const endpoint = {
  ...group("endpoint", "AAPL", "symbol-options"),
  type: "endpointParam",
} as Group;
const source = {
  id: "connected",
  url: "https://data.test/prefix",
  name: "Data",
  endpointHeaders: null,
} as Source;
const sourceKey = JSON.stringify([source.id, source.url]);
function widget(id = "origin", patch: Partial<WidgetT> = {}): WidgetT {
  return {
    id,
    widgetId: "equity_fundamental_income_fmp_obb",
    type: "table",
    sourceId: source.id,
    endpoint: { url: `${source.url}/api/v1/equity/fundamental/income` },
    params: [
      symbolDef,
      { type: "text", paramName: "provider", value: "fmp", show: false },
    ],
    storage: { params: { symbol: "AAPL", provider: "fmp" } },
    paramGroups: { symbol: "symbol" },
    ...patch,
  } as WidgetT;
}
function dashboard(widgets = [widget(), widget("peer")], groups = [group()]): Item {
  return { index: "dash", data: { widgets, groups } } as Item;
}
function setDashboard(tab: Item) {
  if (mocked.context.isShared)
    useSharedAppStore.setState({ sharedItems: { dash: tab } as never });
  else useAppStore.setState({ items: { dash: tab } });
}
function currentDashboard(): Item {
  return mocked.context.isShared
    ? useSharedAppStore.getState().getDashboardById("dash")
    : useAppStore.getState().getTabById("dash");
}
beforeEach(() => {
  writer.mockClear();
  useAppStore.setState({ items: {}, updateGroup: writer });
  useSharedAppStore.setState({ sharedItems: null });
  useBackendConnectorStore.setState({ apiSources: [source] });
  mocked.context = {
    widget: widget(),
    widgetFromJSON: widget(),
    uuid: "origin",
    activeDashboardId: "dash",
    isShared: false,
    isPreview: false,
  };
  setDashboard(dashboard());
});
afterEach(cleanup);
it("resolves endpoint names and preserves fallback, plain params and ticker exclusion", () => {
  expect(getGroupParamName(endpoint, [endpointDef])).toBe("symbol");
  expect(getGroupParamName(endpoint, [])).toBe("symbol-options");
  expect(getGroupParamName(group(), [])).toBe("symbol");
  expect(getGroupParamName(ticker, [])).toBeUndefined();
});
describe.each([false, true])("dashboard groups (shared=%s)", (shared) => {
  beforeEach(() => {
    mocked.context.isShared = shared;
    if (shared) useAppStore.setState({ items: {} });
    setDashboard(dashboard());
  });
  it("retains writers, skips unchanged/unbound values and uses the original shared/local writer", () => {
    const { result } = renderHook(() => useParamGroupBindings());
    expect(result.current.bindings).toEqual([["symbol", group()]]);
    act(() => result.current.updateGroupedParams({ symbol: "AAPL", other: "x" }));
    expect(writer).not.toHaveBeenCalled();
    act(() => expect(result.current.updateGroupedParam("missing", "x")).toBe(false));
    act(() => expect(result.current.updateGroupedParam("symbol", "MSFT")).toBe(true));
    expect(writer).toHaveBeenCalledTimes(1);
    expect(currentDashboard().data.groups[0].value).toBe("MSFT");
  });
  it("selects widgets AND groups reactively while the shared getter identity stays unchanged", () => {
    const getter = useSharedAppStore.getState().getDashboardById;
    const { result } = renderHook(() => useParamGroupBindings());
    expect(result.current.companyContext.symbol).toBe("AAPL");
    act(() =>
      setDashboard(dashboard([widget(), widget("peer")], [group("symbol", "MSFT")])),
    );
    expect(result.current.companyContext.symbol).toBe("MSFT");
    act(() =>
      setDashboard(
        dashboard(
          [widget(), widget("fred", { widgetId: "fred_series", sourceId: "fred" })],
          [group("symbol", "MSFT")],
        ),
      ),
    );
    expect(checkCompanyGroup(result.current.companyContext).kind).toBe("blocked");
    expect(useSharedAppStore.getState().getDashboardById).toBe(getter);
  });
  it("rereads membership and effective symbol before rerender", () => {
    const { result } = renderHook(() => useParamGroupBindings());
    const readNow = result.current.readContextNow;
    act(() => {
      setDashboard(
        dashboard(
          [
            widget(),
            widget("peer", {
              storage: { params: { provider: "fred", symbol: "GDP" } },
            }),
          ],
          [group("symbol", "MSFT")],
        ),
      );
      expect(readNow().symbol).toBe("MSFT");
      expect(checkCompanyGroup(readNow()).kind).toBe("blocked");
      expect(() => result.current.writeBoundSymbol("symbol", "GOOG")).toThrow();
    });
    expect(writer).not.toHaveBeenCalled();
  });
  it("writes one exact compatible group and preserves an independent FRED group", () => {
    setDashboard(
      dashboard(
        [
          widget(),
          widget("peer"),
          widget("fred", { widgetId: "fred_series", paramGroups: { symbol: "fred" } }),
        ],
        [group(), group("fred", "GDP")],
      ),
    );
    const { result } = renderHook(() => useParamGroupBindings());
    expect(checkCompanyGroup(result.current.companyContext)).toEqual({
      kind: "allowed",
      groupId: "symbol",
    });
    act(() => result.current.writeBoundSymbol("symbol", "MSFT"));
    expect(writer).toHaveBeenCalledTimes(1);
    expect(currentDashboard().data.groups.map((g) => g.value)).toEqual(["MSFT", "GDP"]);
  });
  it.each([
    ["provider", { storage: { params: { symbol: "AAPL", provider: "other" } } }],
    ["source", { sourceId: "other" }],
    ["endpoint", { endpoint: { url: `${source.url}/api/v1/equity/search` } }],
    ["manual", { runButton: true }],
    ["hidden Symbol", { params: [{ ...symbolDef, show: false }] }],
    ["ticker", { groupId: "ticker" }],
    [
      "endpoint Symbol",
      {
        paramGroups: { symbol: "symbol", "symbol-options": "endpoint" },
        params: [symbolDef, endpointDef],
      },
    ],
  ])("rejects a member with changed %s", (_label, patch) => {
    setDashboard(
      dashboard(
        [widget(), widget("peer", patch as Partial<WidgetT>)],
        [group(), ticker, endpoint],
      ),
    );
    const { result } = renderHook(() => useParamGroupBindings());
    expect(checkCompanyGroup(result.current.readContextNow()).kind).toBe("blocked");
    expect(() => result.current.writeBoundSymbol("symbol", "MSFT")).toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
});
it("dedupes by id, preserves distinct bindings and filters allowed names", () => {
  setDashboard(
    dashboard(
      [widget("origin", { paramGroups: { a: "symbol", b: "second" } })],
      [group(), group("second"), group("sector", "tech", "sector"), ticker],
    ),
  );
  const { result, rerender } = renderHook(
    ({ include, filter }) =>
      useParamGroupBindings({
        includeDashboardGroups: include,
        filterAllowedParams: filter,
      }),
    { initialProps: { include: false, filter: false } },
  );
  expect(result.current.bindings).toHaveLength(2);
  rerender({ include: true, filter: false });
  expect(result.current.bindings).toHaveLength(3);
  rerender({ include: true, filter: true });
  expect(result.current.bindings).toHaveLength(2);
});
it.each([
  "preview",
  "detached",
  "wrong dashboard",
  "missing dashboard",
])("never calls live company writer for %s", (kind) => {
  if (kind === "preview") mocked.context.isPreview = true;
  if (kind === "detached") mocked.context.uuid = "detached";
  if (kind === "wrong dashboard") mocked.context.activeDashboardId = "other";
  if (kind === "missing dashboard") useAppStore.setState({ items: {} });
  const { result } = renderHook(() => useParamGroupBindings());
  expect(checkCompanyGroup(result.current.companyContext)).toEqual({
    kind: "allowed",
    groupId: null,
  });
  expect(() => result.current.writeBoundSymbol("symbol", "MSFT")).toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it("keeps stable empty bindings", () => {
  useAppStore.setState({ items: {} });
  const { result, rerender } = renderHook(() => useParamGroupBindings());
  const first = result.current.bindings;
  rerender();
  expect(result.current.bindings).toBe(first);
});
it("reacts to connector URL changes and refuses stale endpoint identity", () => {
  const { result } = renderHook(() => useParamGroupBindings());
  expect(result.current.companyContext.sourceKey).toBe(sourceKey);
  act(() =>
    useBackendConnectorStore.setState({
      apiSources: [{ ...source, url: "https://new.test/prefix" }],
    }),
  );
  expect(result.current.companyContext.sourceKey).not.toBe(sourceKey);
  expect(checkCompanyGroup(result.current.readContextNow()).kind).toBe("blocked");
});
it("resolves sparse saved records from the actual connected source definition", () => {
  const definition = widget();
  useBackendConnectorStore.setState({
    apiSources: [
      { ...source, widgets: { [definition.widgetId]: definition } as never },
    ],
  });
  const sparse = {
    id: "origin",
    widgetId: definition.widgetId,
    sourceId: source.id,
    storage: { params: { symbol: "AAPL" } },
    paramGroups: { symbol: "symbol" },
  } as WidgetT;
  mocked.context.widget = sparse;
  setDashboard(dashboard([sparse, { ...sparse, id: "peer" }]));
  const { result } = renderHook(() => useParamGroupBindings());
  expect(checkCompanyGroup(result.current.companyContext)).toEqual({
    kind: "allowed",
    groupId: "symbol",
  });
  expect(result.current.companyBinding?.widgetId).toBe(definition.widgetId);
  expect(
    result.current.companyWidget.params.find((p) => p.paramName === "symbol")?.show,
  ).toBe(true);
});
it("preserves local preview values even when a live Symbol group has changed", () => {
  mocked.context.isPreview = true;
  setDashboard(dashboard([widget()], [group("symbol", "MSFT")]));
  const { result } = renderHook(() => useParamGroupBindings());
  expect(result.current.companyContext.symbol).toBe("AAPL");
  expect(result.current.companyContext.group.kind).toBe("ungrouped");
});
it("does not apply a grouped write when the existing writer would select a different dashboard", () => {
  useSharedAppStore.setState({ sharedItems: { dash: dashboard() } as never });
  const { result } = renderHook(() => useParamGroupBindings());
  expect(() => result.current.writeBoundSymbol("symbol", "MSFT")).toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it("does not crash for an absent widget during context initialization", () => {
  mocked.context = {
    widget: undefined,
    activeDashboardId: "dash",
    uuid: "",
    isPreview: false,
  };
  const { result } = renderHook(() => useParamGroupBindings());
  expect(checkCompanyGroup(result.current.companyContext).kind).toBe("blocked");
  expect(result.current.companyBinding).toBeNull();
});
it("updates changed parameter groups through the existing batch writer", () => {
  const { result } = renderHook(() => useParamGroupBindings());
  act(() => result.current.updateGroupedParams({ symbol: "MSFT", other: "x" }));
  expect(writer).toHaveBeenCalledTimes(1);
  expect(currentDashboard().data.groups[0].value).toBe("MSFT");
});

describe.each([false, true])("native provider precedence (shared=%s)", (shared) => {
  it.each([
    ["fmp", "other"],
    ["other", "fmp"],
  ])("matches native provider reduction for %s then %s", (first, last) => {
    mocked.context.isShared = shared;
    if (shared) useAppStore.setState({ items: {} });
    const membership = {
      symbol: "symbol",
      provider: "provider-first",
      "provider-again": "provider-last",
    };
    const origin = widget("origin", {
      paramGroups: membership,
      storage: { params: { symbol: "AAPL", provider: "initial" } },
    });
    const peer = { ...origin, id: "peer" };
    const bound = [
      group(),
      group("provider-first", first, "provider"),
      group("provider-last", last, "provider"),
    ];
    const independent = group("independent", "GDP", "series_id");
    const native = updateWidgetGroupValues(origin, bound).storage.params.provider;
    mocked.context.widget = origin;
    setDashboard(dashboard([origin, peer], [...bound, independent]));
    const { result } = renderHook(() => useParamGroupBindings());
    expect(result.current.companyContext.provider).toBe(native);
    expect(result.current.readContextNow().provider).toBe(native);
    expect(result.current.companyWidget.storage.params.provider).toBe(native);
    expect(result.current.companyBinding).toBeNull();
    expect(checkCompanyGroup(result.current.companyContext).kind).toBe("blocked");
    expect(() => result.current.writeBoundSymbol("symbol", "MSFT")).toThrow();
    expect(writer).not.toHaveBeenCalled();
    expect(currentDashboard().data.groups.find((g) => g.id === "independent")).toEqual(
      independent,
    );
    expect(
      currentDashboard()
        .data.groups.filter((g) => g.groupById === "provider")
        .map((g) => g.value),
    ).toEqual([first, last]);
  });
});

it("blocks state-dependent provider conflicts and ignores native-rejected option groups", () => {
  const membership = {
    symbol: "symbol",
    provider: "provider-other",
    "provider-again": "provider-fmp",
  };
  const origin = widget("origin", { paramGroups: membership });
  const bound = [
    group(),
    group("provider-other", "other", "provider"),
    group("provider-fmp", "fmp", "provider"),
  ];
  expect(updateWidgetGroupValues(origin, bound).storage.params.provider).toBe("fmp");
  const linked = bound.filter((g) => needsGroupValueUpdate(origin, g));
  expect(updateWidgetGroupValues(origin, linked).storage.params.provider).toBe("other");
  mocked.context.widget = origin;
  setDashboard(dashboard([origin, { ...origin, id: "peer" }], bound));
  const { result } = renderHook(() => useParamGroupBindings());
  expect(result.current.companyBinding).toBeNull();
  expect(checkCompanyGroup(result.current.readContextNow()).kind).toBe("blocked");
  expect(() => result.current.writeBoundSymbol("symbol", "MSFT")).toThrow();
  expect(writer).not.toHaveBeenCalled();
  const constrained = {
    ...origin,
    params: origin.params.map((p) =>
      p.paramName === "provider"
        ? { ...p, options: [{ label: "FMP", value: "fmp" }] }
        : p,
    ),
  } as WidgetT;
  act(() =>
    setDashboard(dashboard([constrained, { ...constrained, id: "peer" }], bound)),
  );
  expect(result.current.companyBinding).not.toBeNull();
  expect(checkCompanyGroup(result.current.readContextNow())).toEqual({
    kind: "allowed",
    groupId: "symbol",
  });
});

it.each([
  "stored",
  "bound",
])("preserves native explicit null provider from %s parameters", (kind) => {
  const origin = widget("origin", {
    storage: { params: { symbol: "AAPL", provider: kind === "stored" ? null : "fmp" } },
    paramGroups:
      kind === "bound"
        ? { symbol: "symbol", provider: "provider-null" }
        : { symbol: "symbol" },
    params: [
      symbolDef,
      {
        type: "text",
        paramName: "provider",
        value: "fmp",
        options: [],
        show: false,
      } as ParamDef,
    ],
  });
  const bound =
    kind === "bound"
      ? [group(), { ...group("provider-null", "", "provider"), value: null } as Group]
      : [group()];
  const native = createWidgetInitParams(updateWidgetGroupValues(origin, bound));
  expect(native.provider).toBeNull();
  mocked.context.widget = origin;
  setDashboard(dashboard([origin, { ...origin, id: "peer" }], bound));
  const { result } = renderHook(() => useParamGroupBindings());
  expect(result.current.companyWidget.storage.params.provider).toBe(native.provider);
  expect(result.current.companyContext.provider).not.toBe("fmp");
  expect(result.current.companyBinding).toBeNull();
  expect(checkCompanyGroup(result.current.readContextNow()).kind).toBe("blocked");
  expect(() => result.current.writeBoundSymbol("symbol", "MSFT")).toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it("preserves an explicit null Symbol instead of restoring its native default", () => {
  const origin = widget("origin", {
    storage: { params: { symbol: null, provider: "fmp" } },
    paramGroups: {},
    params: [
      { ...symbolDef, value: "AAPL" },
      { type: "text", paramName: "provider", value: "fmp", show: false } as ParamDef,
    ],
  });
  expect(createWidgetInitParams(origin).symbol).toBeNull();
  mocked.context.widget = origin;
  setDashboard(dashboard([origin], []));
  const { result } = renderHook(() => useParamGroupBindings());
  expect(result.current.companyContext.symbol).toBe("");
  expect(result.current.readContextNow().symbol).toBe("");
  expect(result.current.companyWidget.storage.params.symbol).toBeNull();
});
