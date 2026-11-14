import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/utils/widgetParams", () => ({ createParamDefs: () => [] }));
vi.mock("../../src/components/DataConnectors/common/helpers", () => ({
  getParamsOrder: () => [],
}));
vi.mock("../../src/components/General/Table/Chart/utils", () => ({
  getSeriesType: () => "line",
}));
vi.mock("../../src/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateStorage: (w: any) => w.storage,
}));
import { formatDashboardDataForTemplate } from "../../src/lib/utils/exportTemplate";
const sourceKey = JSON.stringify(["fmp", "https://example.test/data"]);
const identity = {
  provider: "fmp",
  sourceKey,
  symbol: "AAPL",
  name: "Apple",
  exchange: "NASDAQ",
  exchangeShortName: "NASDAQ",
  currency: "USD",
  listingId: null,
  issuerId: null,
};
const selection = {
  ...identity,
  version: 1,
  selectedAt: "2026-11-14T12:00:00Z",
  retrievedAt: null,
};
const research = {
  version: 1,
  period: "quarter",
  limit: 5,
  peers: [
    { identity: { ...identity, symbol: "MSFT" }, rationale: "Comparable" },
    { identity, rationale: "Primary comparator" },
  ],
};
const ports = { getAppWidget: () => undefined, getSourceById: () => undefined };
function fixture(storage: any = {}) {
  return {
    widgets: [
      {
        id: "uuid",
        widgetId: "income",
        params: [
          { paramName: "symbol", value: "AAPL" },
          { paramName: "period", value: "annual" },
          { paramName: "start_date", value: "" },
        ],
        storage: {
          params: { symbol: "AAPL", period: "annual", start_date: "2025-01-01" },
          text: "Notes",
          ...storage,
        },
        data: {
          table: {
            filterModel: { value: { type: "greaterThan", filter: 0 } },
            columnState: {
              table: { pagination: {}, version: 1, columnOrder: ["value"] },
            },
          },
        },
        groupId: "g",
      },
    ],
    groups: [{ id: "g", name: "Company", type: "ticker", value: { symbol: "AAPL" } }],
    gridLayout: { overview: [{ i: "uuid", x: 0, y: 1, w: 6, h: 8 }] },
  } as any;
}
const metadata = {
  name: "Research",
  description: "Analysis",
  imageUrl: "",
  prompts: [{ value: "  Compare  " }],
};
const serialize = (dashboard: any) =>
  JSON.parse(
    JSON.stringify(formatDashboardDataForTemplate(dashboard, metadata, ports as any)),
  );
