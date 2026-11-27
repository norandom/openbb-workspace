import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MemoryRouter } from "react-router-dom";
import { apiClient } from "~/api/api";
import { postDashboards, saveDashboards } from "~/api/dashboard.api";
import { DashboardPopup } from "~/components/LayoutAuth/DropdownSubs/DashboardPopup";
import { useTemplateExportStore } from "~/lib/state/exportTemplate";
import { backendTemplateSchema } from "~/lib/types/app/templates";
import { formatDashboardDataForTemplate } from "~/lib/utils/exportTemplate";
import { createCustomTemplateTab } from "~/lib/utils/createTemplates";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, Suspense } from "react";
import type { StoreApi } from "zustand";
import { afterEach, expect, it, vi } from "vitest";
import type { EChartsHostProps } from "~/components/General/Table/Chart/echarts/EChartsHost";
import { WidgetComponent } from "~/components/Widget";
import { WidgetContext } from "~/components/Widget.context";
import type { WidgetContextType } from "~/components/types";
import { eventsDocumentsBindings } from "~/lib/eventsDocuments/reader";
import type { Slot } from "~/lib/eventsDocuments/selection";
import { useAppStore } from "~/lib/state/app";
import { useAuthStore } from "~/lib/state/auth";
import { useBackendConnectorStore, type BackendTemplate, type Source } from "~/lib/state/backendConnector";
import { usePermissionsStore } from "~/lib/state/permissions";
import { useSharedAppStore } from "~/lib/state/sharedApp";
import { useThemeStore } from "~/lib/state/theme";
import { createRootFolder } from "~/lib/utils/app";
import { validateObject } from "~/lib/utils/backendValidation/catalog";
import { openListedApp } from "~/lib/utils/createTemplates";
import fixture from "./fixtures/eventsDocumentsCatalog.json";

vi.mock("~/components/DraggableCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const chart = vi.hoisted(() => vi.fn<(props: EChartsHostProps) => void>());
vi.mock("~/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: (props: EChartsHostProps) => { chart(props); return <div />; },
}));

function restore<S>(store: Pick<StoreApi<S>, "getState" | "setState">) {
  const initial = store.getState();
  return () => store.setState(initial);
}

const restoreStores = [
  restore(useAuthStore), restore(useAppStore), restore(useBackendConnectorStore),
  restore(useSharedAppStore), restore(usePermissionsStore), restore(useThemeStore),
];

afterEach(() => {
  cleanup();
  restoreStores.forEach((restore) => restore());
  vi.unstubAllGlobals();
  chart.mockClear();
  useTemplateExportStore.getState().setDashboardId(null);
  vi.restoreAllMocks();
});

async function fromCatalog() {
  const widgets = structuredClone(fixture.widgets);
  expect(validateObject(widgets)).toBeNull();
  const source: Source = {
    id: "installed", url: "/data", name: "QOpenBB", endpointHeaders: [],
    widgets: widgets as unknown as Source["widgets"], status: "success",
    templates: [structuredClone(fixture.app) as unknown as BackendTemplate],
  };
  const root = createRootFolder();
  if (!root.index) throw new Error("The Workspace root folder is missing an ID");
  const items = { [root.index]: root };
  useAuthStore.setState({ user: { uuid: "analyst", token: "synthetic" } } as never);
  useAppStore.setState({ items, debounceSaveDashboards: vi.fn() });
  useBackendConnectorStore.setState({ apiSources: [source] });
  const id = await openListedApp({
    source, items, addTab: useAppStore.getState().addTab, navigate: () => {},
  });
  if (!id) throw new Error("The generated App did not create a dashboard");
  const dashboard = useAppStore.getState().items[id];
  const widget = dashboard.data?.widgets?.[0];
  if (!widget) throw new Error("The catalog dashboard is missing its story widget");
  const context: WidgetContextType = {
    widget,
    widgetRef: { current: widget },
    activeDashboardId: id,
    widgetFromJSON: widget,
    isPreview: false,
    isShared: false,
    uuid: widget.id,
    updateWidget: vi.fn(),
    getWidget: () => widget,
  };
  return { context, dashboard, source };
}

