import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartViewElement } from "../../../src/components/General/Table/Chart/AgChartView";
import { waterfallControlValues } from "../../../src/components/General/Table/Chart/application/waterfallEditorControls";
import { selectWaterfallSession } from "../../../src/components/General/Table/Chart/application/waterfallSessionSelection";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { useCallerDock } from "../../../src/components/General/Table/Chart/caller/useCallerDock";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import { sessionFixture } from "./applicationSessionFixture";

const hooks = vi.hoisted(() => ({
  inputs: vi.fn(),
  session: vi.fn(),
  updateWidget: vi.fn(),
  updateAgGrid: vi.fn(),
  applicationChartRef: { current: null },
  chartViewElementRef: { current: null },
}));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({
    widget: { id: "widget", storage: { chartSettingsOpen: true } },
    updateWidget: hooks.updateWidget,
  }),
}));
vi.mock("~/components/General/Table/hooks/useTableContext", () => ({
  useAgGridContext: () => hooks,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  useApplyColumnState: () => vi.fn(),
}));
vi.mock("~/components/General/Table/Chart/caller/useCallerSessionInputs", () => ({
  useCallerSessionInputs: hooks.inputs,
}));
vi.mock(
  "~/components/General/Table/Chart/application/useApplicationChartSession",
  () => ({ useApplicationChartSession: hooks.session }),
);
vi.mock("~/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: forwardRef(() => <div data-testid="chart-host" />),
}));
vi.mock("~/components/DraggableCard/SetLoadingOnResize", () => ({
  SetLoadingOnResize: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/components/Widgets/UnsupportedRenderer", () => ({
  default: ({ reason }: { reason: string }) => <div>{reason}</div>,
}));
vi.mock("~/components/Icon", () => ({ default: () => null }));
vi.mock("~/components/Tooltip", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/hooks/useIsMobile", () => ({ default: () => false }));
vi.mock("~/lib/utils", () => ({
  cn: (...values: unknown[]) =>
    values.filter((value) => typeof value === "string").join(" "),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function props() {
  const context = sessionFixture();
  const selected = selectWaterfallSession(
    {},
    {
      ...context,
      inputs: {
        ...context.inputs,
        family: "waterfall",
        theme: projectCallerTheme("light", [], {}, "waterfall"),
      },
      local: {
        ...context.local,
        baseline: { ...context.local.baseline, chartType: "waterfall" },
      },
    },
  );
  return {
    open: true,
    onOpenChange: vi.fn(),
    activeTab: "customize" as const,
    onTabChange: vi.fn(),
    themeResetKey: "openbb-light",
    galleryProps: { groups: [], selectedType: "waterfall", onSelect: vi.fn() },
    state: selected.editor,
    mode: {
      kind: "waterfall" as const,
      controls: waterfallControlValues(selected.appearance),
      onEdit: vi.fn(),
    },
    onIntent: vi.fn(),
    onAxisStructure: vi.fn(),
    setupProps: {
      value: {
        categoryId: "period",
        aggregate: false,
        aggregationMethod: "sum",
        switchCategorySeries: false,
        series: [
          { id: "revenue", label: "Revenue" },
          { id: "income", label: "Income" },
        ],
      },
      categories: [{ value: "period", label: "Period" }],
      aggregationMethods: [],
      onEdit: vi.fn(),
    },
  };
}

it("routes Waterfall gallery selection through the existing session callback", () => {
  const onSelect = vi.fn();
  const { result } = renderHook(() => useCallerDock("groupedColumn", onSelect));
  result.current.galleryProps.onSelect("waterfall");
  expect(onSelect).toHaveBeenCalledWith("waterfall");
  expect(hooks.updateWidget).not.toHaveBeenCalled();
  result.current.galleryProps.onSelect("rangeBar");
  expect(onSelect).toHaveBeenLastCalledWith("rangeBar");
});

it("replaces ordinary Series controls and retains tooltip modes and sign edits", () => {
  const input = props();
  render(<ApplicationChartEditor {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  const series = within(screen.getByRole("region", { name: "Series" }));
  expect(series.getByRole("group", { name: "Connector Line" })).toBeTruthy();
  expect(
    series.getAllByRole("spinbutton", { name: "Stroke Width value" }),
  ).toHaveLength(2);
  expect(series.getAllByRole("switch", { name: "Labels" })).toHaveLength(1);
  for (const name of ["Shadow", "Markers", "Connect Missing Data"])
    expect(series.queryByRole("switch", { name })).toBeNull();
  fireEvent.change(series.getByRole("combobox", { name: "Series Item" }), {
    target: { value: "negative" },
  });
  fireEvent.change(
    within(series.getByRole("group", { name: "Series Items" })).getByRole(
      "spinbutton",
      { name: "Fill Opacity value" },
    ),
    { target: { value: "0.35" } },
  );
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "item",
    sign: "negative",
    field: "fillOpacity",
    value: 0.35,
  });
  const tooltip = series.getByRole("combobox", { name: "Tooltip Mode" });
  expect(
    within(tooltip)
      .getAllByRole("option")
      .map((option) => option.getAttribute("value")),
  ).toEqual(["single", "shared", "compact"]);
  fireEvent.change(tooltip, { target: { value: "compact" } });
  expect(input.onIntent).toHaveBeenLastCalledWith({
    panel: "tooltips",
    edit: { field: "mode", value: "compact" },
  });
});

it("places direction in Set Up while retaining all source series and suppressing inversion", () => {
  const input = props();
  render(<ApplicationChartEditor {...input} activeTab="setup" />);
  expect(screen.getByRole("combobox", { name: "Category" })).toBeTruthy();
  expect(screen.getByText("Revenue")).toBeTruthy();
  expect(screen.getByText("Income")).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Switch Category / Series" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
    target: { value: "horizontal" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "direction",
    value: "horizontal",
  });
  expect(input.setupProps.onEdit).not.toHaveBeenCalled();
});

it("retains common captions, legend, chrome and numeric category axis selection", () => {
  render(<ApplicationChartEditor {...props()} />);
  for (const name of [
    "Titles",
    "Legend",
    "Chart Style",
    "Horizontal Axis",
    "Vertical Axis",
  ])
    fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.getByRole("switch", { name: "Horizontal Axis Title" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Vertical Axis Title" })).toBeTruthy();
  expect(screen.getByLabelText("Axis Type")).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Ticks" })).toBeNull();
  expect(screen.getAllByRole("switch", { name: "Grid Lines" })).toHaveLength(2);
});

it.each([
  0, 1,
])("admits the caller with %i series and passes its specialized edit callback into the existing dock", (seriesCount) => {
  const input = props();
  const context = sessionFixture();
  const onWaterfall = vi.fn();
  hooks.inputs.mockReturnValue({
    valid: true,
    value: { ...context.inputs, family: "waterfall" },
  });
  hooks.session.mockReturnValue({
    chartType: "waterfall",
    seriesCount,
    hostKey: "waterfall",
    hostProps: {},
    onWaterfall,
    onIntent: input.onIntent,
    onSetup: input.setupProps.onEdit,
    onAxisStructure: input.onAxisStructure,
    projection: {
      status: "ready",
      value: {
        kind: "waterfall",
        family: "waterfall",
        editor: input.state,
        waterfall: { controls: input.mode.controls },
        setupProps: input.setupProps,
        options: { series: [{ data: seriesCount ? [100, 120] : [] }] },
      },
    },
  });
  render(<ChartViewElement />);
  expect(screen.getByTestId("chart-host")).toBeTruthy();
  expect(Boolean(screen.queryByText("No data available to be charted."))).toBe(
    seriesCount === 0,
  );
  expect(hooks.updateWidget).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
    target: { value: "horizontal" },
  });
  expect(onWaterfall).toHaveBeenLastCalledWith({
    kind: "direction",
    value: "horizontal",
  });
});
