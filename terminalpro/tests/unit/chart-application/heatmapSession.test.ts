import { describe, expect, it } from "vitest";
import type { ApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationChartSessionTypes";
import { captureApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionCapture";
import { planApplicationRecapture } from "../../../src/components/General/Table/Chart/application/applicationSessionRecapture";
import {
  contextFor,
  initialApplicationSession,
} from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { applyOrdinarySessionTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionTransactions";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import { resolveHeatmapRange } from "../../../src/components/General/Table/Chart/application/heatmapRange";
import {
  applyHeatmapSessionTransaction,
  projectHeatmapSession,
  selectHeatmapSession,
} from "../../../src/components/General/Table/Chart/application/heatmapSession";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import type { SessionResult } from "../../../src/components/General/Table/Chart/application/types";
import { resolveCallerChart } from "../../../src/components/General/Table/Chart/caller/chartInputs";
import { heatmapThemePaint } from "../../../src/components/General/Table/Chart/caller/heatmapThemePaint";
import { validateSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshot";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { sessionFixture } from "./applicationSessionFixture";

function fixture(storage: any = {}): ApplicationSessionContext<"heatmap"> {
  const c = sessionFixture(storage);
  return {
    ...c,
    inputs: {
      ...c.inputs,
      family: "heatmap",
      heatmapThemePaint: heatmapThemePaint(undefined, false),
      rangePolicy: {
        configuredColumnIds: c.inputs.range.columnIds,
        generatedColumnIds: c.inputs.columns.map((column) => column.id),
        definitionColumnIds: c.inputs.columns.map((column) => column.id),
      },
    },
    local: {
      ...c.local,
      baseline: {
        ...c.local.baseline,
        chartType: "heatmap",
        model: { ...c.local.baseline.model, chartType: "heatmap" },
      },
    },
  };
}
function ready<T extends { status: string }>(
  result: T,
): Extract<T, { status: "ready" }> {
  expect(result.status, JSON.stringify(result)).toBe("ready");
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  return result as Extract<T, { status: "ready" }>;
}
function edit(c: ReturnType<typeof fixture>, storage: any, intent: any) {
  return ready(
    applyOrdinarySessionTransaction(storage, c, {
      family: "heatmap",
      stamp: c.local.stamp,
      intent,
    }),
  ).value;
}
describe("Heatmap ordinary snapshot integration", () => {
  it.each([
    "period",
    "AG-GRID-DEFAULT-CATEGORY",
    "income",
  ])("reopens saved single field %s and preserves row bounds", (id) => {
    const c = fixture();
    const range = {
      columnIds: [id],
      originalRange: { columns: [id], rowStartIndex: 1, rowEndIndex: 2 },
      rowStartIndex: 1,
      rowEndIndex: 2,
    };
    const columns = [
      ...c.inputs.columns,
      { id: "AG-GRID-DEFAULT-CATEGORY", label: "(None)", role: "category" as const },
    ];
    const input = {
      storedRange: range,
      ignoreCellRange: false,
      definitionColumnIds: columns.map((c) => c.id),
      generatedColumnIds: c.inputs.range.columnIds,
    };
    expect(resolveHeatmapRange(input, columns)).toMatchObject({
      status: "ready",
      range,
    });
    expect(
      resolveHeatmapRange({ ...input, ignoreCellRange: true }, columns),
    ).toMatchObject({
      status: "ready",
      range: { columnIds: c.inputs.range.columnIds },
    });
    expect(
      resolveHeatmapRange(
        { ...input, storedRange: { ...range, columnIds: ["unknown"] } },
        columns,
      ).status,
    ).toBe("invalid");
    const storage = {
      chartModel: { chartType: "heatmap", cellRange: range.originalRange },
    };
    const caller = resolveCallerChart(
      { id: "widget", storage },
      {},
      c.inputs.columns.map((c) => ({
        field: c.id,
        chartDataType: c.role === "number" ? "series" : "category",
      })) as any,
    );
    expect(caller.valid, JSON.stringify(caller)).toBe(true);
    if (caller.valid === false) throw Error(caller.error);
    expect(caller.value.range.columnIds).toEqual([id]);
    const inputs = { ...c.inputs, ...caller.value };
    const rows = [
      { id: "r0", period: "A", revenue: 10, income: 1 },
      { id: "r1", period: "B", revenue: 20, income: 2 },
      { id: "r2", period: "C", revenue: 30, income: 3 },
    ];
    const api = {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (index: number) => rows[index],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
    } as any;
    const liveInputs = { ...inputs, api };
    const initial = {
      ...initialApplicationSession(storage, liveInputs, 2),
      viewport: { width: 700, height: 450 },
    };
    const state = {
      ...initial,
      capture: ready(captureApplicationSession(liveInputs, initial)).value,
    };
    expect(state.local.range.columnIds).toEqual([id]);
    expect(state.capture.selectedColumnIds).not.toContain("revenue");
    const first = ready(projectHeatmapSession(storage, liveInputs, state)).value;
    expect(first.setupProps.value.series.map((series) => series.id)).toEqual(
      id === "income" ? ["income"] : [],
    );
    const command: ApplicationChartCommand = {
      family: "heatmap",
      stamp: state.local.stamp,
      intent: { panel: "setup", edit: { kind: "series-add", id: "revenue" } },
    };
    const recapture = planApplicationRecapture(storage, liveInputs, state, command);
    expect(recapture?.status).toBe("ready");
    const next = ready(
      applyOrdinarySessionTransaction(
        storage,
        contextFor(liveInputs, state),
        command,
        recapture as SessionResult<ChartSnapshot>,
      ),
    ).value;
    const projected = ready(
      projectHeatmapSession(next.storage, liveInputs, {
        ...state,
        local: next.local,
        capture: next.capture,
      }),
    ).value;
    expect(projected.snapshot.rows.map((row) => row.values.revenue)).toEqual([20, 30]);
    expect(projected.setupProps.value.series.map((series) => series.id)).toEqual(
      id === "income" ? ["income", "revenue"] : ["revenue"],
    );
  });
  it("refreshes caller paint while explicit saved ranges retain precedence", () => {
    const c = fixture();
    const custom = {
      ...c,
      inputs: {
        ...c.inputs,
        heatmapThemePaint: heatmapThemePaint({ fills: ["#123456", "#abcdef"] }, false),
      },
    };
    expect(selectHeatmapSession({}, custom).style.colorRange).toEqual([
      "#123456",
      "#abcdef",
    ]);
    const storage = {
      partition: {
        chartModel: {
          chartType: "heatmap",
          chartOptions: { heatmap: { series: { colorRange: ["#000000", "#ffffff"] } } },
        },
      },
    };
    expect(selectHeatmapSession(storage, custom).style.colorRange).toEqual([
      "#000000",
      "#ffffff",
    ]);
  });
  it("requires a current category recapture and rejects appearance against the old selection", () => {
    const c = fixture();
    const command = {
      family: "heatmap" as const,
      stamp: c.local.stamp,
      intent: {
        panel: "setup" as const,
        edit: { kind: "category" as const, value: "other" },
      },
    };
    const capture = {
      ...c.capture,
      categoryColumnId: "other",
      selectedColumnIds: ["other", "revenue", "income"],
      columns: c.inputs.columns.filter((column) => column.id !== "period"),
      rows: c.capture.rows.map((row) => ({ ...row, category: "A" })),
    };
    expect(applyOrdinarySessionTransaction({}, c, command).status).toBe("waiting");
    expect(
      applyOrdinarySessionTransaction({}, c, command, {
        status: "ready",
        stamp: { ...c.local.stamp, generation: 2 },
        value: capture,
      }).status,
    ).toBe("stale");
    const next = ready(
      applyOrdinarySessionTransaction({}, c, command, {
        status: "ready",
        stamp: c.local.stamp,
        value: capture,
      }),
    ).value;
    expect(next.change).toBe("data");
    expect(next.capture?.rows[0]).toMatchObject({ category: "A" });
    expect(
      applyHeatmapSessionTransaction(next.storage, c, {
        family: "heatmap",
        stamp: c.local.stamp,
        intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
      }).status,
    ).toBe("stale");
  });
  it("retains raw mixed units and provenance while ordinary axes still reject", () => {
    const original = fixture();
    const c = {
      ...original,
      capture: {
        ...original.capture,
        columns: original.capture.columns.map((column) => ({
          ...column,
          ...(column.role === "number"
            ? { unit: column.id === "revenue" ? "USD" : "percent", scale: 1 }
            : {}),
        })),
      },
    };
    const selected = selectHeatmapSession({}, c);
    expect(selected.projection.axisUnits).toBe("deferred");
    expect(selected.projection.snapshot.rows[0].values).toEqual({
      revenue: 100,
      income: 20,
    });
    expect(selected.projection.snapshot.columns[2].unit).toBe("percent");
    expect(selected.projection.valueOrigins.r1.income).toBeDefined();
    expect(projectOrdinarySetup(c.capture, selected.setup).status).toBe("invalid");
  });
  it("admits zero selected numbers only under the dedicated finite/null policy", () => {
    const c = fixture();
    const empty = { ...c.capture, selectedColumnIds: ["period"] };
    expect(validateSnapshot(empty).valid).toBe(false);
    expect(validateSnapshot(empty, "heatmap-observations").valid).toBe(true);
    for (const invalid of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        validateSnapshot(
          {
            ...empty,
            rows: [{ id: "r", category: "A", values: { revenue: invalid } }],
          },
          "heatmap-observations",
        ).valid,
      ).toBe(false);
    }
  });
  it("ignores saved transpose, rejects its command and preserves inactive options", () => {
    const storage = {
      partition: {
        chartModel: {
          chartType: "heatmap",
          switchCategorySeries: true,
          chartOptions: { line: { series: { strokeWidth: 7 } } },
        },
      },
    };
    const c = fixture(storage);
    expect(selectHeatmapSession(storage, c).setup.switchCategorySeries).toBe(false);
    expect(
      applyOrdinarySessionTransaction(storage, c, {
        family: "heatmap",
        stamp: c.local.stamp,
        intent: {
          panel: "setup",
          edit: { kind: "switch-category-series", value: true },
        },
      }).status,
    ).toBe("invalid");
    const next = edit(c, storage, {
      panel: "tooltips",
      edit: { field: "enabled", value: false },
    });
    expect(next.local.baseline.model.switchCategorySeries).toBe(true);
    expect(next.local.baseline.options.line).toEqual({ series: { strokeWidth: 7 } });
  });
  it("composes immediate appearance intents against latest storage and rejects stale frames", () => {
    const c = fixture();
    const a = edit(
      c,
      {},
      { panel: "heatmapAxis", axis: "x", edit: { field: "thickness", value: 4 } },
    );
    const b = edit({ ...c, local: a.local }, a.storage, {
      panel: "heatmapAxis",
      axis: "y",
      edit: { field: "thickness", value: 7 },
    });
    const selected = selectHeatmapSession(b.storage, { ...c, local: b.local });
    expect(selected.style.axes.x.fields.thickness).toBe(4);
    expect(selected.style.axes.y.fields.thickness).toBe(7);
    expect((b.local.baseline.options.heatmap as any).axes.category).toMatchObject({
      bottom: { line: { width: 4 } },
      top: { line: { width: 4 } },
      left: { line: { width: 7 } },
      right: { line: { width: 7 } },
    });
    expect(b.change).toBe("render");
    for (const stamp of [
      { ...c.local.stamp, generation: 3 },
      { ...c.local.stamp, dataRevision: 3 },
      {
        ...c.local.stamp,
        address: {
          widgetId: "other",
          stateKey: "partition",
          stateAddress: '["other","partition"]',
        },
      },
    ]) {
      expect(
        applyHeatmapSessionTransaction({}, c, {
          stamp,
          family: "heatmap",
          intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
        }).status,
      ).toBe("stale");
    }
    expect(
      applyHeatmapSessionTransaction({}, c, {
        stamp: c.local.stamp,
        family: "pie",
        intent: { panel: "tooltips", edit: { field: "enabled", value: false } },
      }).status,
    ).toBe("stale");
  });
  it("aggregates off/on from retained observations and derives Count units", () => {
    const c = fixture();
    const a = edit(c, {}, { panel: "setup", edit: { kind: "aggregate", value: true } });
    expect(
      selectHeatmapSession(a.storage, { ...c, local: a.local }).projection.snapshot
        .rows[0].values.revenue,
    ).toBe(220);
    const b = edit({ ...c, local: a.local }, a.storage, {
      panel: "setup",
      edit: { kind: "aggregation-method", value: "count" },
    });
    const count = selectHeatmapSession(b.storage, { ...c, local: b.local });
    expect(count.projection.observationKind).toBe("count");
    expect(count.projection.snapshot.columns[1].unit).toBe("observation-count");
    const off = edit({ ...c, local: b.local }, b.storage, {
      panel: "setup",
      edit: { kind: "aggregate", value: false },
    });
    expect(
      selectHeatmapSession(off.storage, { ...c, local: off.local }).projection.snapshot
        .rows,
    ).toHaveLength(2);
  });
  it("removes, reorders, re-adds and freshly reopens zero-series with usable Setup", () => {
    const c = fixture();
    let next = edit(
      c,
      {},
      { panel: "setup", edit: { kind: "series-order", ids: ["income", "revenue"] } },
    );
    expect(
      selectHeatmapSession(next.storage, { ...c, local: next.local }).setup.seriesIds,
    ).toEqual(["income", "revenue"]);
    for (const id of ["revenue", "income"])
      next = edit({ ...c, local: next.local }, next.storage, {
        panel: "setup",
        edit: { kind: "series-remove", id },
      });
    const state = {
      ...initialApplicationSession(next.storage, c.inputs, 2),
      capture: c.capture,
      viewport: { width: 700, height: 450 },
    };
    const projection = ready(
      projectHeatmapSession(next.storage, c.inputs, state),
    ).value;
    expect(projection.setupProps.value.series).toEqual([]);
    expect(projection.setupProps.availableSeries).toHaveLength(2);
    expect(JSON.stringify(projection.options)).toContain("No data available");
    next = edit({ ...c, local: next.local }, next.storage, {
      panel: "setup",
      edit: { kind: "series-add", id: "income" },
    });
    expect(
      selectHeatmapSession(next.storage, { ...c, local: next.local }).setup.seriesIds,
    ).toEqual(["income"]);
  });
  it("rejects Heatmap-only controls in other families and ordinary controls in Heatmap", () => {
    const c = fixture();
    expect(
      applyHeatmapSessionTransaction({}, c, {
        stamp: c.local.stamp,
        family: "heatmap",
        intent: { panel: "legend", edit: { field: "enabled", value: false } },
      }).status,
    ).toBe("stale");
    const ordinary = sessionFixture();
    expect(
      applyOrdinarySessionTransaction({}, ordinary, {
        stamp: ordinary.local.stamp,
        family: "groupedColumn",
        intent: { panel: "heatmapLine", edit: { field: "strokeWidth", value: 3 } },
      }).status,
    ).toBe("stale");
  });
});