type Send = { slot: Slot; url: URL; request?: RequestInit; resolve(value: Response): void };
const slots = ["calendar", "filings", "transcript", "news"] as const;
const retrievedAt = "2026-11-27T09:00:00Z";
const calendarRows = [
  { symbol: "AAPL", report_date: "2026-11-19", eps_actual: 0, revenue_consensus: 12.5 },
  { symbol: "MSFT", report_date: "2026-11-19", eps_actual: 5 },
];

function mount(context: WidgetContextType) {
  const sends: Send[] = [];
  vi.stubGlobal("fetch", vi.fn((url: URL, request?: RequestInit) => {
    const slot = slots.find((key) => url.pathname === eventsDocumentsBindings[key].route);
    if (!slot) throw new Error("Unexpected query URL " + url.pathname);
    return new Promise<Response>((resolve) => sends.push({ slot, url, request, resolve }));
  }));
  render(<StrictMode><Suspense><WidgetContext.Provider value={context}>
    <WidgetComponent />
  </WidgetContext.Provider></Suspense></StrictMode>);
  return sends;
}

function response(send: Send, results: Record<string, unknown>[]) {
  const { slot, url } = send;
  const binding = eventsDocumentsBindings[slot];
  const query = Object.fromEntries([...url.searchParams].map(([key, value]) =>
    [key, ["page", "limit", "year", "quarter"].includes(key) ? Number(value) : value]));
  const limit = slot === "calendar" ? 250 : Number(query.limit) || null;
  return Response.json({ results, extra: { results_metadata: { __qopenbb_financial__: {
    schema_version: 1, provider: "fmp", dataset: binding.metadataDataset,
    source: { endpoint: binding.sourceEndpoint }, retrieved_at: retrievedAt,
    effective_query: query,
    bounds: { requested_limit: limit, effective_limit: limit, returned_count: results.length, truncated: null, completeness: "unknown" },
    fields: {},
  } } } });
}

async function resolveInitial(sends: Send[]) {
  await waitFor(() => expect(sends.map(({ slot }) => slot)).toEqual(slots));
  await act(async () => {
    sends[0].resolve(response(sends[0], calendarRows));
    sends[1].resolve(response(sends[1], [
      { symbol: "AAPL", filing_date: "2026-11-18", report_type: "10-Q", content_status: "metadata_only" },
    ]));
    sends[2].resolve(response(sends[2], [
      { symbol: "AAPL", year: 2025, quarter: "Q1", date: "2025-01-30", content: "Synthetic call", content_status: "completeness_unknown" },
    ]));
    sends[3].resolve(response(sends[3], [
      { symbol: "AAPL", date: "2026-11-18T23:00:00Z", title: "Synthetic news", excerpt: "Excerpt", content_status: "partial" },
    ]));
  });
}

async function conclusion() {
  const region = await screen.findByRole("region", { name: "Conclusion" });
  const status = within(region).getByRole("status");
  expect(status).toHaveAttribute("aria-live", "polite");
  return { region, status };
}

