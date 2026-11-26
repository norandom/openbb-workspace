import { describe, expect, it, vi } from "vitest";
import { backendTemplateSchema } from "../types/app/templates";
import { createCustomTemplateTab } from "../utils/createTemplates";
import { documentDashboardState } from "../utils/documentDashboardState";
import { formatDashboardDataForTemplate } from "../utils/exportTemplate";
import {
  createStoryState,
  decodeStoryState,
  encodeStoryState,
  encodeStoryStorage,
} from "./storyState";

vi.mock("../utils/widgetParams", async (original) => ({
  ...(await original<typeof import("../utils/widgetParams")>()),
  createParamDefs: () => [],
}));
vi.mock("~/components/DataConnectors/common/helpers", () => ({
  getParamsOrder: () => [],
  updateParamOrder: (_: unknown, params: unknown) => params,
}));
vi.mock("~/components/General/Table/Chart/utils", () => ({
  getSeriesType: () => "line",
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "table",
  getStateStorage: (widget: { storage: unknown }) => widget.storage,
}));

const defaultCharts = {
  returns: {
    input: {
      chart_type: "line",
      series: ["left_close", "right_close"],
      x_axis: "date",
      y_axis: "price_usd",
    },
    result: {
      chart_type: "bar",
      series: ["left_momentum", "right_momentum"],
      x_axis: "proxy",
      y_axis: "percent",
    },
  },
  risk: {
    input: {
      chart_type: "line",
      series: ["left_daily_return", "right_daily_return"],
      x_axis: "date",
      y_axis: "percent",
    },
    result: {
      chart_type: "bar",
      series: ["left_volatility", "right_volatility"],
      x_axis: "proxy",
      y_axis: "percent",
    },
  },
  real_yields: {
    input: {
      chart_type: "line",
      series: ["dfii10"],
      x_axis: "date",
      y_axis: "percent",
    },
    result: {
      chart_type: "bar",
      series: ["change"],
      x_axis: "window",
      y_axis: "percentage_points",
    },
  },
};
const defaults = {
  version: 1,
  selection: {
    commodity_symbol: "DBC",
    technology_symbol: "XLK",
    observation_date: "2026-11-13",
  },
  schedule: null,
  cutoff: null,
  run_refs: { comparison: null, regime: null },
  charts: defaultCharts,
};
const saved = {
  ...defaults,
  selection: {
    commodity_symbol: "DBC",
    technology_symbol: "XLK",
    observation_date: "2024-04-03",
  },
  schedule: {
    calendar_id: "NYSE_ARCA",
    schedule_revision: "synthetic-nyse-arca.2024r1",
  },
  cutoff: {
    observation_date: "2024-04-03",
    decision_at: "2024-04-04T03:59:59.999999Z",
    evaluated_at: "2024-05-03T16:00:00Z",
    session_timezone: "America/New_York",
  },
  run_refs: {
    comparison: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    regime: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  charts: {
    ...defaultCharts,
    returns: {
      input: {
        ...defaultCharts.returns.input,
        chart_type: "bar",
        series: ["right_close"],
      },
      result: {
        ...defaultCharts.returns.result,
        chart_type: "line",
        series: ["right_momentum"],
      },
    },
  },
};
const expectedState = { storage: { researchStory: saved } };
const dirty = {
  ...saved,
  selection: { ...saved.selection, bearer_token: "synthetic-secret" },
  schedule: { ...saved.schedule, endpoint: "synthetic-secret" },
  cutoff: { ...saved.cutoff, provenance: "synthetic-secret" },
  run_refs: { ...saved.run_refs, response: "synthetic-secret" },
  charts: {
    ...saved.charts,
    returns: {
      ...saved.charts.returns,
      input: { ...saved.charts.returns.input, rows: ["synthetic-secret"] },
    },
  },
  generated_narrative: "synthetic-secret",
};

function dashboard() {
  return {
    widgets: [
      {
        id: "story",
        widgetId: "research_story",
        type: "research_story",
        name: "synthetic-secret",
        description: "synthetic-secret",
        sourceName: "synthetic-secret",
        endpoint: { headers: { Authorization: "synthetic-secret" } },
        params: [{ paramName: "secret", value: "synthetic-secret" }],
        data: { rows: ["synthetic-secret"] },
        storage: { researchStory: dirty, text: "synthetic-secret" },
      },
    ],
    groups: [],
    gridLayout: { overview: [{ i: "story", x: 0, y: 0, w: 40, h: 24 }] },
  } as unknown as Parameters<typeof formatDashboardDataForTemplate>[0];
}

function exportTemplate(data = dashboard()) {
  return formatDashboardDataForTemplate(
    data,
    {
      name: "Research",
      description: "Analysis",
      imageUrl: "",
      prompts: [],
    },
    { getAppWidget: () => undefined, getSourceById: () => undefined },
  );
}

describe("research story persisted configuration", () => {
  it("matches the catalog defaults and reconstructs the frozen allowlist at every depth", () => {
    expect(createStoryState()).toEqual(defaults);
    expect(encodeStoryStorage(dirty)).toEqual(expectedState.storage);
    expect(JSON.stringify(encodeStoryState(dirty))).not.toContain(
      "synthetic-secret",
    );
  });

  it("validates role choices, date, chart choices and saved run bindings", () => {
    const chart = saved.charts.returns.input;
    const invalid = [
      { ...saved, version: 2 },
      { ...saved, selection: { ...saved.selection, commodity_symbol: "XLK" } },
      {
        ...saved,
        selection: { ...saved.selection, observation_date: "2024-02-30" },
      },
      { ...saved, cutoff: { ...saved.cutoff, observation_date: "2024-04-04" } },
      {
        ...saved,
        cutoff: { ...saved.cutoff, decision_at: "2024-04-04T25:00:00Z" },
      },
      {
        ...saved,
        run_refs: { ...saved.run_refs, comparison: "synthetic-secret" },
      },
      {
        ...saved,
        schedule: { ...saved.schedule, schedule_revision: "invalid/revision" },
      },
      { ...saved, schedule: null },
      { ...saved, schedule: null, cutoff: null },
      ...[
        { chart_type: "scatter" },
        { series: ["left_close", "left_close"] },
        { series: ["left_daily_return"] },
        { series: [] },
        { x_axis: "proxy" },
        { y_axis: "percent" },
      ].map((patch) => ({
        ...saved,
        charts: {
          ...saved.charts,
          returns: { ...saved.charts.returns, input: { ...chart, ...patch } },
        },
      })),
    ];
    for (const state of invalid) {
      expect(decodeStoryState(state)).toBeNull();
      expect(() => encodeStoryState(state)).toThrow();
    }
  });

  it("projects native writes and exports, then hydrates the exported settings", async () => {
    const data = dashboard();
    Object.assign(data.gridLayout.overview[0], {
      providerRows: ["synthetic-secret"],
      responseText: "synthetic-secret",
      headers: { Authorization: "synthetic-secret" },
    });
    const native = documentDashboardState({
      story: { data },
      removed: "DELETE",
    });
    expect(native.story.data.widgets[0].storage).toEqual(expectedState.storage);
    expect(native.removed).toBe("DELETE");
    expect(JSON.stringify(native)).not.toContain("synthetic-secret");

    const bytes = JSON.stringify(exportTemplate(data));
    expect(bytes).not.toContain("synthetic-secret");
    const layout = JSON.parse(bytes).tabs.overview.layout[0];
    expect(layout.i).toBe("research_story");
    expect(layout.state).toEqual(expectedState);
    expect(decodeStoryState(layout.state.storage.researchStory)).toEqual(saved);
    const addTab =
      vi.fn<Parameters<typeof createCustomTemplateTab>[0]["addTab"]>();
    await createCustomTemplateTab({
      addTab,
      items: {},
      source: { id: "story-catalog" } as Parameters<
        typeof createCustomTemplateTab
      >[0]["source"],
      template: {
        ...JSON.parse(bytes),
        tabs: {
          overview: {
            id: "overview",
            name: "overview",
            layout: [
              {
                ...layout,
                providerRows: ["synthetic-secret"],
                responseText: "synthetic-secret",
                headers: { Authorization: "synthetic-secret" },
                minH: 9,
                state: {
                  storage: { researchStory: dirty, text: "synthetic-secret" },
                },
              },
            ],
          },
        },
      },
      resolveWidget: () =>
        ({
          widgetId: "research_story",
          type: "research_story",
          name: "Research Story",
          params: [],
          gridData: { w: 40, h: 24 },
        }) as unknown as (typeof data.widgets)[number],
    });
    const hydrated = addTab.mock.calls[0][0].data.widgets[0];
    expect(decodeStoryState(hydrated.storage.researchStory)).toEqual(saved);
    expect(hydrated.storage.researchStory).toEqual(saved);
    const hydratedData = addTab.mock.calls[0][0].data;
    expect(hydratedData.gridLayout.overview[0]).toMatchObject({
      x: 0, y: 0, w: 40, h: 24, minH: 9,
    });
    expect(JSON.stringify(hydratedData)).not.toContain("synthetic-secret");
  });

  it("rejects invalid allowed values at native write, export and template import", () => {
    const data = dashboard();
    data.widgets[0].storage.researchStory = {
      ...saved,
      run_refs: { ...saved.run_refs, comparison: "synthetic-secret" },
    };
    expect(() => documentDashboardState({ item: { data } })).toThrow(
      "Invalid research story configuration.",
    );
    expect(() => exportTemplate(data)).toThrow(
      "Invalid research story configuration.",
    );

    const template = exportTemplate();
    const layout = template.tabs.overview.layout[0];
    const invalid = {
      ...template,
      tabs: {
        overview: {
          ...template.tabs.overview,
          layout: [
            {
              ...layout,
              state: {
                storage: {
                  researchStory: data.widgets[0].storage.researchStory,
                },
              },
            },
          ],
        },
      },
    };
    expect(backendTemplateSchema.safeParse(invalid).success).toBe(false);
  });

  it("preserves legacy template and dashboard widget state", () => {
    const data = dashboard();
    const legacy = {
      id: "story",
      widgetId: "legacy",
      type: "text",
      storage: { text: "legacy note" },
    } as unknown as (typeof data.widgets)[number];
    data.widgets = [legacy];
    expect(
      documentDashboardState({ item: { data } }).item.data.widgets[0],
    ).toBe(legacy);
    expect(exportTemplate(data).tabs.overview.layout[0].state?.storage).toEqual(
      {
        text: "legacy note",
      },
    );
  });
});
