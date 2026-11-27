import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import type { WidgetId } from "~/components/Widgets";
import fixture from "./events-documents-admission.fixture.json";
import type { BackendTemplate, Source } from "~/lib/state/backendConnector";
import {
  canUseEventsDocumentsStorySource,
  filterRejectedStoryCatalog,
  isEndpointlessNativeWidget,
} from "~/lib/utils/backendValidation/nativeWidget";
import { processWorkerResults, validateObject, validateSource } from "~/lib/utils/validateBackend";
import { specificationSchema, type WidgetsType } from "~/utils/zodForms";

const storyId = "events_documents_story";
const catalogPath = process.env.QOPENBB_EVENTS_WIDGETS;
const generated = catalogPath ? JSON.parse(readFileSync(catalogPath, "utf8")) : fixture;
const widgets = () => structuredClone(generated);
const base = {
  name: "Research", id: "research", url: "https://backend.test/data", endpointHeaders: [],
} satisfies Source;
const app: BackendTemplate = {
  name: "Events and Documents",
  description: "Inspect earnings and documents.",
  tabs: {
    research: {
      id: "research",
      name: "Research",
      layout: [{ i: storyId as WidgetId, x: 0, y: 0, w: 40, h: 24, groups: [] }],
    },
  },
};

const launchWidget = { widgetId: storyId, type: storyId, sourceId: base.id };

const bindings = [
  "equity_calendar_earnings_fmp_obb",
  "equity_fundamental_filings_fmp_obb",
  "equity_fundamental_transcript_fmp_obb",
  "news_company_fmp_obb",
];