it.each(["light", "dark"] as const)("launches current evidence from the generated App in %s", async (theme) => {
  const { context } = await fromCatalog();
  const user = userEvent.setup();
  useThemeStore.setState({ theme });
  const sends = mount(context);
  expect(await screen.findByRole("heading", { name: fixture.app.description })).toBeVisible();
  const { region, status } = await conclusion();
  expect(status).toHaveTextContent("Pending");
  await resolveInitial(sends);
  expect(status).toHaveTextContent("Evidence available");
  expect(region).toHaveTextContent("eps_actual · 0");
  expect(region).toHaveTextContent("eps_consensus · Missing");
  expect(region).toHaveTextContent("filing_date · 2026-11-18 · 10-Q · Metadata only");
  expect(region).toHaveTextContent("content · 2025-01-30 · Completeness unknown");
  expect(region).toHaveTextContent("Synthetic news · Partial content");
  expect(chart.mock.calls[0]?.[0].options.textStyle?.color).toBe(theme === "dark" ? "#e1e6ef" : "#263044");
  expect(sends[0].url.searchParams.has("symbol")).toBe(false);
  expect(new Headers(sends[0].request?.headers).has("Authorization")).toBe(false);
  expect(sends[0].request).toMatchObject({ cache: "no-store", redirect: "error" });

  screen.getByRole("button", { name: /AAPL · Synthetic news/ }).focus();
  await user.tab();
  expect(region).toHaveFocus();
  expect(sends).toHaveLength(4);

  const custom = screen.getByRole("textbox", { name: "Custom listing symbol" });
  await user.type(custom, "rds-a.l");
  expect(sends).toHaveLength(4);
  const inspect = screen.getByRole("button", { name: /Actual EPS 0.*inspect source/ });
  inspect.focus();
  await user.keyboard("{Enter}");
  await user.keyboard("{Escape}");
  expect(inspect).toHaveFocus();
  fireEvent.change(screen.getByRole("combobox", { name: "EPS chart display" }), { target: { value: "point" } });
  expect(sends).toHaveLength(4);
  const listing = screen.getByRole("button", { name: "Microsoft (MSFT)" });
  listing.focus();
  await user.keyboard("{Enter}");
  expect(sends.slice(4).map(({ slot, url }) => [slot, url.searchParams.get("symbol")])).toEqual([
    ["filings", "MSFT"], ["transcript", "MSFT"], ["news", "MSFT"],
  ]);
  expect(status).toHaveTextContent("Partial evidence");
  expect(region).toHaveTextContent("eps_actual · 5");
  expect(region).not.toHaveTextContent("Synthetic news");

  await user.type(custom, "rds-a.l");
  expect(sends).toHaveLength(7);
  await user.keyboard("{Enter}");
  expect(sends.slice(7).map(({ url }) => url.searchParams.get("symbol"))).toEqual(Array(3).fill("RDS-A.L"));
  expect(screen.getByText("RDS-A.L", { selector: "strong" })).toBeVisible();
});

function setField(group: string, field: string, value: string) {
  const bounds = screen.getByRole("group", { name: group });
  fireEvent.change(within(bounds).getByLabelText(field), { target: { value } });
  return { bounds, apply: () => fireEvent.click(within(bounds).getByRole("button")) };
}

it("applies input bounds independently, names invalid fields and restores focus on invalidation", async () => {
  const { context } = await fromCatalog();
  const user = userEvent.setup();
  const sends = mount(context);
  await resolveInitial(sends);
  const { status } = await conclusion();
  const calendar = setField("Calendar window", "End date", "2026-11-23");
  expect(sends).toHaveLength(4);
  await user.click(screen.getByRole("button", { name: /Actual EPS 0.*inspect source/ }));
  // Submit without moving focus from the detail that is about to disappear.
  fireEvent.submit(calendar.bounds.closest("form")!);
  expect(screen.getByRole("heading", { name: "FMP earnings calendar" })).toHaveFocus();
  expect(within(calendar.bounds).getByRole("alert")).toHaveTextContent(/End date.*1–7 days/);
  expect(sends).toHaveLength(4);
  expect(status).toHaveTextContent("3 of 4");
  setField("Calendar window", "Start date", "2026-11-17").apply();
  setField("Filing bounds", "Page", "1").apply();
  setField("Transcript period", "Quarter", "2").apply();
  setField("News bounds", "Limit", "5").apply();
  expect(sends.slice(4).map(({ slot }) => slot)).toEqual(slots);
  expect(sends[4].url.searchParams.get("end_date")).toBe("2026-11-23");
  expect(sends[5].url.searchParams.get("page")).toBe("1");
  expect(sends[6].url.searchParams.get("quarter")).toBe("2");
  expect(sends[7].url.searchParams.get("limit")).toBe("5");
  await act(async () => {
    sends[5].resolve(Response.json({ provider: "fmp", code: "timeout" }, { status: 504 }));
    [4, 6, 7].forEach((index) => sends[index].resolve(new Response(null, { status: 204 })));
  });
  expect(status).toHaveTextContent("Insufficient evidence");
  await user.click(screen.getByRole("button", { name: "Retry SEC filings" }));
  expect(sends.map(({ slot }) => slot).slice(8)).toEqual(["filings"]);
  expect(status).toHaveTextContent("Pending");
  await act(async () => sends[8].resolve(response(sends[8], [
    { symbol: "AAPL", filing_date: "2026-11-18", content_status: "metadata_only" },
  ])));
  expect(status).toHaveTextContent("Partial evidence");
});

