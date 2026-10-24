import { act, cleanup, renderHook } from "@testing-library/react";
import { init } from "echarts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyApplicationSetupTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionSetup";
import type { ApplicationChartFamily } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
import { applyNightingaleSessionTransaction } from "../../../src/components/General/Table/Chart/application/nightingaleSessionProjection";
import { applyRadialSessionTransaction } from "../../../src/components/General/Table/Chart/application/radialSessionProjection";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { sessionFixture } from "./applicationSessionFixture";
vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 7 }),
  } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fixture(family: ApplicationChartFamily, storage: any = {}) {
  const source = sessionFixture();
  const rows = [
    { id: "r1", period: "Q1", other: "A", revenue: 100, income: 20 },
    { id: "r2", period: "Q1", other: "B", revenue: -20, income: 25 },
    { id: "r3", period: "Q3", other: "C", revenue: null, income: 30 },
  ];
  const api: any = {
    isDestroyed: () => false,
    getGridOption: (k: string) => (k === "rowData" ? rows : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (i: number) => rows[i],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  };
  let owner: ReturnType<typeof useWidgetUpdates>;
  const wrapper = ({ children }: any) => {
    owner = useWidgetUpdates({
      initial: { id: "widget", storage, data: {} } as any,
      props: { uuid: "widget", activeDashboardId: "d" } as any,
      storeUpdateWidget: vi.fn(),
    });
    return (
      <WidgetTransactionContext.Provider value={owner.transactions}>
        {children}
      </WidgetTransactionContext.Provider>
    );
  };
  return {
    inputs: { ...source.inputs, api, family },
    rows,
    wrapper,
    owner: () => owner!,
  };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  if (
    session.projection.status !== "ready" ||
    (session.projection.value.kind !== "nightingale" &&
      session.projection.value.kind !== "radial")
  )
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}
it.each(["nightingale", "radialColumn", "radialBar"] as const)(
  "keeps %s values, controls, empty refresh and fresh reopen",
  (family) => {
    const test = fixture(family);
    const { result, rerender, unmount } = renderHook(
      useApplicationChartSession,
      {
        initialProps: test.inputs,
        wrapper: test.wrapper,
      },
    );
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    expect(
      ready(result.current).snapshot.rows.map((r) => r.values.revenue),
    ).toEqual([100, -20, null]);
    expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual([
      "Q1",
      "Q1",
      "Q3",
    ]);
    expect(ready(result.current).editor.groupType.value).toBe(
      family === "nightingale" ? "stacked" : "grouped",
    );
    act(() =>
      result.current.onIntent({
        panel:
          family === "nightingale" ? "nightingaleGroupType" : "radialGroupType",
        edit: { value: "normalized" },
      }),
    );
    act(() =>
      result.current.onIntent({
        panel:
          family === "nightingale" ? "nightingalePolarAxis" : "radialPolarAxis",
        edit: { field: "thickness", value: 3 },
      }),
    );
    act(() =>
      result.current.onIntent({
        panel:
          family === "nightingale"
            ? "nightingalePolarLabels"
            : "radialPolarLabels",
        edit: { field: "orientation", value: "parallel" },
      }),
    );
    expect(ready(result.current).editor.polarAxis.value.thickness).toBe(3);
    const stale = result.current.onIntent;
    act(() =>
      result.current.onSetup({ kind: "switch-category-series", value: true }),
    );
    expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual([
      "Revenue",
      "Income",
    ]);
    act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
    act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
    expect(ready(result.current).options.series).toEqual([]);
    rerender({ ...test.inputs, dataRevision: 1 });
    act(() =>
      stale({
        panel:
          family === "nightingale" ? "nightingalePolarAxis" : "radialPolarAxis",
        edit: { field: "thickness", value: 9 },
      }),
    );
    expect(ready(result.current).editor.polarAxis.value.thickness).toBe(3);
    act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
    expect(ready(result.current).options.series).not.toEqual([]);
    const storage = JSON.parse(JSON.stringify(test.owner().widget.storage));
    const key =
      family === "radialColumn"
        ? "radial-column"
        : family === "radialBar"
          ? "radial-bar"
          : family;
    expect(
      storage.partition.chartModel.chartOptions[key].axes[
        family === "radialBar" ? "angle-number" : "radius-number"
      ].line.width,
    ).toBe(3);
    unmount();
    const reopened = fixture(family, storage);
    const next = renderHook(useApplicationChartSession, {
      initialProps: reopened.inputs,
      wrapper: reopened.wrapper,
    });
    act(() =>
      next.result.current.hostProps.onResize({ width: 800, height: 500 }),
    );
    expect(
      ready(next.result.current).editor.polarAxis.value.labels.orientation,
    ).toBe("parallel");
    expect(
      ready(next.result.current).setupProps.value.switchCategorySeries,
    ).toBe(true);
    expect(ready(next.result.current).editor.groupType.value).toBe(
      "normalized",
    );
  },
);
it.each(["nightingale", "radialColumn", "radialBar"] as const)(
  "preserves native legend, resize and quick-action state while rejecting foreign controls (%s)",
  (family) => {
    const test = fixture(family, {
      chartNavigatorEnabled: true,
      chartMiniChartEnabled: true,
    });
    const { result } = renderHook(useApplicationChartSession, {
      initialProps: test.inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const chart = ready(result.current);
    const before = JSON.stringify(test.owner().widget.storage);
    for (const intent of [
      {
        panel: "axis",
        axis: "category",
        edit: { field: "color", value: "#000000" },
      },
      { panel: "pieSector", edit: { field: "positionRatio", value: 0.5 } },
      { panel: "markers", edit: { field: "enabled", value: true } },
      { panel: "shadow", edit: { field: "enabled", value: true } },
      { panel: "radarPolarAxis", edit: { field: "shape", value: "polygon" } },
    ])
      act(() => result.current.onIntent(intent as any));
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    const hidden = chart.projectLegendSelection!({ revenue: false }) as any;
    expect(hidden.legend.selected.revenue).toBe(false);
    expect(hidden.series[0].data.map((d: any) => d.category)).toEqual(
      family === "nightingale" ? ["Q1", "Q1"] : [],
    );
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    expect(chart.options.dataZoom).toBeUndefined();
    act(() => result.current.hostProps.onResize({ width: 900, height: 550 }));
    expect(ready(result.current).revision).toBeGreaterThan(chart.revision);
  },
);
it.each(["nightingale", "radialColumn", "radialBar"] as const)(
  "aggregates before inversion and formats counts without source currency (%s)",
  (family) => {
    const test = fixture(family);
    const { result } = renderHook(useApplicationChartSession, {
      initialProps: test.inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() => result.current.onSetup({ kind: "aggregate", value: true }));
    expect(ready(result.current).snapshot.rows[0].values).toEqual({
      revenue: 80,
      income: 45,
    });
    act(() =>
      result.current.onSetup({ kind: "aggregation-method", value: "count" }),
    );
    const chart = ready(result.current);
    const series = (chart.options.series as any[])[0];
    expect(series.data.map((d: any) => d.rawValue)).toEqual([2, 1]);
    const tooltip = (chart.options.tooltip as any).formatter({
      seriesId: series.id,
      data: series.data[0],
    });
    expect(tooltip).toContain("Revenue: 2");
    expect(tooltip).not.toContain("$");
    act(() =>
      result.current.onSetup({
        kind: "series-order",
        ids: ["income", "revenue"],
      }),
    );
    act(() =>
      result.current.onSetup({ kind: "switch-category-series", value: true }),
    );
    expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual([
      "Income",
      "Revenue",
    ]);
    expect(
      (ready(result.current).options.series as any[])[0].data.map(
        (d: any) => d.rawValue,
      ),
    ).toEqual([2, 2]);
  },
);
it.each(["nightingale", "radialColumn", "radialBar"] as const)(
  "ignores inactive Cartesian axis settings and retains Nightingale settings across family transitions (%s)",
  (family) => {
    const test = fixture(family, {
      partition: {
        chartModel: {
          chartType: family,
          qopenbbAxisSettings: { malformed: true },
        },
      },
    });
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: test.inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() =>
      result.current.onIntent({
        panel:
          family === "nightingale" ? "nightingalePolarAxis" : "radialPolarAxis",
        edit: { field: "innerRadiusRatio", value: 0.25 },
      }),
    );
    expect(ready(result.current).editor.polarAxis.value.innerRadiusRatio).toBe(
      0.25,
    );
    act(() => result.current.onChartType("line"));
    rerender({ ...test.inputs, family: "line" });
    expect(result.current.projection.status).toBe("ready");
    act(() => result.current.onChartType(family));
    rerender(test.inputs);
    expect(ready(result.current).editor.polarAxis.value.innerRadiusRatio).toBe(
      0.25,
    );
  },
);

it("commits root grouping without recapture and native geometry keeps raw missing observations", () => {
  const test = fixture("nightingale");
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const before = test.owner().transactions.scope!.value as any;
  act(() =>
    result.current.onIntent({
      panel: "nightingaleGroupType",
      edit: { value: "normalized" },
    }),
  );
  const after = test.owner().transactions.scope!.value as any;
  expect(after.capture.rows).toBe(before.capture.rows);
  expect(after.local.stamp.dataRevision).toBe(before.local.stamp.dataRevision);
  expect(after.local.stamp.renderRevision).toBeGreaterThan(
    before.local.stamp.renderRevision,
  );
  expect(
    (test.owner().widget.storage as any).partition.chartModel.seriesGroupType,
  ).toBe("normalized");
  const chart = ready(result.current);
  expect(chart.editor.groupType.value).toBe("normalized");
  const options = chart.options as any;
  expect(options.graphic.some((g: any) => g.style.text === "100")).toBe(true);
  expect(options.series[0].data.map((d: any) => d.rawValue)).toEqual([
    100, -20,
  ]);
  expect(
    options.tooltip.formatter({
      seriesId: "revenue",
      data: options.series[0].data[0],
    }),
  ).toContain("$100");
  const native = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    native.setOption(options);
    expect(native.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    const model = (native as any).getModel();
    expect(model.getSeriesByIndex(0).getData().count()).toBe(2);
    expect(
      model.getSeriesByIndex(0).getData().getItemGraphicEl(1).shape.r,
    ).toBeGreaterThan(0);
    expect(
      model.getSeriesByIndex(1).getData().getItemGraphicEl(2),
    ).toBeDefined();
    const hidden = chart.projectLegendSelection!({ income: false }) as any;
    expect(hidden.series[0].data[0].value[0]).toBe(100);
    native.setOption(hidden, { notMerge: true });
    expect(native.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    native.dispose();
  }
});
it.each([
  ["nightingale", false],
  ["nightingale", true],
  ["radialColumn", false],
  ["radialColumn", true],
  ["radialBar", false],
  ["radialBar", true],
] as const)(
  "rejects queued family and ordinary edits around root synchronization (sync=%s)",
  (family, synchronize) => {
    const test = fixture(family);
    const { result } = renderHook(useApplicationChartSession, {
      initialProps: test.inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const intent = result.current.onIntent;
    const setup = result.current.onSetup;
    const external = () =>
      test.owner().submit((widget: any) => ({
        ...widget,
        storage: {
          ...widget.storage,
          partition: {
            ...widget.storage.partition,
            chartModel: {
              ...widget.storage.partition?.chartModel,
              chartType: family,
              seriesGroupType: "stacked",
            },
          },
        },
      }));
    const stale = () => {
      intent({
        panel:
          family === "nightingale" ? "nightingaleGroupType" : "radialGroupType",
        edit: { value: "grouped" },
      });
      intent({
        panel:
          family === "nightingale" ? "nightingalePolarAxis" : "radialPolarAxis",
        edit: { field: "thickness", value: 9 },
      });
      setup({ kind: "aggregate", value: true });
    };
    if (synchronize) {
      act(external);
      act(stale);
    } else
      act(() => {
        external();
        stale();
      });
    const chart = ready(result.current);
    expect(chart.editor.groupType.value).toBe("stacked");
    expect(chart.editor.polarAxis.value.thickness).not.toBe(9);
    expect(chart.setupProps.value.aggregate).toBe(false);
  },
);

it("direct transactions preserve root neighbors and reject external Group Type presence or value changes", () => {
  const storage: any = {
    partition: {
      chartModel: {
        chartType: "nightingale",
        retained: { key: "value" },
        chartOptions: {
          nightingale: { series: { normalizedTo: 12 } },
          pie: { series: { strokeWidth: 7 } },
        },
      },
    },
  };
  const source = sessionFixture(storage);
  const context = {
    ...source,
    inputs: { ...source.inputs, family: "nightingale" as const },
  };
  const command: any = {
    family: "nightingale",
    stamp: context.local.stamp,
    intent: { panel: "nightingaleGroupType", edit: { value: "normalized" } },
  };
  const changed = applyNightingaleSessionTransaction(storage, context, command);
  expect(changed.status).toBe("ready");
  if (changed.status !== "ready") throw Error(JSON.stringify(changed));
  expect(changed.value.capture).toBe(context.capture);
  expect(changed.value.change).toBe("render");
  const model = (changed.value.storage.partition as any).chartModel;
  expect(model.retained).toEqual({ key: "value" });
  expect(model.chartOptions.nightingale.series.normalizedTo).toBe(12);
  expect(model.chartOptions.pie.series.strokeWidth).toBe(7);
  expect(storage.partition.chartModel.seriesGroupType).toBeUndefined();
  for (const value of [undefined, "stacked", "grouped"]) {
    const external = structuredClone(storage);
    external.partition.chartModel.seriesGroupType = value;
    expect(
      applyNightingaleSessionTransaction(external, context, command).status,
    ).toBe("stale");
    expect(
      applyApplicationSetupTransaction(external, context, command.stamp, {
        kind: "aggregate",
        value: true,
      }).status,
    ).toBe("stale");
  }
});

it.each(["nightingale", "radialColumn", "radialBar"] as const)(
  "keeps a ready empty refreshed capture and recovers the next data revision (%s)",
  (family) => {
    const test = fixture(family);
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: test.inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const old = [...test.rows];
    test.rows.splice(0);
    rerender({ ...test.inputs, dataRevision: 1 });
    expect(ready(result.current).snapshot.rows).toEqual([]);
    act(() =>
      result.current.onIntent({
        panel:
          family === "nightingale" ? "nightingaleGroupType" : "radialGroupType",
        edit: { value: "grouped" },
      }),
    );
    test.rows.push(...old);
    rerender({ ...test.inputs, dataRevision: 2 });
    expect(ready(result.current).snapshot.rows).toHaveLength(3);
    expect(ready(result.current).editor.groupType.value).toBe("grouped");
  },
);

it.each(["radialColumn", "radialBar"] as const)(
  "preserves %s grouping presence and rejects external root changes",
  (family) => {
    for (const root of [
      {},
      { seriesGroupType: undefined },
      { seriesGroupType: "grouped" },
    ]) {
      const key = family === "radialColumn" ? "radial-column" : "radial-bar";
      const storage: any = {
        partition: {
          chartModel: {
            chartType: family,
            ...root,
            retained: { key: "value" },
            chartOptions: {
              [key]: { series: { normalizedTo: 12 } },
              pie: { series: { strokeWidth: 7 } },
            },
          },
        },
      };
      const source = sessionFixture(storage);
      const context = { ...source, inputs: { ...source.inputs, family } };
      const command: any = {
        family,
        stamp: context.local.stamp,
        intent: {
          panel: "radialPolarAxis",
          edit: { field: "thickness", value: 3 },
        },
      };
      const changed = applyRadialSessionTransaction(storage, context, command);
      if (changed.status !== "ready") throw Error(JSON.stringify(changed));
      expect(changed.value.capture).toBe(context.capture);
      const model = (changed.value.storage.partition as any).chartModel;
      expect(Object.hasOwn(model, "seriesGroupType")).toBe(
        Object.hasOwn(root, "seriesGroupType"),
      );
      expect(model.seriesGroupType).toBe((root as any).seriesGroupType);
      expect(model.retained).toEqual({ key: "value" });
      expect(model.chartOptions[key].series.normalizedTo).toBe(12);
      expect(model.chartOptions.pie.series.strokeWidth).toBe(7);
      for (const other of [
        {},
        { seriesGroupType: undefined },
        { seriesGroupType: "grouped" },
        { seriesGroupType: "stacked" },
      ]) {
        const external = structuredClone(storage);
        delete external.partition.chartModel.seriesGroupType;
        Object.assign(external.partition.chartModel, other);
        const same =
          Object.hasOwn(root, "seriesGroupType") ===
            Object.hasOwn(other, "seriesGroupType") &&
          (root as any).seriesGroupType === (other as any).seriesGroupType;
        expect(
          applyRadialSessionTransaction(external, context, command).status,
        ).toBe(same ? "ready" : "stale");
        expect(
          applyApplicationSetupTransaction(external, context, command.stamp, {
            kind: "aggregate",
            value: true,
          }).status,
        ).toBe(same ? "ready" : "stale");
      }
    }
  },
);

it.each(["radialColumn", "radialBar"] as const)(
  "commits %s grouping as render-only with native raw observations",
  (family) => {
    const test = fixture(family);
    const { result } = renderHook(useApplicationChartSession, {
      initialProps: test.inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const before = test.owner().transactions.scope!.value as any;
    act(() =>
      result.current.onIntent({
        panel: "radialGroupType",
        edit: { value: "normalized" },
      }),
    );
    const after = test.owner().transactions.scope!.value as any;
    expect(after.capture.rows).toBe(before.capture.rows);
    expect(after.local.stamp.dataRevision).toBe(
      before.local.stamp.dataRevision,
    );
    expect(after.local.stamp.renderRevision).toBeGreaterThan(
      before.local.stamp.renderRevision,
    );
    const chart = ready(result.current);
    expect(chart.editor.groupType.value).toBe("normalized");
    expect(chart.snapshot.rows.map((r) => r.values.revenue)).toEqual([
      100,
      -20,
      null,
    ]);
    const options = chart.options as any;
    expect(
      options.tooltip.formatter({
        seriesId: "revenue",
        data: options.series[0].data[0],
      }),
    ).toContain("$100");
    const native = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 500,
    });
    try {
      native.setOption(options);
      expect(native.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      native.dispose();
    }
  },
);

it("rejects all Radial-only controls at the direct Histogram transaction boundary", async () => {
  const { applyHistogramEditorTransaction } = await import(
    "../../../src/components/General/Table/Chart/application/histogramEditorTransaction"
  );
  const storage = { partition: { chartModel: { chartType: "histogram" } } };
  const source = sessionFixture(storage);
  const context = {
    ...source,
    inputs: { ...source.inputs, family: "histogram" as const },
  };
  for (const intent of [
    { panel: "radialGroupType", edit: { value: "grouped" } },
    { panel: "radialPolarAxis", edit: { field: "thickness", value: 3 } },
    {
      panel: "radialPolarLabels",
      edit: { field: "orientation", value: "parallel" },
    },
  ] as const) {
    expect(
      applyHistogramEditorTransaction(storage, context, {
        family: "histogram",
        stamp: context.local.stamp,
        intent,
      }).status,
    ).toBe("stale");
  }
  expect(storage).toEqual({
    partition: { chartModel: { chartType: "histogram" } },
  });
});