describe("configuration-only research template export", () => {
  it("roundtrips validated identity, explicit default params, dates, ordered peers, layout and groups", () => {
    const result = serialize(
      fixture({
        companySelection: selection,
        companyResearch: research,
        providerPayload: { secret: "payload-secret" },
        token: "auth-secret",
      }),
    );
    const layout = result.tabs.overview.layout[0];
    expect(layout).toMatchObject({
      i: "income",
      x: 0,
      y: 1,
      w: 6,
      h: 8,
      groups: ["Company"],
      state: {
        params: { symbol: "AAPL", period: "annual", start_date: "2025-01-01" },
        storage: {
          companySelection: selection,
          companyResearch: research,
          text: "Notes",
        },
      },
    });
    expect(result.groups).toEqual([
      { name: "Company", type: "ticker", defaultValue: "AAPL" },
    ]);
    expect(result.prompts).toEqual(["Compare"]);
    expect(JSON.stringify(result)).not.toMatch(
      /payload-secret|auth-secret|providerPayload/,
    );
  });
  it("retains navigation names, minimized heights, endpoint bindings and chart controls", () => {
    const dashboard = fixture({
      chartView: { chartType: "line" },
      chartModel: {
        chartId: "omit",
        chartType: "line",
        cellRange: { columns: ["value"], rowStartIndex: 10 },
        chartOptions: {
          line: { title: { text: "History" } },
          bar: { title: { text: "Other" } },
        },
      },
      timezones: "UTC",
      chartNavigatorEnabled: true,
    });
    dashboard.widgets[0].isMinimized = true;
    dashboard.widgets[0].originalH = 12;
    dashboard.widgets[0].params.push({
      paramName: "period",
      type: "endpoint",
      groupById: "frequency",
    });
    dashboard.widgets[0].paramGroups = { frequency: "p" };
    dashboard.groups.push({
      id: "p",
      name: "Frequency",
      type: "endpointParam",
      groupById: "frequency",
      value: "annual",
    });
    dashboard.widgets.push({
      id: "nav",
      widgetId: "navigation_bar",
      storage: { tabs: [{ id: "overview", name: "Research overview" }] },
    });
    dashboard.gridLayout.overview.push({ i: "nav", x: 0, y: 0, w: 12, h: 1 });
    const result = serialize(dashboard);
    expect(result.tabs.overview.name).toBe("Research overview");
    expect(result.tabs.overview.layout).toHaveLength(1);
    expect(result.tabs.overview.layout[0]).toMatchObject({
      h: 12,
      minimized: true,
      groups: ["Company", "Frequency"],
      state: {
        chartView: { chartType: "line" },
        chartModel: {
          chartType: "line",
          cellRange: { columns: ["value"] },
          chartOptions: { line: { title: { text: "History" } } },
        },
        storage: { timezones: "UTC", chartNavigatorEnabled: true },
      },
    });
    expect(result.tabs.overview.layout[0].state.chartModel).not.toHaveProperty(
      "chartId",
    );
    expect(result.groups[1]).toEqual({
      name: "Frequency",
      type: "endpointParam",
      paramName: "period",
      defaultValue: "annual",
    });
  });
  it("refuses imported saved-symbol mismatches without rewriting saved configuration", () => {
    const dashboard = fixture({ companySelection: { ...selection, symbol: "MSFT" } });
    const before = JSON.stringify(dashboard);
    expect(() => serialize(dashboard)).toThrow(/Reselect the company/);
    expect(JSON.stringify(dashboard)).toBe(before);
  });
  it("uses effective widget defaults when storage does not repeat symbol and period", () => {
    const dashboard = fixture({ companySelection: selection });
    dashboard.widgets[0].storage.params = { start_date: "2025-01-01" };
    expect(serialize(dashboard).tabs.overview.layout[0].state.params).toEqual({
      symbol: "AAPL",
      period: "annual",
      start_date: "2025-01-01",
    });
  });
  it("keeps legacy allowlisted state and default omission unchanged", () => {
    const layout = serialize(fixture()).tabs.overview.layout[0];
    expect(layout.state.params).toEqual({ start_date: "2025-01-01" });
    expect(layout.state.storage).toEqual({ text: "Notes" });
    expect(layout.state.columnState.table).toEqual({ columnOrder: ["value"] });
    expect(layout.state.filterModel.value.filter).toBe(0);
  });
  it.each([
    "https://example.test/api-key/review-secret",
    "https://example.test/api%20key/review-secret",
    "https://user:review-secret@example.test/data",
    "https://example.test/data?token=review-secret",
  ])("refuses credential-bearing source identity %s without rebinding", (url) => {
    const unsafe = JSON.stringify(["fmp", url]);
    const result = serialize(
      fixture({
        companySelection: { ...selection, sourceKey: unsafe },
        companyResearch: {
          ...research,
          peers: [{ identity: { ...identity, sourceKey: unsafe }, rationale: "" }],
        },
      }),
    );
    const state = result.tabs.overview.layout[0].state;
    expect(state.storage).toEqual({ text: "Notes" });
    expect(state.params).toEqual({ start_date: "2025-01-01" });
    expect(JSON.stringify(result)).not.toContain("review-secret");
  });
  it("omits invalid or unsupported research metadata rather than inventing an executable identity", () => {
    const state = serialize(
      fixture({
        companySelection: { ...selection, version: 99 },
        companyResearch: { ...research, version: 99 },
      }),
    ).tabs.overview.layout[0].state;
    expect(state.storage).toEqual({ text: "Notes" });
    expect(state.params).toEqual({ start_date: "2025-01-01" });
  });
});
