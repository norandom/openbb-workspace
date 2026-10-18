import { act, cleanup, renderHook } from "@testing-library/react";
import { createContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useChartBarFillQuickAction,
  useChartCloseButtonListener,
  useChartQuickActions,
  useChartToolPanelAction,
} from "../../../src/components/General/Table/Chart/hooks/useChartOptions";
import { useAgExportFuncs } from "../../../src/components/General/Table/hooks/communityActions";

const context = vi.hoisted(() => ({
  widget: { storage: {} } as any,
  updateWidget: vi.fn(),
  chart: { current: null } as any,
  gridRef: { current: { api: { exportDataAsCsv: vi.fn() } } },
}));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => context }));
vi.mock("~/components/General/Table/hooks/useTableContext", () => ({
  useAgGridContext: () => ({
    gridRef: context.gridRef,
    applicationChartRef: context.chart,
  }),
  AgGridContext: createContext({ applicationChartRef: context.chart }),
}));
vi.mock("~/components/General/Table/Chart/utils", () => ({
  getSeriesType: (type: string) =>
    ["groupedColumn", "stackedColumn"].includes(type) ? "bar" : "line",
}));
beforeEach(() => {
  vi.clearAllMocks();
  context.widget = {
    storage: {
      chartView: { enabled: true },
      chartType: "groupedColumn",
      totalSeries: 1,
      unknown: { keep: true },
    },
  };
  context.chart.current = null;
  context.updateWidget.mockImplementation((update) => {
    context.widget = update(context.widget);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("existing chart action adapters", () => {
  it("uses validated ready metadata over another saved partition's root metadata", () => {
    context.widget.storage.chartType = "line";
    context.widget.storage.totalSeries = 2;
    const validateCurrent = vi.fn(() => ({ status: "ready" }));
    context.chart.current = {
      family: "groupedColumn",
      seriesCount: 1,
      stamp: {},
      validateCurrent,
    };
    const { result } = renderHook(() => useChartBarFillQuickAction());
    expect(result.current).toMatchObject({
      disabled: false,
      label: "Distinct bar colors",
    });
    act(() => {
      result.current!.onClick?.();
    });
    expect(context.widget.storage.chartBarFillEnabled).toBe(true);
    validateCurrent.mockReturnValue({ status: "stale" });
    act(() => {
      result.current!.onClick?.();
    });
    expect(context.widget.storage.chartBarFillEnabled).toBe(true);
  });
  it("uses original settings action and closes through the same persisted dock flag", () => {
    const { result } = renderHook(() => ({
      open: useChartToolPanelAction(),
      close: useChartCloseButtonListener(),
    }));
    expect(result.current.open[0]).toMatchObject({
      id: "open-chart-settings-button",
      label: "Chart settings",
      icon: "chart-rounded",
    });
    act(() => {
      result.current.open[0].onClick?.();
    });
    expect(context.widget.storage.chartSettingsOpen).toBe(true);
    act(() => {
      result.current.close();
    });
    expect(context.widget.storage.chartSettingsOpen).toBe(false);
    act(() => {
      result.current.open[0].onClick?.();
      result.current.open[0].onClick?.();
    });
    expect(context.widget.storage.chartSettingsOpen).toBe(false);
    expect(context.widget.storage.unknown).toEqual({ keep: true });
  });
  it("keeps original navigator labels and makes enabling flags mutually exclusive using latest state", () => {
    const { result, rerender } = renderHook(() => useChartQuickActions());
    expect(result.current.map((a) => [a.id, a.label])).toEqual([
      ["toggle-chart-navigator", "Show navigator"],
      ["toggle-chart-mini-chart", "Show mini chart"],
    ]);
    const [navigator, mini] = result.current;
    act(() => {
      navigator.onClick?.();
      mini.onClick?.();
    });
    expect(context.widget.storage).toMatchObject({
      chartNavigatorEnabled: false,
      chartMiniChartEnabled: true,
    });
    act(() => {
      mini.onClick?.();
    });
    expect(context.widget.storage.chartMiniChartEnabled).toBe(false);
    context.widget.storage.chartView.enabled = false;
    rerender();
    expect(result.current).toEqual([]);
  });
  it("preserves bar color eligibility and does not execute stale actions after a series or family change", () => {
    const { result, rerender } = renderHook(() => useChartBarFillQuickAction());
    expect(result.current).toMatchObject({
      id: "distinct-bar-colors",
      label: "Distinct bar colors",
      disabled: false,
    });
    const old = result.current!;
    act(() => {
      old.onClick?.();
      old.onClick?.();
    });
    expect(context.widget.storage.chartBarFillEnabled).toBe(false);
    context.widget.storage.totalSeries = 2;
    rerender();
    expect(result.current).toMatchObject({
      disabled: true,
      tooltipMessage: "Cannot toggle bar colors with multiple series present.",
    });
    act(() => {
      old.onClick?.();
    });
    expect(context.widget.storage.chartBarFillEnabled).toBe(false);
    context.widget.storage.chartType = "line";
    rerender();
    expect(result.current).toBeUndefined();
  });
});
describe("current chart PNG through the existing export menu", () => {
  function registration() {
    return {
      host: { exportImage: vi.fn(() => "data:image/png;base64,current") },
      stamp: { generation: 1 },
      revision: 42,
      validateCurrent: vi.fn(() => ({ status: "ready" })),
    };
  }
  it("downloads the current canvas with the original filename and keeps CSV", () => {
    const chart = registration();
    context.chart.current = chart;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("Revenue.png");
        expect(this.href).toBe("data:image/png;base64,current");
      });
    const { result } = renderHook(() => useAgExportFuncs());
    act(() => {
      result.current.pngFunction?.("Revenue");
    });
    expect(chart.validateCurrent).toHaveBeenCalledWith(chart.stamp);
    expect(chart.host.exportImage).toHaveBeenCalledWith(undefined, 42);
    expect(click).toHaveBeenCalledTimes(1);
    result.current.csvFunction("Revenue");
    expect(context.gridRef.current.api.exportDataAsCsv).toHaveBeenCalledWith({
      fileName: "Revenue.csv",
    });
  });
  it("refuses stale or missing registrations and does not fall back to a widget screenshot", () => {
    const chart = registration();
    chart.validateCurrent.mockReturnValue({ status: "stale" });
    context.chart.current = chart;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useAgExportFuncs());
    expect(() => result.current.pngFunction?.()).toThrow();
    expect(chart.host.exportImage).not.toHaveBeenCalled();
    context.chart.current = null;
    expect(() => result.current.pngFunction?.()).toThrow();
    expect(click).not.toHaveBeenCalled();
  });
  it("uses the current ready registration when a modal retains the callback through a redraw or remount", () => {
    const first = registration();
    context.chart.current = first;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useAgExportFuncs());
    const delayed = result.current.pngFunction!;
    const latest = registration();
    latest.revision = 99;
    context.chart.current = latest;
    delayed();
    expect(first.host.exportImage).not.toHaveBeenCalled();
    expect(latest.host.exportImage).toHaveBeenCalledWith(undefined, 99);
    expect(click).toHaveBeenCalledTimes(1);
    context.chart.current = null;
    expect(() => delayed()).toThrow();
    expect(click).toHaveBeenCalledTimes(1);
  });
});
