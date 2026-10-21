import { expect, it } from "vitest";
import { applyBoxPlotEditorTransaction } from "../../../src/components/General/Table/Chart/application/boxPlotEditorTransaction";
import { selectBoxPlotSession } from "../../../src/components/General/Table/Chart/application/boxPlotSessionSelection";
import { sessionFixture } from "./applicationSessionFixture";

it("writes original Box direction and whisker paths against latest storage", () => {
  const source = { ...sessionFixture() };
  source.capture = {
    ...source.capture,
    rows: source.capture.rows.map((row) => ({
      ...row,
      boxPlotAggregationKey: String(row.category),
    })),
  };
  const context = {
    ...source,
    inputs: { ...source.inputs, family: "boxPlot" as const },
    local: {
      ...source.local,
      baseline: {
        ...source.local.baseline,
        chartType: "boxPlot",
        model: { chartType: "boxPlot" },
      },
    },
  };
  const result = applyBoxPlotEditorTransaction({}, context, {
    family: "boxPlot",
    stamp: context.local.stamp,
    intent: { panel: "boxPlot", edit: { kind: "direction", value: "horizontal" } },
  });
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  expect(result.value.local.baseline.options).toMatchObject({
    "box-plot": { series: { direction: "horizontal" } },
  });
  expect(
    selectBoxPlotSession(result.value.storage, {
      ...context,
      local: result.value.local,
    }).bindings.category.direction,
  ).toBe("y");
});

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";

vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fixture(storage: any = {}) {
  const source = { ...sessionFixture() };
  const rows = [
    { id: "r1", period: "2024", other: "A", revenue: 100, income: 20 },
    { id: "r2", period: "2024", other: "B", revenue: 120, income: 25 },
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
    inputs: {
      ...source.inputs,
      api,
      family: "boxPlot" as "boxPlot" | "line" | "histogram",
    },
    rows,
    wrapper,
    owner: () => owner!,
  };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  if (
    session.projection.status !== "ready" ||
    session.projection.value.kind !== "boxPlot"
  )
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}
it("persists every original saved leaf, direction-dependent captions and serialized reopen", () => {
  const test = fixture({ chartOptions: { line: { series: { strokeWidth: 9 } } } });
  const { result, unmount } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const edits = [
    { kind: "whisker", field: "stroke", value: "#ff0000" },
    { kind: "whisker", field: "strokeWidth", value: 17 },
    { kind: "whisker", field: "strokeOpacity", value: 0.3 },
    { kind: "whisker", field: "lineDash", value: [42, 3] },
    { kind: "whisker", field: "lineDashOffset", value: -4 },
    { kind: "cap", value: 0.75 },
    { kind: "direction", value: "horizontal" },
  ] as const;
  for (const edit of edits) act(() => result.current.onBoxPlot(edit));
  act(() =>
    result.current.onIntent({
      panel: "titles",
      edit: { caption: "horizontalAxisTitle", field: "text", value: "USD" },
    }),
  );
  act(() =>
    result.current.onIntent({
      panel: "titles",
      edit: { caption: "horizontalAxisTitle", field: "enabled", value: true },
    }),
  );
  act(() =>
    result.current.onIntent({
      panel: "series",
      edit: { field: "strokeWidth", value: 6 },
    }),
  );
  act(() =>
    result.current.onIntent({
      panel: "axisLabels",
      axis: "category",
      edit: { field: "size", value: 19 },
    }),
  );
  act(() =>
    result.current.onIntent({
      panel: "grid",
      axis: "number",
      edit: { field: "enabled", value: false },
    }),
  );
  act(() =>
    result.current.onAxisStructure({
      panel: "axisStructure",
      axis: "category",
      edit: { field: "position", value: "right" },
    }),
  );
  const saved = JSON.parse(JSON.stringify(test.owner().widget.storage));
  expect(saved.partition.chartModel.chartOptions).toMatchObject({
    line: { series: { strokeWidth: 9 } },
    "box-plot": {
      series: {
        direction: "horizontal",
        strokeWidth: 6,
        whisker: {
          stroke: "#ff0000",
          strokeWidth: 17,
          strokeOpacity: 0.3,
          lineDash: [42, 3],
          lineDashOffset: -4,
        },
        cap: { lengthRatio: 0.75 },
      },
      axes: {
        number: {
          bottom: {
            title: { text: "USD", enabled: true },
            gridLine: { enabled: false },
          },
        },
        category: { left: { position: "right", label: { fontSize: 19 } } },
      },
    },
  });
  expect(ready(result.current).boxPlot.style.fields.revenue.whisker.lineDash).toEqual([
    42, 3,
  ]);
  expect(ready(result.current).boxPlot.style.axes.number.appearance.title.text).toBe(
    "USD",
  );
  expect(result.current.hostProps.projectNavigationWindow).toBe(
    ready(result.current).projectNavigationWindow,
  );
  unmount();
  const reopened = fixture(saved);
  const next = renderHook(useApplicationChartSession, {
    initialProps: reopened.inputs,
    wrapper: reopened.wrapper,
  });
  act(() => next.result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(next.result.current).boxPlot.style.fields.revenue).toMatchObject({
    strokeWidth: 6,
    whisker: { strokeWidth: 17, lineDashOffset: -4 },
  });
  expect(ready(next.result.current).boxPlot.style.direction).toBe("horizontal");
});
it("keeps latest external title/style writes while rejecting stale and foreign edits", () => {
  const test = fixture();
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const old = result.current.onBoxPlot;
  act(() =>
    test.owner().submit((previous) => ({
      ...previous,
      storage: {
        ...previous.storage,
        partition: {
          chartModel: {
            chartType: "boxPlot",
            chartOptions: {
              "box-plot": {
                title: { text: "Latest external title", enabled: true },
                series: { strokeWidth: 8, whisker: { strokeOpacity: 0.4 } },
              },
            },
          },
        },
      },
    })),
  );
  act(() => old({ kind: "cap", value: 0.8 }));
  expect(ready(result.current).boxPlot.style.application.title.text).toBe(
    "Latest external title",
  );
  expect(ready(result.current).boxPlot.style.fields.revenue).toMatchObject({
    strokeWidth: 8,
    whisker: { strokeOpacity: 0.4 },
    cap: { lengthRatio: 0.8 },
  });
  const before = JSON.stringify(test.owner().widget.storage);
  for (const intent of [
    { panel: "labels", edit: { field: "enabled", value: true } },
    { panel: "shadow", edit: { field: "enabled", value: true } },
    { panel: "markers", edit: { field: "size", value: 15 } },
    { panel: "histogram", edit: { kind: "binCount", value: 10 } },
    { panel: "pieLabel", label: "sectorLabel", edit: { field: "size", value: 21 } },
    { panel: "xy", edit: { kind: "paired", value: false } },
  ])
    act(() => result.current.onIntent(intent as any));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
  const stale = result.current.onBoxPlot;
  rerender({ ...test.inputs, dataRevision: 1 });
  act(() => stale({ kind: "cap", value: 0.2 }));
  expect(ready(result.current).boxPlot.controls.cap.lengthRatio).toBe(0.8);
  act(() => result.current.onChartType("line"));
  rerender({ ...test.inputs, family: "line" });
  const inactive = JSON.stringify(test.owner().widget.storage);
  act(() => result.current.onBoxPlot({ kind: "cap", value: 0.3 }));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(inactive);
  act(() => result.current.onChartType("boxPlot"));
  rerender(test.inputs);
  expect(ready(result.current).boxPlot.controls.cap.lengthRatio).toBe(0.8);
});
it("retains field order/category, zero selection recovery, navigation flags, resize and host failure", () => {
  const test = fixture({ chartNavigatorEnabled: true, chartMiniChartEnabled: true });
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() =>
    result.current.onSetup({ kind: "series-order", ids: ["income", "revenue"] }),
  );
  expect(
    ready(result.current).boxPlot.projection.fields.map((f) => f.descriptor.id),
  ).toEqual(["income", "revenue"]);
  act(() => result.current.onSetup({ kind: "category", value: "other" }));
  expect(
    ready(result.current).boxPlot.projection.groups.map((g) => g.category),
  ).toEqual(["A", "B"]);
  const before = ready(result.current);
  act(() => result.current.hostProps.onResize({ width: 900, height: 500 }));
  expect(ready(result.current).revision).toBeGreaterThan(before.revision);
  expect(ready(result.current).projectNavigationWindow).not.toBe(
    before.projectNavigationWindow,
  );
  for (const id of ["revenue", "income"])
    act(() => result.current.onSetup({ kind: "series-remove", id }));
  expect(ready(result.current).boxPlot.projection.fields).toEqual([]);
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  expect(ready(result.current).boxPlot.projection.fields[0].data).toHaveLength(2);
  act(() =>
    test.owner().submit((previous) => ({
      ...previous,
      storage: {
        ...previous.storage,
        chartNavigatorEnabled: false,
        chartMiniChartEnabled: false,
      },
    })),
  );
  expect((ready(result.current).options as any).dataZoom).toBeUndefined();
  act(() => result.current.hostProps.onError(Error("host failed")));
  expect(result.current.projection.status).toBe("invalid");
  rerender({ ...test.inputs, dataRevision: 2 });
  expect(result.current.projection.status).toBe("ready");
});
it("rejects malformed specialized numeric input and never persists it", () => {
  const test = fixture();
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const before = JSON.stringify(test.owner().widget.storage);
  for (const edit of [
    { kind: "cap", value: Number.NaN },
    { kind: "whisker", field: "strokeWidth", value: -1 },
    { kind: "whisker", field: "strokeOpacity", value: 2 },
    { kind: "whisker", field: "lineDash", value: [1, Number.POSITIVE_INFINITY] },
    { kind: "whisker", field: "lineDashOffset", value: "3" },
    { kind: "direction", value: "diagonal" },
  ])
    act(() => result.current.onBoxPlot(edit as any));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
});