it("fails closed for a preview, mismatched widget identity, and a revoked shared permission", async () => {
  const { context, dashboard, source } = await fromCatalog();
  const previewSends = mount({ ...context, isPreview: true });
  expect((await conclusion()).status).toHaveTextContent("Insufficient evidence");
  expect(previewSends).toHaveLength(0);
  cleanup();

  const malformed = { ...context.widget, widgetId: "alias-events_documents_story" as const };
  const mismatchedSends = mount({ ...context, widget: malformed });
  expect(await screen.findByRole("alert")).toHaveTextContent("declaration or source is unavailable");
  expect(mismatchedSends).toHaveLength(0);
  cleanup();

  useSharedAppStore.setState({ sharedItems: { [context.activeDashboardId!]: { ...dashboard, created_by: "owner" } } });
  const ungranted = mount({ ...context, isShared: true });
  expect((await conclusion()).status).toHaveTextContent("Insufficient evidence");
  expect(ungranted).toHaveLength(0);
  cleanup();

  const grants = {
    uuid: source.id, name: source.name, url: source.url, access: "access", endpointHeaders: [], templates: [],
    widgets: Object.keys(source.widgets!).map((widgetId) => ({ widgetId, access: "access" })),
  };
  usePermissionsStore.getState().setPermissions({ backends: [grants], files: [], prompts: [] });
  const sharedSends = mount({ ...context, isShared: true, widget: {
    ...context.widget, widgetId: "QOpenBB-events_documents_story",
  } });
  await resolveInitial(sharedSends);
  const { region, status } = await conclusion();
  expect(status).toHaveTextContent("Evidence available");
  act(() => usePermissionsStore.getState().setPermissions({
    backends: [{ ...grants, widgets: grants.widgets.filter(({ widgetId }) => widgetId !== eventsDocumentsBindings.news.widgetId) }],
    files: [], prompts: [],
  }));
  expect(status).toHaveTextContent("3 of 4");
  expect(region).not.toHaveTextContent("Synthetic news");
  expect(sharedSends).toHaveLength(4);
  act(() => useAuthStore.setState({ user: null }));
  expect((await conclusion()).status).toHaveTextContent("Insufficient evidence");
  expect(sharedSends).toHaveLength(4);
});

it("suppresses invalid inputs while preserving independent evidence and the applied company", async () => {
  const { context } = await fromCatalog();
  const user = userEvent.setup();
  const sends = mount(context);
  await resolveInitial(sends);
  const { status } = await conclusion();
  await user.type(screen.getByRole("textbox", { name: "Custom listing symbol" }), "AAPL,MSFT");
  await user.click(screen.getByRole("button", { name: "Apply symbol" }));
  expect(screen.getByRole("textbox", { name: "Custom listing symbol" })).toHaveAccessibleDescription(/1–50 characters/);
  expect(status).toHaveTextContent("Evidence available");
  const filing = setField("Filing bounds", "Page", "100");
  filing.apply();
  expect(within(filing.bounds).getByLabelText("Page")).toHaveAccessibleDescription(/0–99/);
  const transcript = setField("Transcript period", "Quarter", "5");
  transcript.apply();
  expect(within(transcript.bounds).getByLabelText("Quarter")).toHaveAccessibleDescription(/1–4/);
  const news = setField("News bounds", "Limit", "51");
  news.apply();
  expect(within(news.bounds).getByLabelText("Limit")).toHaveAccessibleDescription(/1–50/);
  expect(sends).toHaveLength(4);
  expect(status).toHaveTextContent("1 of 4");
  act(() => useBackendConnectorStore.setState({ apiSources: [] }));
  expect(await screen.findByRole("alert")).toHaveTextContent("declaration or source is unavailable");
  expect(screen.queryByRole("region", { name: "Conclusion" })).not.toBeInTheDocument();
});

