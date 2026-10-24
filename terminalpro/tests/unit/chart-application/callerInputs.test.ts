import { rangeLiveInput } from "../chart-compatibility/rangeLive.fixtures";
import { projectRangeLiveApplication } from "../../../src/components/General/Table/Chart/echarts/rangeLiveProjection";
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
it("admits declared Range time categories while retaining ordinary descriptor admission", () => {
  const defs = [
    { field: "period", chartDataType: "time" },
    { field: "income", chartDataType: "series" },
  ];
  const range = resolveCallerChart(
    { id: "w", storage: { chartModel: { chartType: "rangeArea" } }, data: {} },
    {},
    defs as any,
  );
  expect(range.valid).toBe(true);
  if (!range.valid) throw Error(range.error);
  expect(range.value.categoryColumnId).toBe("period");
  expect(range.value.initialAxes.categoryAxisType).toBe("time");
  const ordinary = resolveCallerChart(
    { id: "w", storage: {}, data: {} },
    {},
    defs as any,
  );
  expect(ordinary.valid && ordinary.value.categoryColumnId).toBe(
    "AG-GRID-DEFAULT-CATEGORY",
  );
});

it.each([
  "rangeBar",
  "rangeArea",
] as const)("retains integrated zoom defaults for %s without overriding saved choices", (family) => {
  for (const mode of ["light", "dark"] as const) {
    const theme = projectCallerTheme(
      mode,
      ["custom"],
      { custom: { params: { fontSize: 14 } } },
      family,
    );
    expect(theme.overrides.common).toMatchObject({
      zoom: {
        enabled: true,
        anchorPointX: "pointer",
        anchorPointY: "pointer",
        minVisibleItems: 4,
        autoScaling: { enabled: true },
      },
    });
    const custom = projectCallerTheme(
      mode,
      ["custom"],
      { custom: { overrides: { common: { zoom: { enabled: false } } } } },
      family,
    );
    expect((custom.overrides.common as any).zoom.enabled).toBe(false);
    const key = family === "rangeBar" ? "range-bar" : "range-area";
    const disabled = projectCallerTheme(
      mode,
      ["custom"],
      { custom: { overrides: { [key]: { zoom: { enabled: false } } } } },
      family,
    );
    expect((disabled.overrides[key] as any).zoom.enabled).toBe(false);
    const input = { ...rangeLiveInput(family), theme };
    const settings = { navigatorEnabled: false, miniChartEnabled: false };
    const live = projectRangeLiveApplication(input, settings);
    expect(live.status).toBe("supported");
    if (live.status !== "supported") throw Error(JSON.stringify(live));
    expect(
      (live.options.dataZoom as any[]).some(
        (z) => z.type === "inside" && z.zoomOnMouseWheel && z.moveOnMouseMove,
      ),
    ).toBe(true);
    for (const source of [
      { ...input, theme: custom },
      { ...input, theme: disabled },
      { ...input, generated: { common: { zoom: { enabled: false } } } },
      {
        ...input,
        baseline: {
          ...input.baseline,
          options: { [key]: { zoom: { enabled: false } } },
        },
      },
    ]) {
      const off = projectRangeLiveApplication(source, settings);
      expect(off.status).toBe("supported");
      if (off.status !== "supported") throw Error(JSON.stringify(off));
      expect(off.options.dataZoom).toBeUndefined();
    }
  }
  expect(
    (projectCallerTheme("light", [], {}).overrides.common as any).zoom,
  ).toBeUndefined();
});
it.each([
  "radarLine",
  "radarArea",
] as const)("projects %s caller theme and defaults without Cartesian marker additions", async (family) => {
  const { callerGeneratedOptions } = await import(
    "../../../src/components/General/Table/Chart/caller/generatedOptions"
  );
  const { selectRadarSession } = await import(
    "../../../src/components/General/Table/Chart/application/radarSessionProjection"
  );
  const { sessionFixture } = await import("./applicationSessionFixture");
  const key = family === "radarLine" ? "radar-line" : "radar-area";
  const generated = callerGeneratedOptions(
    {},
    {
      marker: { enabled: false },
      connectMissingData: true,
      strokeWidth: 4,
      label: { enabled: true },
    },
  );
  expect((generated[key] as any).series.marker).toBeUndefined();
  expect((generated[key] as any).series.connectMissingData).toBeUndefined();
  const theme = projectCallerTheme(
    "light",
    ["custom"],
    {
      custom: {
        params: { axisColor: "#123456", fontFamily: "Arial", fontSize: 14 },
        overrides: { [key]: { series: { strokeWidth: 2 } } },
      },
    },
    family,
  );
  const source = sessionFixture();
  const selected = selectRadarSession(
    {},
    {
      ...source,
      inputs: { ...source.inputs, family, generated, theme },
      local: {
        ...source.local,
        baseline: {
          ...source.local.baseline,
          chartType: family,
          options: {
            common: { series: { strokeWidth: 99 } },
            [key]: { series: { strokeWidth: 6 } },
          },
        },
      },
    },
  );
  expect(selected.mapping.style.series.strokeWidth).toBe(6);
  expect(selected.mapping.style.series.markers.enabled).toBe(family === "radarLine");
  expect(selected.mapping.style.series.labels.enabled).toBe(true);
  expect(selected.mapping.style.polarAxis.color).toBe("#123456");
  expect(selected.mapping.style.polarAxis.labels.font).toBe("Arial");
  const caller = resolveCallerChart(
    {
      id: "w",
      widgetId: "ordinary",
      storage: {
        chartModel: { chartType: family, qopenbbAxisSettings: { malformed: true } },
      },
      data: {},
    },
    {},
    definitions as any,
    api as any,
  );
  expect(caller.valid).toBe(true);
});

