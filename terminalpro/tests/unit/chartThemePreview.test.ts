import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { init } from "echarts";
import { ChartSettings } from "../../src/components/ThemeSettings/ChartSettings";
import { ChartThemePreviewHost } from "../../src/components/ThemeSettings/chartThemePreviewHost";
import { buildChartPreview } from "../../src/components/ThemeSettings/chartThemePreview";
import { resolvePreviewAppearance } from "../../src/components/ThemeSettings/chartThemePreviewAppearance";
import {
  getThemeDefaults,
  serializeChartTheme,
} from "../../src/components/ThemeSettings/chartThemeState";

const viewport = { width: 1000, height: 600 };
const build = (state = getThemeDefaults("light"), mode: "light" | "dark" = "light") =>
  buildChartPreview(state, mode, viewport);

const host = vi.hoisted(() => ({
  props: undefined as any,
  settings: undefined as any,
}));
vi.mock("../../src/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: (props: any) => {
    host.props = props;
    return createElement("div", { "data-testid": "native-host" });
  },
}));
vi.mock("../../src/components/ThemeSettings/useChartSettings", () => ({
  useChartSettings: () => host.settings,
}));
vi.mock("../../src/components/ThemeSettings/ChartPaletteControls", () => ({
  ChartPaletteControls: () => null,
}));
vi.mock("../../src/components/ThemeSettings/ChartParameterControls", () => ({
  ChartParameterControls: () => null,
}));
vi.mock("../../src/components/ThemeSettings/ThemeSettingsLayout", () => ({
  ThemeSettingsLayout: (props: any) =>
    createElement(
      "div",
      null,
      props.preview,
      createElement("button", { onClick: props.onSave }, "Save Theme"),
    ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("native chart settings preview", () => {
  it("retains shared tooltip rows only for two or three configured series, on exact bar targets", () => {
    const state = getThemeDefaults("light");
    state.fills = state.fills.slice(0, 3);
    state.strokes = state.strokes.slice(0, 3);
    const result = build(state);
    const tooltip = result.options.tooltip as any;
    const point = {
      seriesIndex: 0,
      dataIndex: 1,
      name: "Mary",
      seriesName: "Number of Looks (TM)",
      value: 57,
    };
    expect(tooltip.trigger).toBe("item");
    const html = tooltip.formatter(point);
    expect(html).toContain("Number of Looks (YM)");
    expect(html).toContain("Interaction Duration (TM)");
    expect(html).toContain("93");
    const projected = result.projectLegendSelection({
      "Number of Looks (YM)": false,
    }) as any;
    expect(projected.tooltip.formatter(point)).not.toContain("Number of Looks (YM)");
    expect((result.options.series as any[])[0].emphasis.itemStyle.color).not.toBe(
      state.fills[0],
    );
  });
  it("keeps the exact sample, fill ordering and two-pixel strokes", () => {
    const state = getThemeDefaults("light");
    const result = build(state);
    const series = result.options.series as any[];
    expect(result.keyboardNavigation.categories).toEqual([
      "Peter",
      "Mary",
      "Mercutio",
      "Ada",
    ]);
    expect(series.slice(0, 4).map((s) => s.data)).toEqual([
      [60, 57, 238, 237],
      [64, 93, 217, 217],
      [120, 135, 140, 110],
      [86, 259, 145, 147],
    ]);
    expect(series[4].data).toEqual([40, 60, 40, 60]);
    expect(series[5].data).toEqual([70, 50, 70, 50]);
    expect(series.map((s) => s.itemStyle.color)).toEqual(state.fills);
    expect(series.map((s) => s.itemStyle.borderColor)).toEqual(state.strokes);
    expect(series.every((s) => s.itemStyle.borderWidth === 2)).toBe(true);
    expect(result.options.animation).toBe(false);
    expect(result.options).not.toHaveProperty("axisPointer");
  });
  it("replaces palette series without inventing data for persisted empty arrays", () => {
    const state = getThemeDefaults("light");
    state.fills = state.fills.slice(0, 1);
    state.strokes = state.strokes.slice(0, 1);
    expect(build(state).options.series).toHaveLength(1);
    expect(build(state).legendPagination).toBeUndefined();
    state.fills = [];
    state.strokes = [];
    expect(build(state).options.series).toEqual([]);
    expect(build(state).keyboardNavigation.series).toEqual([]);
  });
  it("maps core typography, title scaling, grid, axis and explicit color precedence", () => {
    const state = getThemeDefaults("light");
    const initial = build(state).options as any;
    expect(initial.textStyle).toMatchObject({
      fontFamily: "Verdana, sans-serif",
      fontSize: 12,
      fontWeight: 400,
      color: "#181d1f",
    });
    expect(initial.title.textStyle.fontSize).toBe(17);
    Object.assign(state, {
      fontFamily: "Georgia",
      fontSize: 24,
      fontWeight: "700",
      textColor: "red",
      foregroundColor: "green",
      axisColor: "blue",
      gridLineColor: "pink",
    });
    const options = build(state).options as any;
    expect(options.title.textStyle).toMatchObject({
      fontFamily: "Georgia",
      fontSize: 34,
      fontWeight: 700,
      color: "red",
    });
    expect(options.xAxis.axisLabel).toMatchObject({
      fontFamily: "Georgia",
      fontSize: 24,
      color: "red",
    });
    expect(options.xAxis.axisLine.lineStyle.color).toBe("blue");
    expect(options.yAxis.splitLine.lineStyle.color).toBe("pink");
    expect(options.yAxis.axisLine.show).toBe(false);
    expect(options.xAxis.axisTick.show).toBe(false);
    expect(options.xAxis.splitLine.show).toBe(false);
  });
  it("applies outer Padding, including zero, without rewriting the draft", () => {
    const state = getThemeDefaults("light");
    expect((build(state).options.grid as any).right).toBe(20);
    state.padding = 0;
    const zero = build(state).options as any;
    state.padding = 40;
    const forty = build(state).options as any;
    expect(zero.grid.right).toBe(0);
    expect(forty.grid.right).toBe(40);
    expect(forty.title.top - zero.title.top).toBe(40);
    expect(forty.grid.top - zero.grid.top).toBe(40);
    expect(serializeChartTheme(state).params.padding).toBe(40);
    for (const invalid of [-1, NaN, Infinity]) {
      state.padding = invalid;
      expect(() => build(state)).toThrow(/Padding/);
      expect(Object.is(state.padding, invalid)).toBe(true);
    }
  });
  it("resolves chrome independently of textColor, while inheriting typography", () => {
    const state = getThemeDefaults("light");
    Object.assign(state, {
      textColor: "red",
      foregroundColor: "green",
      fontFamily: "Georgia",
      fontSize: 20,
      fontWeight: "600",
    });
    expect(resolvePreviewAppearance(state, "light").chrome).toMatchObject({
      color: "green",
      fontFamily: "Georgia",
      fontSize: 20,
      fontWeight: 600,
    });
    Object.assign(state, {
      chromeTextColor: "blue",
      chromeBackgroundColor: "pink",
      chromeFontFamily: "Arial",
      chromeFontSize: 14,
      chromeFontWeight: "900",
      borderColor: "purple",
      chromeSubtleTextColor: "orange",
    });
    const options = build(state).options as any;
    expect(options.tooltip).toMatchObject({
      backgroundColor: "pink",
      borderColor: "purple",
      textStyle: { color: "blue", fontFamily: "Arial", fontSize: 14, fontWeight: 900 },
    });
    const html = options.tooltip.formatter({
      seriesName: "<bad>",
      name: "Peter",
      value: 60,
      color: "red",
      seriesIndex: 0,
      dataIndex: 0,
    });
    expect(html).toContain("Peter");
    expect(html).toContain("&lt;bad&gt;");
    expect(html).toContain("60");
    expect(html).toContain("data-chart-theme-tooltip");
    expect(html).not.toContain("footer");
    expect(html).toContain("purple");
  });
  it("maps conditional focus and pager colors, with grid wrapping before paging", () => {
    const state = getThemeDefaults("light");
    Object.assign(state, {
      accentColor: "red",
      chromeBackgroundColor: "pink",
      subtleTextColor: "gray",
      foregroundColor: "green",
      textColor: "blue",
    });
    const result = build(state);
    expect(result.keyboardNavigation.focus).toMatchObject({
      color: "red",
      backgroundColor: "pink",
    });
    expect(result.legendPagination?.interaction).toMatchObject({
      focusColor: "red",
      focusBackgroundColor: "pink",
      pageInactiveColor: "gray",
    });
    expect(result.legendPagination?.pages).toHaveLength(1);
    const narrow = buildChartPreview(state, "light", { width: 280, height: 220 });
    expect(narrow.legendPagination!.pages.length).toBeGreaterThan(1);
    expect(narrow.legendPagination!.interaction).toMatchObject({
      pageActiveColor: "green",
      pageInactiveColor: "gray",
    });
    const graphics = narrow.options.graphic as any[];
    const pager = narrow.legendPagination!.pager;
    expect(graphics.find((item) => item.id === pager.previousId).style.fill).toBe(
      "gray",
    );
    expect(graphics.find((item) => item.id === pager.nextId).style.fill).toBe("green");
    expect(graphics.find((item) => item.id === pager.counterId).style.fill).toBe(
      "blue",
    );
  });
  it("uses identical explicit grouping geometry for render, selection and keyboard", () => {
    const result = build();
    const options = result.options as any;
    const projected = result.projectLegendSelection({
      "Number of Looks (TM)": false,
    }) as any;
    const geometry = result.keyboardNavigation.geometry;
    expect(options.series[0].barWidth).toBe(geometry.barWidth);
    expect(options.series[0].barGap).toBe(`${geometry.barGap * 100}%`);
    expect(projected.series[0].barWidth).toBe(geometry.barWidth);
    expect(projected.legend[0].selected["Number of Looks (TM)"]).toBe(false);
  });
  it("keeps latent input, crosshair and image settings out of native display", () => {
    const state = getThemeDefaults("dark");
    const initial = build(state, "dark").options;
    Object.assign(state, {
      inputBackgroundColor: "red",
      inputTextColor: "blue",
      crosshairLabelBackgroundColor: "pink",
      crosshairLabelTextColor: "green",
    });
    state.backgroundImage.enabled = true;
    state.backgroundImage.url = "saved-logo";
    expect(JSON.stringify(build(state, "dark").options)).toEqual(
      JSON.stringify(initial),
    );
    expect(serializeChartTheme(state)).toMatchObject({
      params: { inputBackgroundColor: "red", crosshairLabelTextColor: "green" },
      backgroundImage: { url: "saved-logo" },
    });
    state.backgroundColor = "";
    expect(build(state, "dark").options.backgroundColor).toBe("transparent");
  });
  it("rejects unsupported paints, malformed colors and invalid numeric geometry without mutation", () => {
    const state = getThemeDefaults("light");
    (state.fills as any[])[0] = { type: "gradient", colorStops: [] };
    expect(() => build(state)).toThrow(/unsupported.*paint/i);
    expect(typeof serializeChartTheme(state).palette.fills[0]).toBe("object");
    state.fills[0] = "#oops";
    expect(() => build(state)).toThrow(/color/i);
    state.fills[0] = "red";
    state.fontSize = NaN;
    expect(() => build(state)).toThrow(/Font Size/);
  });

  it("mounts the actual native option and exposes the exact tooltip through public actions", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const chart = init(container, undefined, {
      renderer: "svg",
      width: 1000,
      height: 600,
    });
    try {
      chart.setOption(build().options, { notMerge: true });
      chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: 2 });
      expect(container.querySelector("[data-chart-theme-tooltip]")?.textContent).toBe(
        "MercutioNumber of Looks (TM)238",
      );
      chart.setOption(
        buildChartPreview(
          { ...getThemeDefaults("light"), fills: ["red"], strokes: ["black"] },
          "light",
          viewport,
        ).options,
        { notMerge: true },
      );
      expect(chart.getOption().series as any[]).toHaveLength(1);
    } finally {
      chart.dispose();
      container.remove();
    }
  });
});

describe("preview wrapper lifetime contract", () => {
  it("uses stable session/mode scopes and increasing revisions for actual viewport changes", () => {
    const state = getThemeDefaults("light");
    const view = render(createElement(ChartThemePreviewHost, { state, mode: "light" }));
    const initial = host.props;
    act(() => host.props.onResize({ width: 700, height: 400 }));
    expect(host.props.revision).toBeGreaterThan(initial.revision);
    expect(host.props.legendScope).toBe(initial.legendScope);
    const resizedRevision = host.props.revision;
    act(() => host.props.onResize({ width: 700, height: 400 }));
    expect(host.props.revision).toBe(resizedRevision);
    view.rerender(
      createElement(ChartThemePreviewHost, {
        state: getThemeDefaults("dark"),
        mode: "dark",
      }),
    );
    expect(host.props.legendScope).not.toBe(initial.legendScope);
    expect(host.props.revision).toBeGreaterThan(resizedRevision);
    expect(screen.getAllByTestId("native-host")).toHaveLength(1);
  });
  it("shows invalid draft errors, preserves Save and recovers with a fresh request", () => {
    host.settings = {
      state: { ...getThemeDefaults("light"), padding: -1 },
      themeMode: "light",
      handleSave: vi.fn(),
    };
    const view = render(createElement(ChartSettings));
    expect(screen.getByRole("alert").textContent).toMatch(/Padding/);
    expect(screen.getByRole("button", { name: "Save Theme" })).not.toBeDisabled();
    expect(host.settings.state.padding).toBe(-1);
    view.unmount();
    const recover = render(
      createElement(ChartThemePreviewHost, {
        state: getThemeDefaults("light"),
        mode: "light",
      }),
    );
    const previous = host.props;
    act(() => host.props.onError(new Error("renderer failed")));
    expect(screen.getByRole("alert").textContent).toContain("renderer failed");
    expect(screen.queryByTestId("native-host")).toBeNull();
    recover.rerender(
      createElement(ChartThemePreviewHost, {
        state: { ...getThemeDefaults("light"), padding: 0 },
        mode: "light",
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(host.props.revision).toBeGreaterThan(previous.revision);
    act(() => previous.onError(new Error("stale failure")));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => host.props.onError(new Error("current failure")));
    act(() => previous.onError(new Error("stale masking failure")));
    expect(screen.getByRole("alert").textContent).toContain("current failure");
  });
  it("retains the existing 300 ms draft debounce", () => {
    vi.useFakeTimers();
    host.settings = {
      state: getThemeDefaults("light"),
      themeMode: "light",
      handleSave: vi.fn(),
    };
    const view = render(createElement(ChartSettings));
    expect(host.props.options.grid.right).toBe(20);
    host.settings = {
      ...host.settings,
      state: { ...host.settings.state, padding: 40 },
    };
    view.rerender(createElement(ChartSettings));
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(host.props.options.grid.right).toBe(20);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(host.props.options.grid.right).toBe(40);
  });
});