it("requires a reset before acquiring malformed saved choices", async () => {
  const { context } = await fromCatalog();
  const sends = mount({ ...context, widget: {
    ...context.widget, storage: { eventsDocuments: { version: 2 } },
  } });
  expect(await screen.findByRole("alert")).toHaveTextContent("saved Events and Documents choices are invalid");
  expect(sends).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Reset to catalog choices" }));
  await waitFor(() => expect(sends.map(({ slot }) => slot)).toEqual(slots));
  expect(sends[2].url.searchParams.get("year")).toBe("2025");
  expect(sends[2].url.searchParams.get("quarter")).toBe("1");
});

const injected = { token: "discard-token", providerRows: [{ eps_actual: 123456 }],
  excerpt: "discard-excerpt", link: "https://discard.example", conclusion: "discard-conclusion" };
const choices = {
  version: 1, symbol: "MSFT",
  calendar: { start_date: "2026-11-17", end_date: "2026-11-23" },
  filings: { start_date: "2026-11-01", end_date: "2026-11-21", page: 1, limit: 9 },
  transcript: { year: 2024, quarter: 2 },
  news: { start_date: "2026-11-15", end_date: "2026-11-20", page: 2, limit: 5 },
  charts: { eps: "point", revenue: "bar" },
};
const tainted = { ...choices, ...injected,
  transcript: { ...choices.transcript, ...injected }, charts: { ...choices.charts, ...injected } };
const geometry = { x: 5, y: 3, w: 30, h: 24 };
const storyId = "events_documents_story";
const orphanGroup = { id: "unbound", name: "Unbound", type: "param" as const,
  color: "blue", groupById: "view", value: injected as unknown as string };

function verifyProjection(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain("discard");
  expect(json).not.toContain("123456");
}

async function verifyRestoration(context: WidgetContextType) {
  const sends = mount(context);
  await waitFor(() => expect(sends.map(({ slot }) => slot)).toEqual(slots));
  expect(sends.map(({ url }) => Object.fromEntries(url.searchParams))).toEqual([
    { ...choices.calendar, provider: "fmp" },
    { ...choices.filings, page: "1", limit: "9", symbol: "MSFT", provider: "fmp" },
    { year: "2024", quarter: "2", symbol: "MSFT", provider: "fmp" },
    { ...choices.news, page: "2", limit: "5", symbol: "MSFT", provider: "fmp" },
  ]);
  expect(screen.getByRole("combobox", { name: "EPS chart display" })).toHaveValue("point");
  expect(screen.getByRole("combobox", { name: "Revenue chart display" })).toHaveValue("bar");
  await act(async () => {
    sends[0].resolve(response(sends[0], calendarRows));
    sends[1].resolve(response(sends[1], [
      { symbol: "MSFT", filing_date: "2026-11-18", report_type: "10-Q", content_status: "metadata_only" },
    ]));
    sends[2].resolve(response(sends[2], [
      { symbol: "MSFT", year: 2024, quarter: "Q2", date: "2024-07-31", content: "Fresh call", content_status: "completeness_unknown" },
    ]));
    sends[3].resolve(response(sends[3], [
      { symbol: "MSFT", date: "2026-11-19T09:00:00Z", title: "Fresh headline", excerpt: "Fresh excerpt", content_status: "partial" },
    ]));
  });
  const { region, status } = await conclusion();
  expect(status).toHaveTextContent("Evidence available");
  expect(region).toHaveTextContent("eps_actual · 5");
  expect(region).toHaveTextContent("2026-11-18 · 10-Q");
  expect(region).toHaveTextContent("2024-07-31 · Completeness unknown");
  expect(region).toHaveTextContent("Fresh headline");
  expect(sends).toHaveLength(4);
}

