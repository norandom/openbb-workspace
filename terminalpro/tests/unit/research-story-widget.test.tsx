import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildWidgetSourceResolver } from "~/components/AI/appArtifactUtils";
import { getWidgetComponent } from "~/components/Widgets";
import { useBackendConnectorStore } from "~/lib/state/backendConnector";
import { filterRejectedStoryCatalog } from "~/lib/utils/backendValidation/nativeWidget";
import { documentDashboardState } from "~/lib/utils/documentDashboardState";
import { formatDashboardDataForTemplate } from "~/lib/utils/exportTemplate";
import { processWorkerResults } from "~/lib/utils/backendValidation/worker";
import { createStoryState } from "~/lib/modeling/storyState";

const { context, transport } = vi.hoisted(() => ({
  context: { widget: {} as any, updateWidget: vi.fn(), isShared: false },
  transport: vi.fn(),
}));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => context }));
vi.mock("~/components/DraggableCard", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("~/lib/state/auth", () => {
  const auth = { user: { uuid: "author", token: "test-token" } };
  return { useAuthStore: Object.assign((select: any) => select(auth), { getState: () => auth }) };
});

function mount(saved = createStoryState(), fromCache: Record<string, unknown> = {}) {
  context.widget = {
    id: "story-1", widgetId: "research_story", type: "research_story",
    name: "Commodities versus Technology", params: [],
    storage: { researchStory: saved, responseText: "invalid extra state" },
    ...fromCache,
  };
  const ResearchStory = getWidgetComponent("research_story");
  render(<Suspense fallback="Loading">{ResearchStory && <ResearchStory />}</Suspense>);
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  transport.mockReset().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", transport);
  context.updateWidget.mockClear();
  useBackendConnectorStore.setState({ apiSources: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("evaluates catalog defaults and keeps selection controls focused during pending results", async () => {
  let finishInitial!: (response: Response) => void;
  transport.mockImplementationOnce(() => new Promise<Response>((resolve) => {
    finishInitial = resolve;
  }));
  mount();
  const date = await screen.findByLabelText("Observation date") as HTMLInputElement;
  expect(date.value).toBe("2026-11-13");
  expect(screen.getByRole("combobox", { name: "Commodity proxy" })).toHaveTextContent("DBC");
  expect(screen.getByRole("combobox", { name: "Technology proxy" })).toHaveTextContent("XLK");
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  act(() => date.focus());
  fireEvent.change(date, { target: { value: "2026-11-12" } });
  expect(date).toHaveFocus();
  expect(screen.getAllByRole("status").some((item) => item.textContent?.includes("pending"))).toBe(true);
  await waitFor(() => expect(context.updateWidget).toHaveBeenCalled());
  const [update, force] = context.updateWidget.mock.lastCall!;
  const saved = update(context.widget);
  expect(force).toBe(true);
  expect(saved.storage).toEqual({ researchStory: expect.objectContaining({
    selection: { commodity_symbol: "DBC", technology_symbol: "XLK", observation_date: "2026-11-12" },
    run_refs: { comparison: null, regime: null },
  }) });
  expect(transport).toHaveBeenCalledTimes(1);
  finishInitial(new Response("{}", { status: 503 }));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  expect(new Headers(transport.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer test-token");
  expect(JSON.parse(transport.mock.calls[1][1].body).acquisition.cutoff.observation_date).toBe("2026-11-12");
  expect(date).toHaveFocus();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("restores a bound dashboard with authenticated reads and no fresh evaluation", async () => {
  const saved = createStoryState();
  saved.selection = { commodity_symbol: "GLD", technology_symbol: "VGT", observation_date: "2024-04-03" };
  saved.schedule = { calendar_id: "NYSE_ARCA", schedule_revision: "old-revision" };
  saved.cutoff = {
    observation_date: "2024-04-03", decision_at: "2024-04-04T03:59:59.999999Z",
    evaluated_at: "2024-05-03T16:00:00Z", session_timezone: "America/New_York",
  };
  saved.run_refs.comparison = "a".repeat(32);
  mount(saved);
  expect(await screen.findByLabelText("Observation date")).toHaveValue("2024-04-03");
  expect(screen.getByRole("combobox", { name: "Commodity proxy" })).toHaveTextContent("GLD");
  expect(screen.getByRole("combobox", { name: "Technology proxy" })).toHaveTextContent("VGT");
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  expect(transport.mock.calls[0][0]).toContain(saved.run_refs.comparison);
  expect(transport.mock.calls[0][1].method).toBe("GET");
  expect(context.updateWidget).not.toHaveBeenCalled();
});

it.each(["worker", "store"])("blocks a rejected cached declaration from the %s fallback", async (fallback) => {
  const rawWidget = {
    widgetId: "research_story", type: "research_story",
    name: "Commodities versus Technology", category: "Research",
    description: "Compare proxy price returns, realized volatility and the change in real yields.",
    gridData: { w: 40, h: 24 }, params: [],
    financialContract: { source: "unvalidated" },
  };
  const cache = { research_story: rawWidget };
  const source = {
    id: "vendor-story",
    name: "Research",
    url: "https://vendor.test",
    status: "error",
    vendorApp: { widgetsJsonCache: cache, appsJsonCache: [] },
  } as any;
  const effectiveSource = fallback === "worker"
    ? processWorkerResults([{ source, result: { errorMessage: "Rejected catalog" } as any }]).apiSources[0]
    : useBackendConnectorStore.getState().addApiSource(source);
  useBackendConnectorStore.setState({ apiSources: [effectiveSource] });
  expect(filterRejectedStoryCatalog(effectiveSource).widgets).not.toHaveProperty("research_story");
  mount(createStoryState(), { ...effectiveSource.widgets.research_story, sourceId: source.id });
  expect(await screen.findByRole("alert")).toHaveTextContent("declaration is invalid");
  expect(transport).not.toHaveBeenCalled();
  const getSourceById = useBackendConnectorStore.getState().getApiSourceById;
  const data = {
    name: "Research",
    widgets: [context.widget], groups: [],
    gridLayout: { Research: [{ i: "story-1", ...rawWidget.gridData, x: 0, y: 0 }] },
  };
  expect(() => documentDashboardState({ item: { data } }, getSourceById)).toThrow(
    "Cannot save an unvalidated research story declaration.",
  );
  expect(() => formatDashboardDataForTemplate(data, {
    name: "Research", description: "Analysis", imageUrl: "", prompts: [],
  }, { getSourceById, getAppWidget: () => undefined })).toThrow(
    "Cannot export an unvalidated research story declaration.",
  );
});

it.each([false, true])("rejects a story alias when vendor cache is present: %s", (withSource) => {
  const raw = {
    widgetId: "research_story", type: "research_story",
    name: "Commodities versus Technology", category: "Research",
    description: "Compare proxy price returns, realized volatility and the change in real yields.",
    gridData: { w: 40, h: 24 }, params: [],
  };
  const alias = { ...raw, widgetId: "story_alias" };
  if (withSource) {
    const ordinary = { name: "Prices", description: "Price history", endpoint: "/prices" };
    const cache = { research_story: raw, story_alias: alias, ordinary };
    const source = useBackendConnectorStore.getState().addApiSource({
      id: "mixed-vendor", name: "Research", url: "https://vendor.test", status: "error",
      vendorApp: { widgetsJsonCache: cache, appsJsonCache: [] },
    } as any);
    expect(Object.keys(filterRejectedStoryCatalog(source).widgets)).toEqual(["research_story", "ordinary"]);
    const resolve = buildWidgetSourceResolver(
      ["research_story", "story_alias", "ordinary"].map((widget_id) => ({ i: widget_id, widget_id, origin: source.name })),
      [source],
    );
    expect(resolve("research_story")?.id).toBe(source.id);
    expect(resolve("story_alias")).toBeUndefined();
    expect(resolve("ordinary")?.id).toBe(source.id);
  }
  const getSourceById = useBackendConnectorStore.getState().getApiSourceById;
  for (const identity of [alias, { ...raw, type: "table" }]) {
    const data = {
      name: "Research",
      widgets: [{
        ...identity, id: "alias-1",
        sourceId: withSource ? "mixed-vendor" : undefined,
        storage: { researchStory: createStoryState() },
      }],
      groups: [],
      gridLayout: { Research: [{ i: "alias-1", ...raw.gridData, x: 0, y: 0 }] },
    } as Parameters<typeof formatDashboardDataForTemplate>[0];
    expect(() => documentDashboardState({ item: { data } }, getSourceById)).toThrow(
      "Cannot save an unvalidated research story declaration.",
    );
    expect(() => formatDashboardDataForTemplate(data, {
      name: "Research", description: "Analysis", imageUrl: "", prompts: [],
    }, { getSourceById, getAppWidget: () => undefined })).toThrow(
      "Cannot export an unvalidated research story declaration.",
    );
  }
});
