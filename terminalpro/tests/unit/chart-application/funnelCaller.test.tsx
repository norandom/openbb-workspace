import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createElement, forwardRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  session: null as any,
  updates: vi.fn(),
  applicationChartRef: { current: null as any },
  mode: "light",
  themes: {} as Record<string, unknown>,
  widget: {
    id: "funnel-caller",
    storage: {
      chartSettingsOpen: true,
      chartView: { enabled: true },
      default: {
        chartModel: {
          chartType: "coneFunnel",
          cellRange: {
            columns: ["stage", "value", "reserve"],
            rowStartIndex: 0,
            rowEndIndex: 1,
          },
          chartOptions: { "cone-funnel": { series: { direction: "horizontal" } } },
        },
        chartRange: {
          columns: ["stage", "value", "reserve"],
          rowStartIndex: 0,
          rowEndIndex: 1,
        },
      },
    },
    data: {},
  },
}));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({
    widget: fixture.widget,
    widgetFromJSON: {},
    updateWidget: fixture.updates,
  }),
}));
vi.mock("~/lib/state/theme", () => ({
  useShallowThemeStore: (selector: any) =>
    selector({ theme: fixture.mode, decimalDigits: 2 }),
}));
vi.mock("~/lib/state/tableChartThemes", () => ({
  useShallowTableChartThemesStore: (selector: any) => selector(fixture.themes),
}));
vi.mock("~/lib/utils", () => ({
  cn: (...values: any[]) => values.filter((v) => typeof v === "string").join(" "),
  formatNumber: (v: number) => String(v),
  formatNumberMagnitude: (v: number) => String(v),
}));
vi.mock("../../../src/components/General/Table/hooks/constants", () => ({
  customCssPart: {},
  getDefaultAgGridTheme: () => ({}),
}));
vi.mock("../../../src/components/General/Table/hooks/useTableContext", () => ({
  useAgGridContext: () => ({
    applicationChartRef: fixture.applicationChartRef,
    updateAgGrid: () => {},
    chartViewElementRef: { current: null },
    gridState: {
      gridReady: false,
      columnDefs: [
        { field: "stage", chartDataType: "category" },
        { field: "value", chartDataType: "series", cellDataType: "number" },
        { field: "reserve", chartDataType: "series", cellDataType: "number" },
      ],
      rowData: [{ stage: "Revenue", value: 100, reserve: 50 }],
    },
    gridRef: { current: null },
  }),
}));
vi.mock("~/lib/constants", () => ({ CHART_TYPE_TO_SERIES_TYPE: {} }));
vi.mock("~/components/General/Table/AgGridUtils", () => ({
  isDate: () => false,
  isDateTime: () => false,
}));

import { useCallerSessionInputs } from "../../../src/components/General/Table/Chart/caller/useCallerSessionInputs";

vi.mock("~/components/DraggableCard/SetLoadingOnResize", () => ({
  SetLoadingOnResize: ({ children }: any) => children,
}));
vi.mock("~/components/Icon", () => ({ default: () => null }));
vi.mock("~/components/Tooltip", () => ({
  default: ({ children, message }: any) =>
    createElement("span", { title: message }, children),
}));
vi.mock("~/hooks/useIsMobile", () => ({ default: () => false }));
vi.mock("../../../src/components/General/Table/hooks/useUpdateColumnState", () => ({
  useApplyColumnState: () => () => {},
}));
vi.mock("../../../src/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: forwardRef((_props: any, _ref: any) =>
    createElement("div", { "data-testid": "funnel-host" }),
  ),
}));
vi.mock(
  "../../../src/components/General/Table/Chart/application/useApplicationChartSession",
  () => ({ useApplicationChartSession: () => fixture.session }),
);

import {
  ChartViewButton,
  ChartViewElement,
} from "../../../src/components/General/Table/Chart/AgChartView";
import { resolveFunnelAppearance } from "../../../src/components/General/Table/Chart/application/funnelAppearance";
import { projectFunnelEditorState } from "../../../src/components/General/Table/Chart/application/funnelEditor";

