import { describe, expect, it } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import {
  validSnapshotInput as snapshot,
  validStyle as style,
} from "./snapshot.fixtures";

function options(family = "line", input = snapshot, styling: unknown = style) {
  const result = translateCartesian(input, family, styling);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw new Error("Expected supported options");
  return result.options;
}

describe("resolved Cartesian financial mapping", () => {
  it.each([
    "groupedColumn",
    "stackedColumn",
  ])("projects explicit widths as bar borders for %s", (family) => {
    expect(options(family).series).toMatchObject([
      { itemStyle: { borderWidth: 2 } },
      { itemStyle: { borderWidth: 1 } },
    ]);
  });
  it("returns invalid for throwing style accessors and proxies", () => {
    const throwing = () => {
      throw new Error("unsafe style");
    };
    for (const input of [
      Object.defineProperty({}, "background", { get: throwing }),
      new Proxy({}, { get: throwing }),
    ]) {
      expect(translateCartesian(snapshot, "line", input)).toMatchObject({
        status: "invalid",
        diagnostics: [{ path: ["style"] }],
      });
    }
  });
  it("reports exact unit metadata field paths", () => {
    const columns = snapshot.columns.map((column) =>
      column.id === "costs" ? { ...column, scale: 1 } : column,
    );
    expect(translateCartesian({ ...snapshot, columns }, "line", style)).toMatchObject({
      status: "unsupported",
      diagnostics: [{ path: ["columns", 2, "scale"] }],
    });
  });
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ])("preserves values and IDs for %s", (family) => {
    const mapped = options(family);
    expect(mapped.series).toMatchObject([
      {
        id: "revenue",
        name: "revenue",
        type: family === "line" ? "line" : "bar",
        data: [123.456789, 0, -5.25],
      },
      { id: "costs", name: "costs", data: [-40.125, null, null] },
    ]);
    const series = mapped.series as { stack?: string; stackStrategy?: string }[];
    expect(series.map((item) => item.stack)).toEqual(
      family === "stackedColumn" ? ["total", "total"] : [undefined, undefined],
    );
    if (family === "stackedColumn")
      expect(series.map((item) => item.stackStrategy)).toEqual([
        "samesign",
        "samesign",
      ]);
  });
  it("projects every explicit style and uses distinct legend identities", () => {
    const mapped = options();
    expect(mapped).toMatchObject({
      backgroundColor: "#ffffff",
      color: style.palette,
      textStyle: { color: style.textColor, fontFamily: style.fontFamily, fontSize: 12 },
      title: { text: style.title },
      legend: { show: true, bottom: 0, data: ["revenue", "costs"] },
    });
    const legend = mapped.legend as { formatter: (name: string) => string };
    expect(legend.formatter("revenue")).toBe("Amount");
    expect(legend.formatter("costs")).toBe("Amount");
    expect(mapped.series).toMatchObject([
      { itemStyle: { color: "#145da0" }, lineStyle: { width: 2 } },
      { itemStyle: { color: "#b33b32" }, lineStyle: { width: 1 } },
    ]);
  });
  it("keeps duplicate categories ordinal and displays their original labels", () => {
    const mapped = options();
    const axis = mapped.xAxis as {
      data: string[];
      axisLabel: { formatter: (value: string) => string };
    };
    expect(axis.data).toEqual(["0", "1", "2"]);
    expect(axis.data.map(axis.axisLabel.formatter)).toEqual(
      snapshot.rows.map((row) => row.category),
    );
    const tooltip = mapped.tooltip as { formatter: (params: unknown) => string };
    expect(
      tooltip.formatter([{ dataIndex: 0, seriesId: "revenue", value: 123.456789 }]),
    ).toContain("2026-03-31");
    expect(
      tooltip.formatter([{ dataIndex: 0, seriesId: "revenue", value: 123.456789 }]),
    ).toContain("123.46");
  });
  it("binds overrides to IDs after selection reorder and does not mutate input", () => {
    const before = JSON.stringify(snapshot);
    expect(
      options("line", {
        ...snapshot,
        selectedColumnIds: ["costs", "period", "revenue"],
      }).series,
    ).toMatchObject([
      { id: "costs", itemStyle: { color: "#b33b32" } },
      { id: "revenue", itemStyle: { color: "#145da0" } },
    ]);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(options("line").series).not.toMatchObject([{ stack: "total" }]);
  });
  it.each([
    "pie",
    "Line",
    "",
    "stackedBar",
  ])("rejects unknown family %s without options", (family) => {
    expect(translateCartesian(snapshot, family, style)).toMatchObject({
      status: "unsupported",
      diagnostics: [{ path: ["family"] }],
    });
  });
  it.each([
    "transformed",
    "grouped",
    "pivot",
    "remote-page",
  ] as const)("rejects %s source", (sourceMode) => {
    expect(translateCartesian({ ...snapshot, sourceMode }, "line", style).status).toBe(
      "unsupported",
    );
  });
  it.each([
    { unit: undefined },
    { unit: "EUR" },
    { scale: undefined },
    { scale: 0 },
    { scale: -1 },
    { scale: Number.NaN },
    { scale: 1 },
  ])("rejects unknown/incompatible units %j", (change) => {
    const columns = snapshot.columns.map((column) =>
      column.id === "costs" ? { ...column, ...change } : column,
    );
    expect(translateCartesian({ ...snapshot, columns }, "line", style).status).toBe(
      "unsupported",
    );
  });
  it.each([
    null,
    {},
    { ...style, palette: [] },
    { ...style, palette: [3] },
    { ...style, background: 3 },
    { ...style, textColor: null },
    { ...style, fontFamily: false },
    { ...style, fontSize: -1 },
    { ...style, fontSize: Number.POSITIVE_INFINITY },
    { ...style, precision: -1 },
    { ...style, precision: 21 },
    { ...style, precision: 1.5 },
    { ...style, legend: { visible: 1, position: "top" } },
    { ...style, legend: { visible: true, position: "center" } },
    { ...style, title: 3 },
    { ...style, series: [] },
    { ...style, series: { revenue: null } },
    { ...style, series: { revenue: { lineWidth: -1 } } },
    { ...style, series: { revenue: { lineWidth: Number.NaN } } },
    { ...style, series: { revenue: { color: 3 } } },
  ])("rejects malformed style without partial options", (styling) => {
    const result = translateCartesian(snapshot, "line", styling);
    expect(result.status).toBe("invalid");
    expect(result).not.toHaveProperty("options");
  });
  it.each([
    "top",
    "bottom",
    "left",
    "right",
  ] as const)("projects %s legend and zero dimensions", (position) => {
    expect(
      options("line", snapshot, {
        ...style,
        fontSize: 0,
        precision: 20,
        title: "",
        legend: { visible: false, position },
        series: { revenue: { lineWidth: 0 } },
      }),
    ).toMatchObject({
      legend: { show: false, [position]: 0 },
      textStyle: { fontSize: 0 },
      title: { text: "" },
      series: [{ lineStyle: { width: 0 } }, {}],
    });
  });
  it("uses supplied palette and display precision without changing data", () => {
    const mapped = options("line", snapshot, {
      ...style,
      palette: ["red", "blue"],
      precision: 0,
      title: undefined,
      series: {},
    });
    expect(mapped.color).toEqual(["red", "blue"]);
    expect(mapped.title).toBeUndefined();
    expect(mapped.series).toMatchObject([{ data: [123.456789, 0, -5.25] }, {}]);
    const tooltip = mapped.tooltip as { formatter: (params: unknown) => string };
    expect(tooltip.formatter({ dataIndex: 0 })).toContain("Amount: 123");
    expect(tooltip.formatter({ dataIndex: 1 })).toContain("Amount: 0");
    expect(tooltip.formatter({ dataIndex: 1 })).toContain("Amount: —");
    expect(tooltip.formatter({ dataIndex: 2 })).toContain("2025-12-31");
  });
  it("accepts homogeneous dimensionless values and numeric categories", () => {
    const input = {
      ...snapshot,
      columns: snapshot.columns.map((column) =>
        column.role === "number"
          ? { ...column, unit: "dimensionless", scale: 1 }
          : column,
      ),
      rows: [{ id: "zero", category: 0, values: { revenue: 0, costs: -1 } }],
    };
    const mapped = options("groupedColumn", input);
    const axis = mapped.xAxis as {
      axisLabel: { formatter: (value: string) => string };
    };
    expect(axis.axisLabel.formatter("0")).toBe("0");
    expect(mapped.series).toMatchObject([{ data: [0] }, { data: [-1] }]);
  });
  it("escapes category and series display labels in HTML tooltips", () => {
    const mapped = options("line", {
      ...snapshot,
      columns: snapshot.columns.map((column) => ({ ...column, label: "<Amount>" })),
      rows: [{ id: "html", category: "<img>", values: { revenue: 1 } }],
    });
    const tooltip = mapped.tooltip as { formatter: (params: unknown) => string };
    expect(tooltip.formatter({ dataIndex: 0 })).toContain(
      "&lt;img&gt;<br/>&lt;Amount&gt;: 1.00",
    );
  });
});
