import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { backendTemplateSchema } from "../../../src/lib/types/app";
import {
  createCustomTemplateTab,
  openListedApp,
} from "../../../src/lib/utils/createTemplates";
import {
  getStateKey,
  restoreCommunityState,
} from "../../../src/components/General/Table/communityState";
import { chartTypeGalleryGroups } from "../../../src/components/General/Table/Chart/editor/chartTypeGalleryCatalog";
import { readSankeySetup } from "../../../src/components/General/Table/Chart/application/sankeySelection";
import { selectHierarchySetup } from "../../../src/components/General/Table/Chart/application/hierarchySetupSelection";
import { resolveComboAssignments } from "../../../src/components/General/Table/Chart/compatibility/comboAssignments";
import { resolveXyAssignments } from "../../../src/components/General/Table/Chart/compatibility/xyAssignments";
import { calculateHistogramBins } from "../../../src/components/General/Table/Chart/compatibility/histogramBins";
import { projectWaterfallTotals } from "../../../src/components/General/Table/Chart/compatibility/waterfallTotals";

vi.mock("~/api/auth.api", () => ({
  getExternalCopilotHolders: vi.fn().mockResolvedValue([]),
}));
vi.mock("~/api/dashboard.api", () => ({ saveDashboards: vi.fn() }));
vi.mock("~/lib/state/copilot", () => ({
  useCopilotStore: { getState: () => ({ setSelectedCopilot: vi.fn() }) },
}));
vi.mock("~/lib/state/theme", () => ({
  useThemeStore: { getState: () => ({ setPromptsSuggestionsMenuOpen: vi.fn() }) },
}));
vi.mock("~/lib/api/sdkComponents", () => ({
  fetchQuerySymbols: vi.fn().mockResolvedValue({ results: [] }),
}));

type Column = {
  field: string;
  type: "string" | "number" | "date";
  label: string;
  unit: string;
};
type Recipe = { datasetId: string; title: string; state: Record<string, any> };
const contract = JSON.parse(
  readFileSync(
    resolve(
      process.env.QOPENBB_GALLERY_CONTRACT ??
        "../../../contracts/gallery/chart-state.json",
    ),
    "utf8",
  ),
) as {
  schemaVersion: number;
  snapshotId: string;
  appName: string;
  datasets: Record<string, { columns: Column[] }>;
  charts: Record<string, Recipe>;
};
const model = (recipe: Recipe) =>
  recipe.state.chartModel ?? recipe.state.storage.default.chartModel;
const columns = (recipe: Recipe) => contract.datasets[recipe.datasetId].columns;
const selected = (recipe: Recipe) => model(recipe).cellRange.columns as string[];
const numeric = (recipe: Recipe) =>
  selected(recipe).filter(
    (id) => columns(recipe).find((c) => c.field === id)?.type === "number",
  );
const source = {
  id: "gallery-seam-source",
  name: "Historical gallery seam",
  url: "http://127.0.0.1/data",
} as any;

function template(recipes = Object.entries(contract.charts)) {
  return {
    name: contract.appName,
    description: "HG0 native saved-state fixture",
    allowCustomization: true,
    tabs: {
      overview: {
        id: "overview",
        name: "Overview",
        layout: recipes.map(([chartType, recipe], index) => ({
          i: `qopenbb_gallery_${chartType}`,
          x: 0,
          y: index * 8,
          w: 20,
          h: 8,
          state: structuredClone(recipe.state),
        })),
      },
    },
  };
}

async function hydrate(recipes = Object.entries(contract.charts), items: any = {}) {
  const addTab = vi.fn();
  const native = template(recipes);
  const widgets = Object.fromEntries(
    recipes.map(([type, recipe]) => [
      `qopenbb_gallery_${type}`,
      {
        widgetId: `qopenbb_gallery_${type}`,
        name: recipe.title,
        type: "table",
        endpoint: `/gallery/data/${recipe.datasetId}`,
        params: [],
        storage: {},
        data: {
          dataKey: "results",
          table: {
            columnsDefs: columns(recipe).map((c) => ({
              field: c.field,
              headerName: c.label,
              cellDataType:
                c.type === "number"
                  ? "number"
                  : c.type === "date"
                    ? "dateString"
                    : "text",
              chartDataType:
                c.type === "number"
                  ? "series"
                  : c.type === "date"
                    ? "time"
                    : "category",
            })),
          },
        },
      },
    ]),
  );
  await createCustomTemplateTab({
    addTab,
    source: { ...source, widgets },
    items,
    template: native as any,
  });
  return addTab.mock.calls[0][0];
}

