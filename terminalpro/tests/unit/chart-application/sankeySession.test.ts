import { describe, expect, it } from "vitest";
import { projectApplicationChart } from "../../../src/components/General/Table/Chart/application/applicationChartProjection";
import { captureApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionCapture";
import { executeApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationSessionDispatch";
import {
  initialApplicationSession,
  synchronizeApplicationSession,
} from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { projectSankeyEditor } from "../../../src/components/General/Table/Chart/application/sankeyProjection";
import { resolveCallerChart } from "../../../src/components/General/Table/Chart/caller/chartInputs";
import {
  ChartTypeSchema,
  ChartViewOptionsSchema,
  ExternalWidgetSchema,
  InternalWidgetSchema,
} from "../../../src/lib/types/app";
import { sessionFixture } from "./applicationSessionFixture";

function fixture(setup?: any) {
  const columns = [
    { id: "from", label: "Source", role: "category" as const },
    { id: "to", label: "Target", role: "category" as const },
    { id: "value", label: "USD amount", role: "number" as const },
    { id: "period", label: "Scope", role: "category" as const },
  ];
  const rows = [
    { id: "r1", from: "Revenue", to: "Profit", value: 60, period: "FY2025" },
  ];
  const inputs: any = {
    ...sessionFixture().inputs,
    family: "sankey",
    columns,
    range: {
      columnIds: columns.map((c) => c.id),
      originalRange: { columns: columns.map((c) => c.id) },
    },
    api: {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (i: number) => rows[i],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
    },
  };
  const widget: any = {
    id: "widget",
    storage: {
      other: { retained: true },
      partition: {
        chartModel: {
          chartType: "sankey",
          chartOptions: { line: { series: { strokeWidth: 7 } } },
        },
        sankey: setup === undefined ? {} : { sankeySetup: setup },
      },
    },
  };
  const state = {
    ...initialApplicationSession(widget.storage, inputs, 1),
    viewport: { width: 700, height: 400 },
  };
  return { widget, inputs, state, rows };
}
const selection = {
  version: 1,
  sourceColumnId: "from",
  targetColumnId: "to",
  valueColumnId: "value",
  metadata: { unit: null, currency: null, scale: null, period: null, measure: null },
  metadataColumnIds: {},
};
function edit(f: ReturnType<typeof fixture>, intent: any, stamp = f.state.local.stamp) {
  const result = executeApplicationChartCommand(f.widget, f.state, f.inputs, {
    family: "sankey",
    stamp,
    intent,
  });
  f.widget = result.widget;
  f.state = result.value as typeof f.state;
  return result;
}
function capture(f: ReturnType<typeof fixture>) {
  const result = captureApplicationSession(f.inputs, f.state);
  expect(result.status, JSON.stringify(result)).toBe("ready");
  if (result.status !== "ready") throw Error("capture failed");
  f.state = { ...f.state, capture: result.value, error: undefined };
  return projectApplicationChart(f.widget.storage, f.inputs, f.state);
}
describe("Sankey application session", () => {
  it("admits Sankey through actual widget authoring schemas without changing defaults or errors", () => {
    const chartView = {
      enabled: true,
      chartType: "sankey",
      cellRangeCols: { sankey: ["from", "to", "value"] },
    };
    expect(ChartTypeSchema.safeParse("sankey").success).toBe(true);
    expect(ChartViewOptionsSchema.safeParse(chartView).success).toBe(true);
    for (const schema of [InternalWidgetSchema, ExternalWidgetSchema]) {
      const parsed = schema.safeParse({
        id: "w",
        widgetId: "flow",
        data: { table: { chartView } },
      });
      expect(parsed.success, JSON.stringify(parsed)).toBe(true);
      if (parsed.success)
        expect(parsed.data.data?.table?.chartView).toMatchObject(chartView);
    }
    expect(ChartTypeSchema.parse(undefined)).toBe("line");
    const invalid = ChartTypeSchema.safeParse("unknown-flow");
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues[0].message).toBe("Invalid chart type");
  });
  it("binds metadata from raw columns, retains row bounds and recovers conflicting declarations", () => {
    const f = fixture(selection);
    f.inputs.range = {
      ...f.inputs.range,
      rowStartIndex: 0,
      rowEndIndex: 0,
      originalRange: {
        ...f.inputs.range.originalRange,
        rowStartIndex: 0,
        rowEndIndex: 0,
      },
    };
    f.state = {
      ...initialApplicationSession(f.widget.storage, f.inputs, 2),
      viewport: { width: 700, height: 400 },
    };
    for (const [field, value] of [
      ["unit", "currency"],
      ["currency", "USD"],
      ["scale", 1],
      ["measure", "income-allocation"],
    ])
      edit(f, { panel: "sankeySetup", edit: { kind: "metadata", field, value } });
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "metadata-column", field: "period", value: "period" },
    });
    const result = capture(f);
    expect(result.status).toBe("ready");
    if (result.status !== "ready" || result.value.kind !== "sankey")
      throw Error("Expected Sankey");
    expect(result.value.snapshot.rows[0].metadata).toEqual({
      unit: "currency",
      currency: "USD",
      scale: 1,
      period: "FY2025",
      measure: "income-allocation",
    });
    expect(result.value.diagnostics).toEqual([]);
    expect(f.widget.storage.partition.sankey.cellRange).toMatchObject({
      rowStartIndex: 0,
      rowEndIndex: 0,
    });
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "metadata", field: "period", value: "FY2024" },
    });
    expect(captureApplicationSession(f.inputs, f.state)).toMatchObject({
      status: "invalid",
      diagnostics: [{ rowIds: ["r1"] }],
    });
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "metadata", field: "period", value: null },
    });
    expect(capture(f).status).toBe("ready");
  });
  it("shows internal imbalance and persists common chrome without changing data revision", () => {
    const f = fixture(selection);
    f.rows.push({
      id: "r2",
      from: "Profit",
      to: "Retained",
      value: 50,
      period: "FY2025",
    });
    expect(capture(f).status).toBe("ready");
    expect(
      projectSankeyEditor(f.widget.storage, f.inputs, f.state).diagnostics.some((d) =>
        /imbalanc/i.test(d.message),
      ),
    ).toBe(true);
    const revision = f.state.local.stamp.dataRevision;
    for (const intent of [
      {
        panel: "titles",
        edit: { caption: "title", field: "text", value: "Income allocation" },
      },
      { panel: "titles", edit: { caption: "title", field: "enabled", value: true } },
      { panel: "padding", edit: { side: "left", value: 33 } },
      { panel: "background", edit: { field: "fill", value: "#f5f5f5" } },
      { panel: "tooltips", edit: { field: "enabled", value: false } },
    ])
      edit(f, intent);
    expect(f.state.local.stamp.dataRevision).toBe(revision);
    const reopened = {
      ...initialApplicationSession(f.widget.storage, f.inputs, 2),
      viewport: f.state.viewport,
    };
    const editor = projectSankeyEditor(f.widget.storage, f.inputs, reopened).editor!;
    expect(editor.titles.value.title).toMatchObject({
      enabled: true,
      text: "Income allocation",
    });
    expect(editor.padding.value.left).toBe(33);
    expect(editor.background.value.fill).toBe("#f5f5f5");
    expect(editor.tooltips.value.enabled).toBe(false);
    expect(
      f.widget.storage.partition.chartModel.chartOptions.line.series.strokeWidth,
    ).toBe(7);
  });
  it("persists incremental mappings without a valid capture, recaptures and reopens", () => {
    const f = fixture();
    expect(
      projectSankeyEditor(f.widget.storage, f.inputs, f.state).setupProps.selection
        .sourceColumnId,
    ).toBeNull();
    for (const [field, value] of [
      ["sourceColumnId", "from"],
      ["targetColumnId", "to"],
      ["valueColumnId", "value"],
    ])
      edit(f, { panel: "sankeySetup", edit: { kind: "mapping", field, value } });
    expect(f.state.local.stamp.dataRevision).toBe(3);
    expect(f.widget.storage.partition.sankey.sankeySetup).toEqual(selection);
    const result = capture(f);
    expect(result).toMatchObject({ status: "ready", value: { kind: "sankey" } });
    expect(
      projectSankeyEditor(f.widget.storage, f.inputs, f.state).diagnostics.some(
        (d) => d.severity === "warning",
      ),
    ).toBe(true);
    const reopened = fixture(f.widget.storage.partition.sankey.sankeySetup);
    expect(capture(reopened).status).toBe("ready");
    expect(f.widget.storage.other).toEqual({ retained: true });
    expect(
      f.widget.storage.partition.chartModel.chartOptions.line.series.strokeWidth,
    ).toBe(7);
  });
  it("repairs malformed storage explicitly and changes family without any valid capture", () => {
    const f = fixture({ version: 99, sourceColumnId: "from" });
    expect(
      projectSankeyEditor(f.widget.storage, f.inputs, f.state).diagnostics[0].message,
    ).toMatch(/saved|version/i);
    expect(f.widget.storage.partition.sankey.sankeySetup.version).toBe(99);
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "mapping", field: "sourceColumnId", value: "from" },
    });
    expect(f.widget.storage.partition.sankey.sankeySetup.version).toBe(1);
    edit(f, { panel: "family", chartType: "line" });
    expect(f.widget.storage.partition.chartModel.chartType).toBe("line");
    expect(f.widget.storage.partition.sankey.sankeySetup.sourceColumnId).toBe("from");
  });
  it("retains failed mappings, permits correction, and reports zero/empty without ready export", () => {
    const f = fixture(selection);
    expect(capture(f).status).toBe("ready");
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "mapping", field: "targetColumnId", value: "from" },
    });
    expect(captureApplicationSession(f.inputs, f.state).status).toBe("invalid");
    expect(
      projectSankeyEditor(f.widget.storage, f.inputs, f.state).setupProps.selection
        .targetColumnId,
    ).toBe("from");
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "mapping", field: "targetColumnId", value: "to" },
    });
    expect(capture(f).status).toBe("ready");
    f.rows[0].value = 0;
    expect(capture(f).status).not.toBe("ready");
    expect(projectSankeyEditor(f.widget.storage, f.inputs, f.state).notice).toBe(
      "All selected links are zero",
    );
    f.rows.splice(0);
    expect(capture(f).status).not.toBe("ready");
    expect(projectSankeyEditor(f.widget.storage, f.inputs, f.state).notice).toBe(
      "No rows in selected range",
    );
  });
  it("rejects stale edits and external setup changes invalidate capture", () => {
    const f = fixture(selection);
    capture(f);
    const before = f.widget;
    edit(
      f,
      {
        panel: "sankeySetup",
        edit: { kind: "metadata", field: "period", value: "FY2025" },
      },
      { ...f.state.local.stamp, generation: 99 },
    );
    expect(f.widget).toBe(before);
    const storage = structuredClone(f.widget.storage);
    storage.partition.sankey.sankeySetup.metadata.period = "FY2025";
    const synced = synchronizeApplicationSession(storage, f.inputs, f.state);
    expect(synced.capture).toBeUndefined();
    expect(synced.local.stamp.dataRevision).toBe(f.state.local.stamp.dataRevision + 1);
    const latestRange = structuredClone(f.widget);
    latestRange.storage.partition.sankey.cellRange = {
      columns: ["from", "to", "value"],
      rowStartIndex: 0,
      rowEndIndex: 0,
    };
    f.widget = latestRange;
    edit(f, {
      panel: "sankeySetup",
      edit: { kind: "metadata", field: "period", value: "FY2025" },
    });
    expect(f.widget).toBe(latestRange);
    expect(f.widget.storage.partition.sankey.sankeySetup.metadata.period).toBeNull();
  });
  it("preserves raw metadata descriptors without label inference", () => {
    const result = resolveCallerChart(
      { id: "w", storage: { chartModel: { chartType: "sankey" } } },
      {},
      [
        { field: "from", chartDataType: "category" },
        { field: "to", chartDataType: "category" },
        { field: "value", chartDataType: "series" },
        { field: "period" },
        { field: "scale", cellDataType: "number" },
      ],
    );
    expect(result.valid).toBe(true);
    if (!result.valid) throw Error(result.error);
    expect(
      resolveCallerChart(
        { id: "w", storage: { chartModel: { chartType: "sankey" } } },
        {},
        [],
      ).valid,
    ).toBe(true);
    expect(result.value.columns.map((c) => c.id)).toEqual([
      "from",
      "to",
      "value",
      "period",
      "scale",
    ]);
    expect(result.value.columns.every((c) => c.unit === undefined)).toBe(true);
    expect(result.value.columns.find((c) => c.id === "scale")?.role).toBe("number");
  });
});
