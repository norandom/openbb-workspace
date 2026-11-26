import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { getWidgetComponent, isAgGridWidget } from "~/components/Widgets";
import { isEndpointlessNativeWidget } from "~/lib/utils/backendValidation/nativeWidget";
import { validateObject, validateSource } from "~/lib/utils/validateBackend";
import { createStoryState } from "~/lib/modeling/storyState";
import { specificationSchema } from "~/utils/zodForms";

const fixture = process.env.QOPENBB_STORY_CATALOG_FIXTURE;
const catalog = fixture ? JSON.parse(readFileSync(fixture, "utf8")).catalog : {
  widget: {
    widgetId: "research_story",
    type: "research_story",
    name: "Commodities versus Technology",
    description: "Compare proxy price returns, realized volatility and the change in real yields.",
    category: "Research",
    gridData: { w: 40, h: 24 },
    params: [],
  },
  view_order: ["question", "returns", "risk", "real_yields", "conclusion"],
  default_state: createStoryState(),
};
const native = catalog.widget;
const app = {
  name: native.name,
  description: native.description,
  tabs: {
    Research: {
      id: "Research",
      name: "Research",
      layout: [{
        ...native.gridData,
        i: native.widgetId, x: 0, y: 0,
        view_order: catalog.view_order,
        state: { storage: { researchStory: catalog.default_state } },
      }],
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

it("admits the catalog App through the connector and dispatcher", async () => {
  const fetch = vi.fn(async (url) => new Response(JSON.stringify(
    String(url).endsWith("widgets.json") ? { research_story: native } : [app],
  )));
  vi.stubGlobal("fetch", fetch);
  const result = await validateSource({
    name: "Research", id: "research", url: "https://backend.test", endpointHeaders: [],
  }, { agents: false, validateAllWidgets: true });

  expect(result.errorMessage).toBeNull();
  expect(result.templateErrorMessage).toBeNull();
  expect(result.widgets.research_story).toEqual(native);
  expect(result.templates).toEqual([app]);
  expect(isEndpointlessNativeWidget(native)).toBe(true);
  expect(fetch.mock.calls.map(([url]) => String(url))).not.toContain("https://backend.test/undefined");
  expect(getWidgetComponent("research_story")).toBeDefined();
  expect(isAgGridWidget("research_story")).toBe(false);
});

it("rejects story aliases, alternate renderers and request-bearing declarations", () => {
  for (const [key, declaration] of [
    ["alias", native],
    ["research_story", { ...native, widgetId: "alias" }],
    ["research_story", { ...native, type: "table", endpoint: "/table" }],
    ["research_story", { ...native, endpoint: "/forged" }],
    ["research_story", { ...native, wsEndpoint: "/forged" }],
    ["research_story", { ...native, defaultViz: "table" }],
    ["research_story", { ...native, params: [{ type: "text", paramName: "symbol" }] }],
    ["research_story", { ...native, params: undefined }],
    ["research_story", { ...native, params: null }],
    ["research_story", { ...native, gridData: undefined }],
    ["research_story", { ...native, gridData: { ...native.gridData, minW: 1 } }],
    ["research_story", { ...native, storage: { researchStory: catalog.default_state } }],
    ["research_story", { ...native, financialContract: { source: "forged" } }],
    ["research_story", { ...native, runButton: true }],
    ["research_story", { ...native, sdkFunc: "forged" }],
  ]) {
    const widgets = { [key]: declaration };
    expect(specificationSchema.safeParse(widgets).success).toBe(false);
    expect(validateObject(structuredClone(widgets))).not.toBeNull();
  }
});