it("clears effective manual rotation for Auto Rotate and restores it across direction and external edits", () => {
  const test = fixture({
    chartOptions: { "box-plot": { axes: { category: { label: { rotation: 37 } } } } },
  });
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(result.current).boxPlot.style.axes.category.labels.rotation).toBe(37);
  act(() =>
    result.current.onIntent({
      panel: "axisLabels",
      axis: "category",
      edit: { field: "rotation", value: 65 },
    }),
  );
  act(() =>
    result.current.onIntent({
      panel: "axisLabels",
      axis: "category",
      edit: { field: "autoRotate", value: true },
    }),
  );
  expect(ready(result.current).boxPlot.style.axes.category.labels).toMatchObject({
    autoRotate: true,
    rotation: undefined,
  });
  act(() => result.current.onBoxPlot({ kind: "direction", value: "horizontal" }));
  act(() =>
    result.current.onIntent({
      panel: "titles",
      edit: { caption: "title", field: "text", value: "External continuation" },
    }),
  );
  expect(
    ready(result.current).boxPlot.style.axes.category.labels.rotation,
  ).toBeUndefined();
  act(() =>
    result.current.onIntent({
      panel: "axisLabels",
      axis: "category",
      edit: { field: "autoRotate", value: false },
    }),
  );
  expect(ready(result.current).boxPlot.style.axes.category.labels).toMatchObject({
    autoRotate: false,
    rotation: 65,
  });
});

it("recaptures raw Date aggregation keys when changing from line to Box", () => {
  const test = fixture();
  test.inputs.family = "line";
  const read = vi.spyOn(test.inputs.api, "getCellValue");
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  if (result.current.projection.status !== "ready")
    throw Error(JSON.stringify(result.current.projection));
  const previousStamp = result.current.projection.stamp;
  expect(
    result.current.projection.value.snapshot.rows[0].boxPlotAggregationKey,
  ).toBeUndefined();
  const calls = read.mock.calls.length;
  test.rows[0].period = new Date("2024-01-01T00:00:00Z") as any;
  test.rows[1].period = new Date("2024-01-01T00:00:00Z") as any;
  act(() => result.current.onChartType("boxPlot"));
  rerender({ ...test.inputs, family: "boxPlot" });
  const current = ready(result.current);
  expect(current.stamp.dataRevision).toBeGreaterThan(previousStamp.dataRevision);
  expect(read.mock.calls.length).toBeGreaterThan(calls);
  expect(current.snapshot.rows.map((row) => row.boxPlotAggregationKey)).toEqual([
    String(test.rows[0].period),
    String(test.rows[1].period),
  ]);
  expect(current.boxPlot.projection.fields[0].data[0].summary?.median).toBe(110);
});

it("resets the host legend scope for external configured visibility edits and preserves normal style scope", () => {
  const test = fixture();
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const scope = ready(result.current).legendScope;
  act(() => result.current.onBoxPlot({ kind: "cap", value: 0.7 }));
  expect(ready(result.current).legendScope).toBe(scope);
  act(() =>
    result.current.onSetup({ kind: "series-order", ids: ["income", "revenue"] }),
  );
  expect(ready(result.current).legendScope).toBe(scope);
  act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
  expect(ready(result.current).legendScope).toBe(scope);
  act(() => result.current.onSetup({ kind: "series-add", id: "income" }));
  expect(ready(result.current).legendScope).toBe(scope);
  act(() =>
    test.owner().submit((previous) => ({
      ...previous,
      storage: {
        ...previous.storage,
        partition: {
          chartModel: {
            chartType: "boxPlot",
            chartOptions: { "box-plot": { series: { visible: false } } },
          },
        },
      },
    })),
  );
  expect(ready(result.current).legendScope).not.toBe(scope);
  expect(
    ready(result.current).boxPlot.projection.fields.map((field) => field.enabled),
  ).toEqual([false, false]);
  expect(ready(result.current).options.legend).toMatchObject({
    selected: { revenue: false, income: false },
  });
});
it("uses the original model-update path for direction and keeps stale direction notifications inert", () => {
  const test = fixture();
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() =>
    result.current.onIntent({
      panel: "legend",
      edit: { field: "enabled", value: false },
    }),
  );
  expect(ready(result.current).editor.legend.value.enabled).toBe(false);
  const before = ready(result.current).revision;
  act(() => result.current.onBoxPlot({ kind: "direction", value: "horizontal" }));
  expect(ready(result.current).revision).toBeGreaterThan(before + 1);
  expect(ready(result.current).editor.legend.value.enabled).toBe(true);
  expect(ready(result.current).options.legend).toMatchObject({ show: true });
  const old = result.current.onBoxPlot;
  rerender({ ...test.inputs, dataRevision: 1 });
  const fresh = ready(result.current).revision;
  act(() => old({ kind: "direction", value: "vertical" }));
  expect(ready(result.current).revision).toBe(fresh);
  expect(ready(result.current).boxPlot.style.direction).toBe("horizontal");
});
