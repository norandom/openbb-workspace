import { describe, expect, it } from "vitest";
import {
  resolveCallerChart,
  createCallerChartData,
  changeCallerChartType,
} from "../../../src/components/General/Table/Chart/caller/chartInputs";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { resolveApplicationAppearance } from "../../../src/components/General/Table/Chart/application/effectiveAppearance";

const definitions = [
  {
    children: [
      { field: "period", chartDataType: "category", cellDataType: "number" },
      {
        field: "income",
        headerName: "Income",
        chartDataType: "series",
        cellDataType: "number",
      },
      { field: "other", chartDataType: "category" },
      { field: "excluded", chartDataType: "excluded" },
    ],
  },
];
const api = {
  getAllDisplayedColumns: () =>
    ["period", "income", "other"].map((id) => ({
      getColId: () => id,
      isVisible: () => true,
    })),
};
describe("ordinary production caller inputs", () => {
  it("uses processed definitions and actual category roles without inventing units", () => {
    const widget = { id: "w", widgetId: "ordinary", storage: {}, data: {} };
    const selected = resolveCallerChart(widget, {}, definitions as any, api as any);
    expect(selected.valid).toBe(true);
    if (!selected.valid) return;
    expect(selected.value.range.columnIds).toEqual(["period", "income", "other"]);
    expect(selected.value.categoryColumnId).toBe("period");
    expect(selected.value.columns).toEqual([
      { id: "AG-GRID-DEFAULT-CATEGORY", label: "(None)", role: "category" },
      { id: "period", label: "period", role: "category" },
      { id: "income", label: "Income", role: "number" },
      { id: "other", label: "other", role: "category" },
    ]);
    const rows = [{ period: 2024, income: -42, other: "A" }];
    expect(
      createCallerChartData({
        gridApi: api,
        widget,
        rowData: rows,
        columnDefs: definitions,
      } as any).rowData,
    ).toBe(rows);
  });
  it("retains the original default category for numeric-only selections", () => {
    const result = resolveCallerChart(
      {
        id: "w",
        storage: {},
        data: {
          table: { chartView: { cellRangeCols: { groupedColumn: ["income"] } } },
        },
      },
      {},
      definitions as any,
      api as any,
    );
    expect(result.valid && result.value.categoryColumnId).toBe(
      "AG-GRID-DEFAULT-CATEGORY",
    );
    expect(result.valid && result.value.range.columnIds).toEqual(["income"]);
  });
  it("preserves saved range/model precedence, aggregation and unknown options when changing family", () => {
    const widget = {
      id: "w",
      storage: {
        keep: true,
        chartModel: { chartType: "line" },
        default: {
          chartModel: {
            chartType: "stackedColumn",
            aggFunc: "sum",
            unknown: { retained: true },
            chartOptions: {
              bar: { title: { text: "Saved" } },
              line: { title: { text: "Inactive" } },
            },
          },
          stackedColumn: {
            cellRange: {
              columns: ["period", "income"],
              rowStartIndex: 0,
              rowEndIndex: 1,
            },
          },
        },
      },
    };
    const result = resolveCallerChart(widget, {}, definitions as any, api as any);
    expect(result.valid && result.value.chartType).toBe("stackedColumn");
    expect(result.valid && result.value.range.columnIds).toEqual(["period", "income"]);
    const next = changeCallerChartType(widget, "line");
    expect(next.storage.default.chartModel).toMatchObject({
      chartType: "line",
      aggFunc: "sum",
      unknown: { retained: true },
      chartOptions: widget.storage.default.chartModel.chartOptions,
    });
    expect(widget.storage.default.chartModel.chartType).toBe("stackedColumn");
    expect(next.storage.keep).toBe(true);
  });
  it("reports malformed saved models without mutating or silently replacing them", () => {
    const widget = {
      id: "w",
      storage: {
        default: { chartModel: { chartType: 42, cellRange: { columns: "broken" } } },
      },
    };
    const original = structuredClone(widget);
    expect(resolveCallerChart(widget, {}, definitions as any, api as any).valid).toBe(
      false,
    );
    expect(widget).toEqual(original);
  });
  it("selects the active palette, projects custom params and lets explicit common options win", () => {
    const themes = {
      "custom-dark": {
        params: {
          fontFamily: "Georgia",
          fontSize: 15,
          padding: 31,
          axisColor: "#123456",
          gridLineColor: "#234567",
          backgroundColor: "#111111",
        },
        palette: { fills: ["#aabbcc"], strokes: ["#ddeeff"] },
        overrides: {
          common: { title: { fontSize: 19 } },
          bar: { series: { strokeWidth: 4 } },
        },
      },
    };
    const theme = projectCallerTheme("dark", ["custom-dark"], themes);
    expect(theme.palette).toEqual(themes["custom-dark"].palette);
    expect(theme.overrides).toMatchObject({
      common: {
        padding: { top: 31 },
        title: { fontFamily: "Georgia", fontSize: 19 },
        axes: {
          category: {
            line: { stroke: "#123456" },
            gridLine: { style: [{ stroke: "#234567" }] },
          },
        },
      },
    });
    expect(theme.overrides.bar).toMatchObject({ series: { strokeWidth: 4 } });
    expect(theme.overrides.common).not.toHaveProperty("title.spacing");
    const selected = resolveCallerChart(
      { id: "w", storage: {} },
      {},
      definitions as any,
      api as any,
    );
    if (!selected.valid) throw new Error(selected.error);
    const appearance = resolveApplicationAppearance({
      baseline: {
        stateAddress: "w",
        chartType: "groupedColumn",
        model: {},
        options: {},
      },
      generated: {},
      family: "groupedColumn",
      theme,
      precision: 0,
      seriesIds: ["income"],
      axisRuntime: selected.value.initialAxes,
    });
    expect(appearance.valid).toBe(true);
    expect(appearance.valid && appearance.value.application.title.size).toBe(19);
  });
});