it("projects ordinary save and reopens four reads with restored choices and the export menu", async () => {
  const { context, dashboard, source } = await fromCatalog();
  const id = context.activeDashboardId!;
  const initial = useAppStore.getState().items;
  const widget = { ...context.widget, ...injected, storage: { eventsDocuments: tainted, ...injected } };
  const data = { ...dashboard.data!, ...injected, widgets: [widget], groups: [orphanGroup], gridLayout: {
    [widget.innerTab!]: [{ ...geometry, i: widget.id, ...injected }, { ...geometry, i: "orphan", ...injected }],
  } };
  useAppStore.setState({ items: { ...initial, [id]: { ...dashboard, ...injected, data } }, itemsStoredInCloud: {} });
  const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} });
  vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} });
  await saveDashboards();
  expect(post).toHaveBeenCalledOnce();
  expect(post.mock.calls[0][0]).toBe("/pro/dash/sync");
  const wire = JSON.parse(JSON.stringify(post.mock.calls[0][1])).items;
  verifyProjection(wire[id]);
  expect(wire[id].data.widgets[0].storage).toEqual({ eventsDocuments: choices });
  expect(wire[id].data.gridLayout[widget.innerTab!]).toEqual([{ i: widget.id, ...geometry }]);

  useAuthStore.setState({ user: null });
  useAppStore.setState({ items: {}, itemsStoredInCloud: {} });
  useBackendConnectorStore.setState({ apiSources: [] });
  useAuthStore.setState({ user: { uuid: "analyst", token: "fresh-synthetic" } } as never);
  useBackendConnectorStore.setState({ apiSources: [structuredClone(source)] });
  useAppStore.getState().updateRemoteItems(Object.fromEntries(Object.entries(wire).map(([key, content]) =>
    [key, { content, is_shared: false, created_by: "analyst" }])) as never);
  const reopened = useAppStore.getState().items[id].data?.widgets?.[0] as WidgetContextType["widget"];
  await verifyRestoration({ ...context, widget: reopened, widgetFromJSON: reopened, widgetRef: { current: reopened } });

  render(<MemoryRouter><DropdownMenu.Root open modal={false}><DropdownMenu.Content>
    <DashboardPopup item={{ index: id, data: { name: data.name } }} depth={0} deleteItem={vi.fn()} />
  </DropdownMenu.Content></DropdownMenu.Root></MemoryRouter>);
  fireEvent.click(screen.getByRole("menuitem", { name: "Export apps.json" }));
  expect(useTemplateExportStore.getState().dashboardId).toBe(id);
  useTemplateExportStore.getState().setDashboardId(null);
  act(() => useBackendConnectorStore.setState({ apiSources: [] }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Export apps.json" }));
  expect(useTemplateExportStore.getState().dashboardId).toBeNull();
});

it("projects export and imported layouts, rebinds the installed source and requires resetting invalid choices", async () => {
  const { context, dashboard, source } = await fromCatalog();
  const widget = { ...context.widget, ...injected, storage: { eventsDocuments: tainted, ...injected } };
  const dashboardData = { ...dashboard.data!, ...injected, widgets: [widget], groups: [orphanGroup],
    gridLayout: { overview: [{ i: widget.id, ...geometry, ...injected }, { i: "orphan", ...geometry, ...injected }] },
  };
  const template = formatDashboardDataForTemplate(dashboardData,
  { name: "Saved Events", description: "Restored configuration", imageUrl: "", prompts: [] },
  { getAppWidget: () => undefined, getSourceById: () => source });
  verifyProjection(template);
  expect(template.tabs.overview.layout[0]).toEqual({
    i: storyId, ...geometry, groups: [], state: { storage: { eventsDocuments: choices } },
  });
  expect(template.tabs.overview.layout).toHaveLength(1);
  const contaminated = (eventsDocuments: unknown) => ({
    ...template, ...injected, groups: [{ ...orphanGroup, defaultValue: injected }],
    tabs: { overview: { ...template.tabs.overview, ...injected, layout: [{
      i: storyId, ...geometry, ...injected,
      groups: [orphanGroup.name],
      state: { ...injected, storage: { ...injected, eventsDocuments } },
    }] } },
  });
  const importedSource = { ...source, id: "current-installation" };
  useBackendConnectorStore.setState({ apiSources: [importedSource] });
  verifyProjection(backendTemplateSchema.parse(contaminated(tainted)));
  const invalidLayout = contaminated(tainted);
  invalidLayout.tabs.overview.layout[0].w = 0;
  expect(backendTemplateSchema.safeParse(invalidLayout).success).toBe(false);

  async function reopen(imported: ReturnType<typeof contaminated>) {
    const { items, addTab } = useAppStore.getState();
    const id = await createCustomTemplateTab({
      items, addTab, source: importedSource, template: imported as unknown as BackendTemplate, dashboardBehavior: "new",
    });
    const current = useAppStore.getState().items[id!].data?.widgets?.[0] as WidgetContextType["widget"];
    expect(current.sourceId).toBe(importedSource.id);
    verifyProjection(current.storage);
    return { ...context, activeDashboardId: id, widget: current, widgetRef: { current }, widgetFromJSON: current };
  }
  await verifyRestoration(await reopen(contaminated(tainted)));
  cleanup();
  const sends = mount(await reopen(contaminated({ ...tainted, transcript: { quarter: 5, ...injected } })));
  expect(await screen.findByRole("alert")).toHaveTextContent("saved Events and Documents choices are invalid");
  expect(sends).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Reset to catalog choices" }));
  await waitFor(() => expect(sends.map(({ slot }) => slot)).toEqual(slots));
});

