import React, { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AgGridFile from "~/components/General/Table/AgGridFile";

const state = vi.hoisted(() => ({
  widget: {} as any,
  mounts: 0,
  unmounts: 0,
}));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({ widget: state.widget, updateWidget: vi.fn(), activeDashboardId: "dashboard" }),
}));
vi.mock("~/lib/state/auth", () => ({
  useShallowAuthStore: (select: any) => select({ user: { token: "test" } }),
}));
vi.mock("~/lib/state/backendConnector", () => ({
  useShallowBackendConnectorStore: (select: any) => select({ updateQueuedRefreshId: vi.fn() }),
}));
vi.mock("~/lib/state/permissions", () => ({
  useShallowPermissionsStore: (select: any) => select({ hasAccess: () => true }),
}));
vi.mock("~/lib/state/theme", () => ({
  useShallowThemeStore: (select: any) => select({ decimalDigits: 3 }),
}));
vi.mock("~/lib/runtimeConfig", () => ({
  getConfig: () => ({ urls: { backend: "http://localhost" } }),
}));
vi.mock("~/lib/constants", () => ({ REFRESH_WIDGET_INTERVAL: false }));
vi.mock("~/lib/utils/widgetParams", () => ({
  cleanSearchParams: (url: string) => url,
  convertHeadersToRecord: () => ({ headers: {}, newParams: {} }),
}));
vi.mock("~/lib/utils/cronSchedule", () => ({ resolveCronRefetchInterval: () => false }));
vi.mock("~/lib/utils", () => ({ cn: () => "", formatNumberNoMagnitude: String }));
vi.mock("~/components/NewAdvancedSelect", () => ({ default: () => null }));
vi.mock("~/components/General/Table/AgGridUtils", () => ({
  getColumnDefs: () => [], getContextMenuItems: () => [], onPivotModeChanged: vi.fn(),
}));
vi.mock("~/components/General/Table/Chart/hooks/useChartOptions", () => ({
  default: () => ({}), useChartToolPanelAction: () => [],
}));
vi.mock("~/components/General/Table/hooks", () => ({
  AgGridProvider: ({ rowData }: any) => <div data-testid="rows">{JSON.stringify(rowData)}</div>,
  getSideBarOptions: () => ({}), useAgGridContext: () => ({ gridRef: { current: null } }),
}));
vi.mock("~/components/General/Table/hooks/communityActions", () => ({ useAgExportFuncs: () => ({}) }));
vi.mock("~/components/General/Table/hooks/useColumnVisibility", () => ({ useColumnVisibility: () => vi.fn() }));
vi.mock("~/components/General/Table/hooks/useCopilotFilteredData", () => ({ useCopilotFilteredWidgetData: vi.fn() }));
vi.mock("~/components/General/Table/SubMenus/TableSettings", () => ({ default: () => null }));
vi.mock("~/components/General/Table/utils", () => ({ getTableData: (data: any) => data }));
// Match the existing loading boundary: loading and visible errors replace its children.
vi.mock("~/components/DraggableCard", () => ({
  default: ({ loading, errorMessage, children }: any) =>
    loading ? <div role="status">Loading</div> :
      errorMessage ? <div role="alert">{errorMessage}</div> : children,
}));
vi.mock("~/components/General/Table/Chart/AgChartView", () => ({
  ChartViewButton: () => null,
  ChartViewElement: () => {
    useEffect(() => {
      state.mounts++;
      return () => { state.unmounts++; };
    }, []);
    return <div data-testid="chart-owner" />;
  },
}));

type Pending = { resolve: (response: Response) => void; url: string };
let pending: Pending[];
let client: QueryClient;
beforeEach(() => {
  state.widget = { id: "file-1", widgetId: "file-1", endpoint: { url: "http://localhost/one.json" },
    storage: { chartView: { enabled: true } }, data: {}, refreshQuery: 0 };
  state.mounts = 0;
  state.unmounts = 0;
  pending = [];
  client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>(resolve => pending.push({ resolve, url }))));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

function view() {
  return <QueryClientProvider client={client}><AgGridFile /></QueryClientProvider>;
}
async function finish(index: number, value: unknown = [{ Category: "A", Revenue: 10 }], status = 200) {
  await act(async () => pending[index].resolve(new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" },
  })));
}
async function loaded() {
  const result = render(view());
  await waitFor(() => expect(pending).toHaveLength(1));
  expect(screen.getByRole("status").textContent).toBe("Loading");
  expect(state.mounts).toBe(0);
  await finish(0);
  await screen.findByTestId("chart-owner");
  expect(screen.getByText(/Revenue/).textContent).toContain("10");
  return result;
}

it("keeps the existing chart mounted through a deferred same-source refresh and applies its result", async () => {
  const result = await loaded();
  const owner = screen.getByTestId("chart-owner");
  state.widget = { ...state.widget, refreshQuery: 1 };
  result.rerender(view());
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByTestId("chart-owner")).toBe(owner);
  expect(state.unmounts).toBe(0);
  await finish(1, [{ Category: "A", Revenue: 20 }]);
  await waitFor(() => expect(screen.getByText(/Revenue/).textContent).toContain("20"));
  expect(screen.getByTestId("chart-owner")).toBe(owner);
  expect(state.mounts).toBe(1);
});

it.each(["source", "parser"])("does not retain data when the %s identity changes", async kind => {
  const result = await loaded();
  state.widget = { ...state.widget, refreshQuery: 1,
    ...(kind === "source" ? { endpoint: { url: "http://localhost/two.json" } } : { data: { dataKey: "results" } }) };
  result.rerender(view());
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(screen.getByRole("status")).toBeDefined();
  expect(screen.queryByText(/Revenue/)).toBeNull();
  await finish(1, kind === "source" ? [{ Revenue: 30 }] : { results: [{ Revenue: 30 }] });
  await waitFor(() => expect(screen.getByText(/Revenue/).textContent).toContain("30"));
  expect(state.mounts).toBe(2);
});

it("shows refresh failure after retries instead of indefinitely showing successful placeholder data", async () => {
  const result = await loaded();
  state.widget = { ...state.widget, refreshQuery: 1 };
  result.rerender(view());
  await waitFor(() => expect(pending).toHaveLength(2));
  await finish(1, { detail: "File unavailable" }, 503);
  await waitFor(() => expect(pending).toHaveLength(3), { timeout: 2500 });
  await finish(2, { detail: "File unavailable" }, 503);
  expect((await screen.findByRole("alert")).textContent).toBe("File unavailable");
  expect(screen.queryByTestId("chart-owner")).toBeNull();
});
