import { describe, expect, it, vi } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput as snapshot, validStyle } from "./snapshot.fixtures";

function mapped(
  family = "line",
  style = applicationStyle(),
  input = snapshot,
  context = mappingContext(),
): any {
  const result = translateCartesian(input, family, style, context);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  return result.options;
}
describe("application financial observations", () => {
  it("admits unknown units only with an explicit raw policy and changes no magnitudes", () => {
    const input = {
      ...snapshot,
      columns: snapshot.columns.map(({ unit, scale, ...column }) => column),
    };
    expect(translateCartesian(input, "line", validStyle).status).toBe("unsupported");
    expect(mapped("line", applicationStyle(), input).series[0].data).toEqual([
      123.456789, 0, -5.25,
    ]);
  });
  it.each([
    { unit: "EUR", scale: 1000000 },
    { unit: "USD", scale: 1 },
  ])("compares all declared metadata after an unknown first descriptor %j", (metadata) => {
    const input = {
      ...snapshot,
      selectedColumnIds: [...snapshot.selectedColumnIds, "third"],
      columns: [
        ...snapshot.columns.map((c) =>
          c.id === "revenue" ? { id: c.id, label: c.label, role: c.role } : c,
        ),
        {
          id: "third",
          label: "EUR",
          role: "number" as const,
          ...metadata,
        },
      ],
    };
    expect(translateCartesian(input, "line", validStyle, mappingContext()).status).toBe(
      "unsupported",
    );
  });
  it.each([
    { unit: "" },
    { unit: 5 },
    { scale: 0 },
    { scale: Number.NaN },
  ])("rejects malformed present metadata %j", (metadata) => {
    const input = {
      ...snapshot,
      columns: snapshot.columns.map((c) =>
        c.id === "costs" ? { ...c, ...metadata } : c,
      ),
    };
    expect(
      translateCartesian(input as any, "line", validStyle, mappingContext()).status,
    ).toBe("invalid");
  });
  it.each([
    ["grouped", { kind: "ordinary-aggregate", aggFunc: "sum" }],
    ["grouped", { kind: "ordinary-aggregate", aggFunc: "count" }],
    ["transformed", { kind: "ordinary-switch" }],
  ])("admits exactly source-backed setup %s", (sourceMode, setupProjection) => {
    expect(
      translateCartesian({ ...snapshot, sourceMode } as any, "line", validStyle, {
        ...mappingContext(),
        setupProjection,
      } as any).status,
    ).toBe("supported");
  });
  it.each([
    ["grouped", undefined],
    ["transformed", { kind: "ordinary-aggregate", aggFunc: "sum" }],
    ["grouped", { kind: "ordinary-aggregate", aggFunc: "median" }],
    ["pivot", { kind: "ordinary-switch" }],
    ["remote-page", { kind: "ordinary-switch" }],
    ["flat", { kind: "ordinary-switch" }],
  ])("rejects source/witness mismatch %s %j", (sourceMode, setupProjection) => {
    expect(
      translateCartesian({ ...snapshot, sourceMode } as any, "line", validStyle, {
        ...mappingContext(),
        setupProjection,
      } as any).status,
    ).not.toBe("supported");
  });
});
describe("full application renderer projection", () => {
  it("requires measured application geometry while leaving legacy fixture calls available", () => {
    const { viewport, ...context } = mappingContext();
    expect(
      translateCartesian(snapshot, "line", applicationStyle(), context),
    ).toMatchObject({
      status: "unsupported",
      diagnostics: [{ code: "missing-viewport" }],
    });
    expect(translateCartesian(snapshot, "line", validStyle).status).toBe("supported");
  });
  it("retains captions and disabled effects without drawing them", () => {
    const style = applicationStyle();
    style.application.title.enabled = false;
    style.application.background.visible = false;
    style.application.legend.enabled = false;
    style.application.tooltip.enabled = false;
    style.application.series.labels.enabled = false;
    style.application.series.shadow.enabled = false;
    style.application.series.markers.enabled = false;
    style.application.axes.category.title.enabled = false;
    style.application.axes.category.lineEnabled = false;
    style.application.axes.category.grid.enabled = false;
    style.application.axes.category.ticks.enabled = false;
    const options = mapped("line", style);
    expect(options).toMatchObject({
      title: { show: true, text: "", subtext: "Raw observations" },
      backgroundColor: "transparent",
      legend: { show: false },
      tooltip: { show: false },
      xAxis: {
        name: "",
        axisLine: { show: false },
        splitLine: { show: false },
        axisTick: { show: false },
      },
    });
    expect(options.series[0]).toMatchObject({
      showSymbol: false,
      label: { show: false },
      itemStyle: { shadowBlur: 0, shadowOffsetX: 0, shadowColor: "transparent" },
    });
    expect(style.application.title.text).toBe("Financials");
    expect(style.application.series.markers).toMatchObject({
      shape: "circle",
      size: 9,
    });
  });
  it("keeps marker-to-text, horizontal and vertical legend gaps independent", () => {
    const original = mapped().legend;
    for (const field of [
      "itemSpacing",
      "horizontalSpacing",
      "verticalSpacing",
    ] as const) {
      const style = applicationStyle();
      style.application.legend[field] += 10;
      const changed = mapped("line", style).legend;
      const indices =
        field === "verticalSpacing" ? [0, 2] : [field === "itemSpacing" ? 3 : 1];
      expect(changed.itemGap).toBe(0);
      for (let i = 0; i < 4; i++)
        expect(changed.textStyle.padding[i]).toBe(
          original.textStyle.padding[i] +
            (indices.includes(i) ? 10 / indices.length : 0),
        );
    }
  });
  it("uses retained manual rotation, and rotates automatically only when measured labels overlap", () => {
    const style = applicationStyle();
    style.application.axes.category.labels.rotation = undefined;
    style.application.axes.category.labels.autoRotate = true;
    expect(mapped("line", style).xAxis.axisLabel.rotate).toBe(0);
    const narrow = { ...mappingContext(), viewport: { width: 100, height: 500 } };
    expect(mapped("line", style, snapshot, narrow).xAxis.axisLabel.rotate).toBe(25);
    style.application.axes.category.labels.autoRotate = false;
    expect(mapped("line", style, snapshot, narrow).xAxis.axisLabel.rotate).toBe(0);
    style.application.axes.category.labels.rotation = 0;
    expect(mapped("line", style, snapshot, narrow).xAxis.axisLabel.rotate).toBe(-0);
  });
  it("applies series opacities independently and multiplies existing color alpha", () => {
    const style = applicationStyle();
    style.series.revenue = { fill: "rgba(10,20,30,0.5)", stroke: "rgba(40,50,60,0.5)" };
    expect(mapped("groupedColumn", style).series[0].itemStyle).toMatchObject({
      color: "rgba(10,20,30,0.3)",
      borderColor: "rgba(40,50,60,0.2)",
    });
  });
  it("interprets time/number categories without changing raw series observations or duplicate association", () => {
    const style = applicationStyle();
    style.application.axes.category.fields.type = "time";
    style.application.axes.category.fields.timeFormat = "%d %B %Y";
    const options = mapped("line", style);
    expect(options.xAxis.type).toBe("time");
    expect(options.xAxis.axisLabel.formatter(Date.parse("2026-03-31T12:00:00"))).toBe(
      "31 March 2026",
    );
    expect(options.series[0].data).toEqual([
      [Date.parse("2026-03-31"), 123.456789],
      [Date.parse("2026-03-31"), 0],
      [Date.parse("2025-12-31"), -5.25],
    ]);
    style.application.axes.category.fields.type = "number";
    const input = {
      ...snapshot,
      rows: snapshot.rows.map((r, i) => ({ ...r, category: i + 1 })),
    };
    expect(mapped("line", style, input).series[0].data).toEqual([
      [1, 123.456789],
      [2, 0],
      [3, -5.25],
    ]);
  });
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ])("renders complete caption/layout/series styles for %s", (family) => {
    const options = mapped(family);
    expect(options.backgroundColor).toBe("#fafafa");
    expect(options.title).toMatchObject({
      text: "Financials",
      subtext: "Raw observations",
      textStyle: { fontFamily: "Verdana", fontWeight: 700, fontStyle: "italic" },
      subtextStyle: { fontSize: 12 },
      itemGap: 9,
    });
    expect(options.grid).toMatchObject({
      left: 23,
      right: 21,
      bottom: 22,
      containLabel: false,
      outerBoundsContain: "all",
    });
    expect(options.legend).toMatchObject({
      show: true,
      top: 68,
      orient: "horizontal",
      itemWidth: 15,
      itemHeight: 15,
      itemStyle: { borderWidth: 2 },
    });
    expect(options.series[0]).toMatchObject({
      label: { show: true, fontSize: 12, fontWeight: 700 },
      itemStyle: { shadowBlur: 4, shadowOffsetX: -2, shadowOffsetY: 3 },
    });
    if (family === "line")
      expect(options.series[0]).toMatchObject({
        connectNulls: true,
        symbolSize: 9,
        showSymbol: true,
        lineStyle: { opacity: 0.4, type: [5, 2] },
        itemStyle: { borderWidth: 2 },
      });
    else
      expect(options.series[0]).toMatchObject({
        itemStyle: { borderType: [5, 2], borderWidth: 2 },
      });
  });
  it("renders axes independently and passes raw callback inputs", () => {
    const context = mappingContext();
    const numericAxis = vi.fn(context.display.numericAxis);
    const options = mapped("line", applicationStyle(), snapshot, {
      ...context,
      display: { ...context.display, numericAxis },
    });
    expect(options.xAxis).toMatchObject({
      type: "category",
      position: "bottom",
      name: "Period",
      axisLine: { show: true, lineStyle: { color: "#123456", width: 2 } },
      axisTick: { show: true, length: 7, lineStyle: { width: 2, color: "#56789a" } },
      splitLine: { show: true, lineStyle: { color: ["#456789"], width: 3, type: [4] } },
      axisLabel: { rotate: -30, margin: 8 },
    });
    expect(options.xAxis.axisLabel.formatter("1")).toBe("period:2026-03-31");
    expect(options.yAxis.axisLabel.formatter(-5.25)).toBe("axis:-5.25");
    expect(numericAxis).toHaveBeenCalledWith(-5.25);
    expect(options.series[0].label.formatter({ dataIndex: 2, value: -5.25 })).toBe(
      "label:-5.25",
    );
    expect(options.series[1].label.formatter({ dataIndex: 1, value: null })).toBe("");
    expect(options.legend.formatter("revenue")).toBe("legend:Amount");
  });
  it.each([
    "single",
    "shared",
    "compact",
  ])("projects %s tooltip grouping and escapes formatter output", (mode) => {
    const style = applicationStyle();
    style.application.tooltip = { enabled: true, mode };
    const context = mappingContext();
    const tooltipNumber = vi.fn((value: number) => `<b>${value}</b>`);
    const options = mapped("line", style, snapshot, {
      ...context,
      display: { ...context.display, tooltipNumber },
    });
    expect(options.tooltip.trigger).toBe(mode === "shared" ? "axis" : "item");
    const html = options.tooltip.formatter([{ dataIndex: 0, seriesId: "revenue" }]);
    expect(html).toContain("&lt;b&gt;123.456789&lt;/b&gt;");
    expect(html.includes("number:-40.125")).toBe(false);
    expect(html.includes("&lt;b&gt;-40.125&lt;/b&gt;")).toBe(mode === "shared");
    expect(html.includes("period:2026-03-31")).toBe(mode !== "compact");
    expect(tooltipNumber).toHaveBeenCalledWith(123.456789);
  });
  it.each([
    "square",
    "circle",
    "cross",
    "diamond",
    "plus",
    "triangle",
    "heart",
  ])("supports retained original %s line markers", (shape) => {
    const style = applicationStyle();
    style.application.series.markers = { ...style.application.series.markers, shape };
    expect(mapped("line", style).series[0].symbol).toBeTruthy();
  });
  it.each([
    {},
    { title: null },
    { legendMarkerStrokeWidth: -1 },
    { series: {} },
    { axes: {} },
    { tooltip: { enabled: true, mode: "invalid" } },
  ])("rejects incomplete application detail rather than silently ignoring it %j", (patch) => {
    const style = applicationStyle();
    const application = Object.keys(patch).length
      ? { ...style.application, ...patch }
      : {};
    expect(
      translateCartesian(snapshot, "line", { ...style, application }, mappingContext())
        .status,
    ).toBe("invalid");
  });
});