describe("historical gallery native template seam", () => {
  it("freezes exactly twelve typed datasets and the native 35 plus custom inventory", () => {
    expect(contract.schemaVersion).toBe(1);
    expect(contract.snapshotId).toBe("fmp-historical-2025-01-v1");
    expect(Object.keys(contract.datasets)).toHaveLength(12);
    expect(Object.keys(contract.charts).sort()).toEqual(
      [
        ...chartTypeGalleryGroups.flatMap((group) =>
          group.items.map((item) => item.modelType),
        ),
        "customCombo",
      ].sort(),
    );
    for (const recipe of Object.values(contract.charts)) {
      const fields = columns(recipe).map((c) => c.field);
      expect(new Set(fields).size).toBe(fields.length);
      expect(selected(recipe).every((id) => fields.includes(id))).toBe(true);
      for (const column of columns(recipe)) {
        expect(["string", "date", "number"]).toContain(column.type);
        expect(column.label.length).toBeGreaterThan(0);
        expect(column.unit.length).toBeGreaterThan(0);
      }
    }
  });

  it("parses and hydrates every saved model/range through createCustomTemplateTab without fixed instance IDs", async () => {
    const native = template();
    const parsed = backendTemplateSchema.parse(native);
    expect(parsed.tabs.overview.layout.map((item) => item.state)).toMatchObject(
      native.tabs.overview.layout.map((item) => item.state),
    );
    const created = await hydrate();
    expect(created.data.widgets).toHaveLength(36);
    const instanceIds = new Set<string>();
    for (const widget of created.data.widgets) {
      const type = widget.widgetId.replace("qopenbb_gallery_", "");
      const recipe = contract.charts[type];
      const key = getStateKey(widget);
      expect(key).toBe("default");
      expect(widget.id).not.toBe(widget.widgetId);
      instanceIds.add(widget.id);
      expect(widget.storage[key].chartModel).toEqual(model(recipe));
      expect(widget.storage[key][type].cellRange).toEqual(model(recipe).cellRange);
      expect(widget.storage.chartView).toMatchObject(recipe.state.chartView);
      expect(widget.data.table.chartView).toMatchObject(recipe.state.chartView);
    }
    expect(instanceIds.size).toBe(36);
  });

  it("retains native AAPL table filters for histogram and monthly range capture", async () => {
    const created = await hydrate(
      ["histogram", "rangeArea"].map((id) => [id, contract.charts[id]]),
    );
    for (const widget of created.data.widgets) {
      const setFilterModel = vi.fn();
      expect(restoreCommunityState({ setFilterModel } as any, widget)).toBe(true);
      expect(setFilterModel).toHaveBeenCalledWith({
        symbol: { filterType: "text", type: "equals", filter: "AAPL" },
      });
      expect(widget.storage.default.chartModel.aggFunc).toBeUndefined();
    }
  });

  it("preserves Sankey setup through storage hydration and reads it with the real selector", async () => {
    const recipe = contract.charts.sankey;
    expect(recipe.state.chartModel).toBeUndefined();
    const created = await hydrate([["sankey", recipe]]);
    const setup = created.data.widgets[0].storage.default.sankey.sankeySetup;
    expect(setup).toEqual(recipe.state.storage.default.sankey.sankeySetup);
    expect(readSankeySetup(setup)).toEqual({
      diagnostics: [],
      selection: {
        sourceColumnId: "source",
        targetColumnId: "target",
        valueColumnId: "value",
        metadata: {
          unit: "currency",
          currency: "USD",
          scale: 1e9,
          period: "AAPL FY2024",
          measure: "derived-income-allocation",
        },
        metadataColumnIds: {},
      },
    });
  });

  it.each([
    "treemap",
    "sunburst",
  ])("recovers ordered %s hierarchy categories and sum from native selected columns", (type) => {
    const recipe = contract.charts[type];
    const result = selectHierarchySetup(
      model(recipe),
      { columnIds: selected(recipe), originalRange: model(recipe).cellRange },
      columns(recipe).map((c) => ({
        id: c.field,
        label: c.label,
        role: c.type === "number" ? "number" : "category",
      })),
    );
    expect(result).toEqual({
      status: "ready",
      value: {
        categoryIds: ["fiscalYear", "fiscalQuarter", "component"],
        seriesIds: ["amount"],
        aggFunc: "sum",
      },
    });
  });

  it.each([
    "columnLineCombo",
    "areaColumnCombo",
    "customCombo",
  ])("resolves the intended %s marks and axes with the native assignment helper", (type) => {
    const recipe = contract.charts[type];
    if (type !== "customCombo") expect(model(recipe).seriesChartTypes).toBeUndefined();
    const result = resolveComboAssignments({
      chartType: type as any,
      valueColumns: numeric(recipe).map((colId) => ({ colId, selected: true })),
      seriesChartTypes: model(recipe).seriesChartTypes,
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw Error(JSON.stringify(result));
    expect(result.chartType).toBe(type);
    expect(result.seriesChartTypes).toEqual(
      type === "customCombo"
        ? model(recipe).seriesChartTypes
        : [
            {
              colId: "revenue",
              chartType: type === "columnLineCombo" ? "groupedColumn" : "stackedArea",
              secondaryAxis: false,
            },
            {
              colId: "netIncome",
              chartType: type === "columnLineCombo" ? "line" : "groupedColumn",
              secondaryAxis: false,
            },
          ],
    );
  });

  it.each([
    "scatter",
    "bubble",
  ])("derives %s X/Y/size from selected native numeric order", (type) => {
    const recipe = contract.charts[type];
    expect(
      resolveXyAssignments({
        chartType: type as any,
        paired: model(recipe).chartOptions[type].paired,
        valueColumns: numeric(recipe).map((colId) => ({ colId, selected: true })),
      }),
    ).toMatchObject({
      status: "resolved",
      assignments: [
        {
          xColId: "volatilityPct",
          yColId: "januaryReturnPct",
          ...(type === "bubble" ? { sizeColId: "meanDollarActivity" } : {}),
        },
      ],
    });
  });

  it("freezes explicit histogram edges and native internal/final-boundary inclusion", () => {
    const binning = model(contract.charts.histogram).chartOptions.histogram.series;
    expect(binning.binCount).toBeUndefined();
    expect(binning.bins).toHaveLength(12);
    const result = calculateHistogramBins({
      ...binning,
      values: [-6, -5, 0, 1, 6, null],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw Error(JSON.stringify(result));
    expect(result.skippedIndices).toEqual([5]);
    expect(result.groups.map((g) => [g.intervalIndex, g.observationIndices])).toEqual([
      [0, [0]],
      [1, [1]],
      [6, [2]],
      [7, [3]],
      [11, [4]],
    ]);
    expect(result.groups.reduce((sum, g) => sum + g.frequency, 0)).toBe(5);
  });

  it("keeps the Waterfall native movement contract without invented subtotal bars", () => {
    expect(selected(contract.charts.waterfall)).toEqual(["stage", "movement"]);
    const result = projectWaterfallTotals([100, -60, -10, 2, -5]);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw Error(JSON.stringify(result));
    expect(result.points.map((p) => p.end)).toEqual([100, 40, 30, 32, 27]);
    expect(result.points.map((p) => p.kind)).toEqual([
      "positive",
      "negative",
      "negative",
      "positive",
      "negative",
    ]);
  });

  it("reuses untouched identity and numbers changed dashboards without changing saved edits", async () => {
    const created = await hydrate([["line", contract.charts.line]]);
    const untouched = {
      ...created,
      data: { ...created.data, numberOfChanges: 0, currentTab: "overview" },
    };
    const addTab = vi.fn();
    const navigate = vi.fn();
    expect(
      await createCustomTemplateTab({
        addTab,
        navigate,
        source,
        items: { [created.index]: untouched },
        template: template() as any,
      }),
    ).toBe(created.index);
    expect(addTab).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`/app/${created.index}?tab=overview`);
    const changed = structuredClone(untouched);
    changed.data.numberOfChanges = 1;
    changed.data.widgets[0].storage.default.chartModel.cellRange.columns = [
      "date",
      "MSFT",
    ];
    const before = structuredClone(changed);
    const copy = await hydrate([["line", contract.charts.line]], {
      [created.index]: changed,
    });
    expect(copy.data.name).toBe(`${contract.appName} (2)`);
    expect(changed).toEqual(before);
  });

  it("characterizes Apps primary first-template behavior without reordering canonical apps", async () => {
    const addTab = vi.fn();
    await openListedApp({
      source: {
        ...source,
        templates: [{ name: "Canonical first", tabs: {} }, template()],
      },
      items: {},
      addTab,
    });
    expect(addTab.mock.calls[0][0].data.name).toBe("Canonical first");
  });
});