it("preserves mixed dashboard layout, navigation and groups bound to ordinary widgets", async () => {
  const { context, dashboard, source } = await fromCatalog();
  const id = context.activeDashboardId!;
  const tab = "research";
  const story = { ...context.widget, innerTab: tab, paramGroups: { view: orphanGroup.id } };
  const other = {
    ...context.widget, id: "ordinary", innerTab: tab, name: "Desk notes",
    widgetId: "markdown" as const, type: "markdown" as const,
    paramGroups: { view: "linked" }, storage: { text: "Ordinary widget notes" },
    params: [],
  };
  const navigation = {
    ...other, id: "navigation", widgetId: "navigation_bar" as const,
    storage: { tabs: [{ id: tab, name: "Research view", ...injected }], ...injected },
  };
  const group = { ...orphanGroup, id: "linked", name: "View", value: "Daily" };
  const otherLayout = { i: other.id, ...geometry, x: 0, static: true };
  const data = { ...dashboard.data!, ...injected, widgets: [story, other, navigation],
    groups: [group, orphanGroup, { ...orphanGroup, id: "unreferenced" }],
    currentTab: tab, gridLayout: { [tab]: [
      { i: story.id, ...geometry, ...injected }, otherLayout, { i: "orphan", ...geometry, ...injected },
    ] },
  };
  const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} });
  await postDashboards({ [id]: { ...dashboard, ...injected, data } });
  const sent = post.mock.calls.findLast(([url, body]) =>
    url === "/pro/dash/sync" && Boolean((body as { items?: Record<string, unknown> })?.items?.[id]),
  );
  expect(sent).toBeDefined();
  const persisted = JSON.parse(JSON.stringify(sent![1])).items[id].data;
  verifyProjection(persisted);
  expect(persisted).toMatchObject({ currentTab: tab, groups: [group] });
  expect(persisted.gridLayout[tab]).toEqual([{ i: story.id, ...geometry }, otherLayout]);
  expect(persisted.widgets[1]).toEqual(other);
  expect(persisted.widgets[2].storage).toEqual({ tabs: [{ id: tab, name: "Research view" }] });

  const template = formatDashboardDataForTemplate(
    data, { name: "Mixed", description: "Saved view", imageUrl: "", prompts: [] },
    { getAppWidget: () => undefined, getSourceById: () => source },
  );
  verifyProjection(template);
  expect(template.groups).toEqual([{ name: "View", paramName: "view", type: "param", defaultValue: "Daily" }]);
  expect(template.tabs[tab].name).toBe("Research view");
  expect(template.tabs[tab].layout).toMatchObject([
    { i: storyId, groups: [] },
    { i: "markdown", groups: ["View"], state: { storage: { text: "Ordinary widget notes" } } },
  ]);
  const imported = backendTemplateSchema.parse({
    ...template,
    groups: [
      { ...orphanGroup, defaultValue: injected, widgetIds: [storyId] },
      { ...template.groups?.[0], widgetIds: ["markdown"] },
      { ...orphanGroup, name: "Unreferenced", defaultValue: injected },
    ],
    tabs: { [tab]: { ...template.tabs[tab], layout: template.tabs[tab].layout.map((layout) => ({
      ...layout, groups: undefined,
    })) } },
  });
  verifyProjection(imported);
  expect(imported.groups?.map(({ name }) => name)).toEqual(["View"]);
  expect(imported.tabs[tab].layout.map(({ groups }) => groups)).toEqual([[], ["View"]]);
});