it.each([
  "light",
  "dark",
] as const)("uses %s Nightingale palette provenance and ignores inactive axis state", async (mode) => {
  const { callerGeneratedOptions } = await import(
    "../../../src/components/General/Table/Chart/caller/generatedOptions"
  );
  const { selectNightingaleSession } = await import(
    "../../../src/components/General/Table/Chart/application/nightingaleSessionProjection"
  );
  const { sessionFixture } = await import("./applicationSessionFixture");
  for (const palette of [undefined, { fills: ["#112233"], strokes: ["#abcdef"] }]) {
    const theme = projectCallerTheme(
      mode,
      ["same-name"],
      {
        "same-name": {
          params: {
            backgroundColor: "#234567",
            axisColor: "#345678",
            fontFamily: "Arial",
          },
          palette,
        },
      },
      "nightingale",
    );
    expect(theme.palette.strokes).toEqual(palette?.strokes ?? ["#234567"]);
    const generated = callerGeneratedOptions(
      {},
      { marker: { enabled: true }, connectMissingData: true, strokeWidth: 4 },
    );
    expect((generated.nightingale as any).series.marker).toBeUndefined();
    const source = sessionFixture();
    const selected = selectNightingaleSession(
      {},
      {
        ...source,
        inputs: { ...source.inputs, family: "nightingale", theme, generated },
        local: {
          ...source.local,
          baseline: { ...source.local.baseline, chartType: "nightingale" },
        },
      },
    );
    expect(selected.mapping.style.application.palette.strokes).toEqual(
      theme.palette.strokes,
    );
    expect(selected.mapping.style.polarAxis.color).toBe("#345678");
    expect(selected.mapping.style.series.strokeWidth).toBe(4);
  }
  expect(
    resolveCallerChart(
      {
        id: "w",
        widgetId: "ordinary",
        storage: {
          chartModel: {
            chartType: "nightingale",
            qopenbbAxisSettings: { malformed: true },
          },
        },
        data: {},
      },
      {},
      definitions as any,
      api as any,
    ).valid,
  ).toBe(true);
});