function cached(widgetsJsonCache: WidgetsType): Source {
  return {
    ...base,
    status: "error",
    widgets: widgetsJsonCache,
    templates: [app],
    vendorApp: {
      uuid: "events-documents",
      name: app.name,
      vendorName: "QOpenBB",
      shortDescription: app.description,
      appsJsonUrl: `${base.url}/apps.json`,
      widgetsJsonUrl: `${base.url}/widgets.json`,
      widgetsJsonCache,
      appsJsonCache: [app],
      thumbnail: "",
      thumbnailDark: "",
      thumbnailLight: "",
      widgets: [],
      prompts: [],
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

it("admits the generated catalog in fresh and cached discovery without probing a native URL", async () => {
  const fetch = vi.fn(async (url: URL | string) => new Response(JSON.stringify(
    String(url).endsWith("widgets.json") ? widgets() :
      String(url).endsWith("apps.json") ? [app] : [],
  )));
  vi.stubGlobal("fetch", fetch);
  const fresh = await validateSource(base, { agents: false, validateAllWidgets: true });
  expect(fresh.errorMessage).toBeNull();
  expect(fresh.templates).toContainEqual(app);
  expect(fresh.widgets[storyId]).toEqual(generated[storyId]);
  expect(isEndpointlessNativeWidget(fresh.widgets[storyId])).toBe(true);
  const [connectedSource] = processWorkerResults([{ source: { ...base }, result: fresh }]).apiSources;
  expect(canUseEventsDocumentsStorySource(launchWidget, connectedSource)).toBe(true);
  expect(canUseEventsDocumentsStorySource(launchWidget, { ...connectedSource, status: "rehydrated" })).toBe(false);
  expect(canUseEventsDocumentsStorySource({ ...launchWidget, endpoint: "/forged" }, connectedSource)).toBe(false);
  expect(fetch.mock.calls.some(([url]) => String(url).includes("undefined"))).toBe(false);

  fetch.mockClear();
  const source = cached(widgets());
  const result = await validateSource(source, { vendorAppCache: true });
  expect(result.errorMessage).toBeNull();
  expect(result.widgets[storyId]).toEqual(generated[storyId]);
  expect(filterRejectedStoryCatalog(source).widgets?.[storyId]).toEqual(generated[storyId]);
  expect(canUseEventsDocumentsStorySource(launchWidget, source)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects story aliases and request overrides while preserving existing research stories", () => {
  for (const [key, patch] of [
    ["alias", {}],
    [storyId, { widgetId: "alias" }],
    [storyId, { type: "table", endpoint: "/table" }],
    [storyId, { endpoint: "/forged" }],
    [storyId, { fileEndpoint: "" }],
    [storyId, { wsEndpoint: "/forged" }],
    [storyId, { defaultViz: "table" }],
    [storyId, { params: [{ paramName: "symbol" }] }],
    [storyId, { params: undefined }],
  ] as const) {
    const catalog = widgets();
    delete catalog[storyId];
    catalog[key] = { ...generated[storyId], ...patch };
    expect(specificationSchema.safeParse(catalog).success).toBe(false);
    expect(validateObject(catalog)).not.toBeNull();
  }

  const catalog = widgets();
  delete catalog[storyId];
  expect(validateObject(catalog)).toBeNull();
  expect(isEndpointlessNativeWidget(catalog.research_story)).toBe(true);
});

it.each(bindings)("rejects a missing or changed %s binding in discovery and the cached launch fallback", async (id) => {
  const widget = generated[id];
  for (const declaration of [
    undefined,
    { ...widget, widgetId: "different" },
    { ...widget, type: "metric" },
    { ...widget, type: undefined },
    { ...widget, endpoint: "https://other.test/data" },
    { ...widget, defaultViz: "iframe" },
    { ...widget, wsEndpoint: "/other" },
    { ...widget, source: ["FRED"] },
    { ...widget, data: { ...widget.data, financialQueryPolicy: { maxRequests: 2 } } },
    { ...widget, queryPolicy: { ...widget.queryPolicy, maxRequests: 2 } },
    { ...widget, financialContract: { ...widget.financialContract, providers: ["fred"] } },
  ]) {
    const catalog = widgets();
    if (declaration) catalog[id] = declaration;
    else delete catalog[id];

    expect(specificationSchema.safeParse(catalog).success).toBe(false);
    expect(validateObject(catalog)).toContain(storyId);
    const source = cached(catalog);
    const result = await validateSource(source, { vendorAppCache: true });
    expect(result.widgets[storyId]).toBeUndefined();
    expect(result.errorMessage).toContain(storyId);

    const launch = filterRejectedStoryCatalog(source);
    expect(launch.widgets?.[storyId]).toBeUndefined();
    expect(launch.templates).toEqual([]);
    expect(canUseEventsDocumentsStorySource(launchWidget, source)).toBe(false);
    expect(launch.widgets?.research_story).toEqual(generated.research_story);
    const [workerSource] = processWorkerResults([{ source, result }]).apiSources;
    expect(workerSource.widgets?.[storyId]).toBeUndefined();
  }
});

it("rejects a cached alias and rechecks the cache when active declarations still look valid", () => {
  const catalog = widgets();
  catalog.alias = catalog[storyId];
  delete catalog[storyId];

  const rejected = filterRejectedStoryCatalog(cached(catalog));
  expect(rejected.widgets?.alias).toBeUndefined();
  expect(rejected.widgets?.research_story).toEqual(generated.research_story);

  const stale = { ...cached(catalog), widgets: widgets() };
  expect(filterRejectedStoryCatalog(stale).widgets?.[storyId]).toBeUndefined();
  expect(canUseEventsDocumentsStorySource(launchWidget, stale)).toBe(false);
});

it("rejects invalid fresh declarations before probing any source endpoints", async () => {
  const catalog = widgets();
  delete catalog[bindings[0]];
  const fetch = vi.fn(async (url: URL | string) => new Response(JSON.stringify(
    String(url).endsWith("widgets.json") ? catalog : [app],
  )));
  vi.stubGlobal("fetch", fetch);

  const result = await validateSource(base, { agents: false, validateAllWidgets: true });
  expect(result.errorMessage).toContain(storyId);
  expect(result.widgets[storyId]).toBeUndefined();
  expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/v1/"))).toBe(false);
});

it.each([
  ["missing", undefined],
  ["empty", {}],
  ["foreign", { fred: {} }],
  ["mixed", { fmp: {}, fred: {} }],
] as const)("rejects %s financial variants in fresh discovery and cached fallback", async (_, variants) => {
  const catalog = widgets();
  const widget = catalog[bindings[0]];
  widget.financialContract.variants = variants;
  const fetch = vi.fn(async (url: URL | string) => new Response(JSON.stringify(
    String(url).endsWith("widgets.json") ? catalog : [app],
  )));
  vi.stubGlobal("fetch", fetch);

  const fresh = await validateSource(base, { agents: false, validateAllWidgets: true });
  expect(fresh.errorMessage).toContain(storyId);
  expect(fresh.widgets[storyId]).toBeUndefined();
  expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/v1/"))).toBe(false);

  const source = cached(catalog);
  expect(specificationSchema.safeParse(catalog).success).toBe(false);
  const result = await validateSource(source, { vendorAppCache: true });
  expect(result.errorMessage).toContain(storyId);
  expect(result.widgets[storyId]).toBeUndefined();
  expect(filterRejectedStoryCatalog(source).widgets?.[storyId]).toBeUndefined();
  expect(canUseEventsDocumentsStorySource(launchWidget, source)).toBe(false);
});