afterEach(cleanup);
it.each([
  { fills: [{ type: "image", image: "retained-image" }], strokes: ["#123456"] },
  { fills: [{ type: "gradient", stops: [] }], strokes: ["#123456"] },
  { fills: [{ type: "pattern", pattern: "retained-pattern" }], strokes: ["#123456"] },
  { fills: ["not-a-color"], strokes: ["#123456"] },
  { fills: [], strokes: ["#123456"] },
])("retains selected family and stored payload on invalid palette %j, then restores inputs in supported mode", (palette) => {
  fixture.mode = "light";
  fixture.themes = {
    light: { chartTheme: { baseTheme: "ag-default", palette, params: {} } },
    dark: { chartTheme: null },
  };
  const before = structuredClone({ widget: fixture.widget, themes: fixture.themes });
  const view = renderHook(() => useCallerSessionInputs());
  expect(view.result.current).toMatchObject({ valid: false, chartType: "coneFunnel" });
  if (view.result.current.valid) throw Error("Invalid palette was admitted");
  expect(view.result.current.error).toMatch(/Invalid Funnel theme|Advanced Funnel/);
  expect({ widget: fixture.widget, themes: fixture.themes }).toEqual(before);
  fixture.mode = "dark";
  view.rerender();
  expect(view.result.current.valid).toBe(true);
  if (!view.result.current.valid) throw Error(view.result.current.error);
  expect(view.result.current.value).toMatchObject({
    family: "coneFunnel",
    chartType: "coneFunnel",
    range: {
      columnIds: ["stage", "value", "reserve"],
      rowStartIndex: 0,
      rowEndIndex: 1,
    },
    funnelThemePaint: { family: "coneFunnel" },
  });
  expect(view.result.current.value.funnelThemePaint?.fills).toHaveLength(8);
  expect({ widget: fixture.widget, themes: fixture.themes }).toEqual(before);
});
it("renders the unsupported status with gallery/table recovery and restores the real editor on a supported mode", () => {
  fixture.mode = "light";
  fixture.themes = {
    light: {
      chartTheme: {
        baseTheme: "ag-default",
        palette: { fills: [{ type: "image", image: "retained" }] },
        params: {},
      },
    },
    dark: { chartTheme: null },
  };
  fixture.updates.mockClear();
  const before = structuredClone({ widget: fixture.widget, themes: fixture.themes });
  const appearance = resolveFunnelAppearance(
    {
      baseline: { stateAddress: "a", chartType: "coneFunnel", model: {}, options: {} },
      generated: {},
      precision: 2,
      theme: {
        name: "openbb-dark",
        mode: "dark",
        colors: {
          base: "ag-default-dark",
          foregroundColor: "#ffffff",
          backgroundColor: "#000000",
          textColor: "#ffffff",
          chartBackgroundColor: "#000000",
        },
        overrides: {},
        palette: { fills: ["#123456"], strokes: ["#654321"] },
      },
      themePaint: {
        family: "coneFunnel",
        fills: ["#123456"],
        strokes: ["#654321"],
        numericLabelColor: "#ffffff",
        stageLabelColor: "#ffffff",
        dropOffFill: "#aaaaaa",
        dropOffStroke: "#bbbbbb",
      },
    },
    "coneFunnel",
  );
  if (!appearance.valid) throw Error(appearance.error);
  fixture.session = {
    chartType: "coneFunnel",
    seriesCount: 2,
    hostKey: "retained",
    hostProps: {},
    onChartType: vi.fn(),
    onIntent: vi.fn(),
    onSetup: vi.fn(),
    validateCurrent: vi.fn(),
    projection: {
      status: "ready",
      value: {
        kind: "funnel",
        family: "coneFunnel",
        stamp: {},
        revision: 1,
        editor: projectFunnelEditorState(appearance.value),
        options: {},
        setupProps: {
          value: {
            categoryId: "stage",
            aggregate: false,
            aggregationMethod: "sum",
            switchCategorySeries: false,
            series: [
              { id: "value", label: "Value" },
              { id: "reserve", label: "Reserve" },
            ],
          },
          categories: [{ value: "stage", label: "Stage" }],
          aggregationMethods: [],
        },
      },
    },
  };
  const view = render(
    <>
      <ChartViewButton />
      <ChartViewElement />
    </>,
  );
  expect(screen.getByRole("status").textContent).toMatch(
    /Advanced Funnel.*saved configuration is preserved/i,
  );
  expect(screen.getByRole("button", { name: "Cone Funnel. Selected" })).toBeTruthy();
  expect(document.querySelector("#chart-view-button")?.hasAttribute("disabled")).toBe(
    false,
  );
  fireEvent.click(document.querySelector("#chart-view-button")!);
  expect(fixture.updates).toHaveBeenCalledOnce();
  const changed = fixture.updates.mock.calls[0][0](fixture.widget);
  expect(changed.storage.chartView.enabled).toBe(false);
  expect(fixture.widget.storage.chartView.enabled).toBe(true);
  fixture.mode = "dark";
  view.rerender(
    <>
      <ChartViewButton />
      <ChartViewElement />
    </>,
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByTestId("funnel-host")).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole("combobox", { name: "Direction" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Value" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Reserve" })).toBeTruthy();
  expect({ widget: fixture.widget, themes: fixture.themes }).toEqual(before);
});
