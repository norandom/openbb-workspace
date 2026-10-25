import { init } from "echarts";
import { describe, expect, it } from "vitest";
import type { HeatmapMappingInput } from "../../../src/components/General/Table/Chart/application/heatmapTypes";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import { fallbackDisplay } from "../../../src/components/General/Table/Chart/echarts/cartesianDisplay";
import { measureText } from "../../../src/components/General/Table/Chart/echarts/cartesianLayout";
import { translateHeatmap } from "../../../src/components/General/Table/Chart/echarts/heatmap";
import {
  fitHeatmapLabel,
  heatmapColor,
  heatmapGeometry,
} from "../../../src/components/General/Table/Chart/echarts/heatmapCells";
import {
  heatmapChrome,
  projectHeatmapHover,
} from "../../../src/components/General/Table/Chart/echarts/heatmapChrome";

function heatmapFixture(): HeatmapMappingInput {
  const font = {
    font: "Arial",
    size: 12,
    color: "#222",
    weight: "normal",
    fontWeight: "normal",
    fontStyle: "normal",
  };
  const caption = { ...font, enabled: false, text: "", spacing: 5 };
  const axis = {
    fields: {
      type: "category",
      position: "bottom",
      color: "#333",
      thickness: 2,
      timeFormat: "",
    },
    title: caption,
    labels: { ...font, padding: 4, autoRotate: true, rotation: undefined },
    grid: { enabled: false, color: "#ddd", thickness: 1, lineDash: 0 },
    gridStyles: [],
    lineEnabled: true,
    ticks: { enabled: true, color: "#333", width: 1, length: 5 },
  };
  const p = projectOrdinarySetup(
    {
      stateAddress: "hm",
      dataRevision: 1,
      sourceMode: "flat",
      originalModel: {},
      selectedRange: {},
      selectedColumnIds: ["c", "v"],
      categoryColumnId: "c",
      columns: [
        { id: "c", label: "Category", role: "category" },
        { id: "v", label: "Value", role: "number" },
      ],
      rows: [
        { id: "a", category: "Same", values: { v: -10 } },
        { id: "b", category: "Same", values: { v: 0 } },
        { id: "c", category: "Other", values: { v: 20 } },
        { id: "d", category: "Missing", values: { v: null } },
      ],
    },
    { categoryId: "c", seriesIds: ["v"], switchCategorySeries: false },
  );
  if (p.status !== "ready") throw Error("fixture");
  return {
    projection: p.value,
    context: { display: fallbackDisplay(2), viewport: { width: 600, height: 400 } },
    style: {
      family: "heatmap",
      application: {
        title: caption,
        subtitle: caption,
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        background: { visible: true, fill: "#fff" },
        tooltip: { enabled: true, mode: "single" },
      },
      axes: { x: axis, y: axis },
      colorRange: ["#ffa03a", "#e1cc00", "#459d55"],
      gradientLegend: {
        enabled: true,
        position: "right",
        reverseOrder: false,
        spacing: 20,
        gradient: { thickness: 16, preferredLength: 200 },
        label: font,
      },
      series: {
        stroke: "#111",
        strokeWidth: 2,
        strokeOpacity: 1,
        itemPadding: 2,
        textAlign: "center",
        verticalAlign: "middle",
        label: {
          ...font,
          enabled: true,
          minimumFontSize: 8,
          wrapping: "never",
          overflowStrategy: "hide",
        },
      },
    },
  };
}
function option(input = heatmapFixture()) {
  const result = translateHeatmap(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result.options;
}
describe("inactive heatmap renderer", () => {
  it("fits numeric labels, hides overflow and supports ellipsis", () => {
    const i = heatmapFixture();
    expect(fitHeatmapLabel(i, "123456789", 1, 20)).toBeUndefined();
    const ellipsis = {
      ...i,
      style: {
        ...i.style,
        series: {
          ...i.style.series,
          label: { ...i.style.series.label, overflowStrategy: "ellipsis" as const },
        },
      },
    };
    expect(fitHeatmapLabel(ellipsis, "123456789", 3, 20)?.text).toContain("…");
    expect(fitHeatmapLabel(i, "0", 100, 30)?.text).toBe("0");
  });
  it("bounds every wrapped ellipsis line and hyphenated line", () => {
    const i = heatmapFixture();
    for (const wrapping of ["on-space", "hyphenate"] as const) {
      const label = {
        ...i.style.series.label,
        wrapping,
        overflowStrategy: "ellipsis" as const,
        minimumFontSize: 12,
      };
      const input = {
        ...i,
        style: { ...i.style, series: { ...i.style.series, label } },
      };
      const result = fitHeatmapLabel(input, "123456789012345 a bb c", 5, 100);
      expect(result).toBeDefined();
      for (const line of result?.text.split("\n") ?? [])
        expect(
          measureText(line, { ...label, size: result?.size ?? 12 }).width,
        ).toBeLessThanOrEqual(5);
      expect(
        fitHeatmapLabel(
          {
            ...input,
            style: {
              ...input.style,
              series: {
                ...input.style.series,
                label: { ...label, overflowStrategy: "hide" as const },
              },
            },
          },
          "123456789012345",
          1,
          100,
        ),
      ).toBeUndefined();
    }
  });
  it("reserves rotated x-label height and full y-label title clearance", () => {
    const i = heatmapFixture();
    const long = "Very long financial metric caption ".repeat(8);
    const input = {
      ...i,
      projection: {
        ...i.projection,
        snapshot: {
          ...i.projection.snapshot,
          columns: i.projection.snapshot.columns.map((c) =>
            c.role === "number" ? { ...c, label: long } : c,
          ),
          rows: i.projection.snapshot.rows.map((row) => ({ ...row, category: long })),
        },
      },
      style: {
        ...i.style,
        axes: {
          x: { ...i.style.axes.x, labels: { ...i.style.axes.x.labels, rotation: 90 } },
          y: {
            ...i.style.axes.y,
            title: { ...i.style.axes.y.title, enabled: true, text: "Rows" },
          },
        },
      },
    };
    const c = heatmapChrome(input);
    const o = option(input) as any;
    const labelWidth = measureText(long, i.style.axes.x.labels).width;
    expect(
      input.context.viewport.height - c.plot.y - c.plot.height,
    ).toBeGreaterThanOrEqual(labelWidth);
    expect(o.yAxis.nameGap).toBeGreaterThanOrEqual(
      measureText(long, i.style.axes.y.labels).width,
    );
    expect(o.xAxis.axisLabel.rotate).toBe(-90);
  });
  it("positions all four gradient legends within the viewport", () => {
    const i = heatmapFixture();
    for (const position of ["top", "bottom", "left", "right"] as const) {
      const c = heatmapChrome({
        ...i,
        style: { ...i.style, gradientLegend: { ...i.style.gradientLegend, position } },
      });
      expect(c.legend?.vertical).toBe(position === "left" || position === "right");
      expect(c.plot.width).toBeGreaterThan(0);
      expect(c.plot.height).toBeGreaterThan(0);
      expect(c.legend?.x).toBeGreaterThanOrEqual(0);
      expect(c.legend?.y).toBeGreaterThanOrEqual(0);
    }
  });
  it("reports no selected numeric series in native SVG", () => {
    const i = heatmapFixture();
    const input = {
      ...i,
      projection: {
        ...i.projection,
        snapshot: { ...i.projection.snapshot, selectedColumnIds: [] },
      },
    };
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 600,
      height: 400,
    });
    try {
      chart.setOption(option(input));
      expect(chart.renderToSVGString()).toContain("No data available to be charted");
    } finally {
      chart.dispose();
    }
  });
  it("rejects nonfinite and negative geometry without partial options", () => {
    const i = heatmapFixture();
    expect(
      translateHeatmap({
        ...i,
        context: {
          ...i.context,
          viewport: { width: Number.POSITIVE_INFINITY, height: 400 },
        },
      }).status,
    ).toBe("invalid");
    expect(
      translateHeatmap({
        ...i,
        style: { ...i.style, series: { ...i.style.series, strokeWidth: -1 } },
      }).status,
    ).toBe("invalid");
  });
  it("keeps constant and all-missing matrices finite in actual SVG", () => {
    const i = heatmapFixture();
    for (const value of [5, null]) {
      const projection = {
        ...i.projection,
        snapshot: {
          ...i.projection.snapshot,
          rows: i.projection.snapshot.rows.map((row) => ({
            ...row,
            values: { v: value },
          })),
        },
      };
      const input = { ...i, projection };
      const chart = init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 600,
        height: 400,
      });
      try {
        chart.setOption(option(input));
        const svg = chart.renderToSVGString();
        expect(svg).not.toMatch(/NaN|Infinity/);
        if (value === 5) expect(svg).toContain('fill="#e1cc00"');
        else expect((option(input) as any).graphic).toEqual([]);
      } finally {
        chart.dispose();
      }
    }
  });
  it("preserves signed/zero palette ordering and the source constant middle stop", () => {
    const colors = heatmapFixture().style.colorRange;
    expect(heatmapColor(colors, [-10, 20], -10)).toBe(colors[0]);
    expect(heatmapColor(colors, [-10, 20], 20)).toBe(colors[2]);
    expect(heatmapColor(colors, [5, 5], 5)).toBe(colors[1]);
    expect(heatmapColor(colors, [-10, 20], 0)).toBe("rgb(240, 189, 0)");
    expect(
      heatmapGeometry([20.5, 30.5], [10, 20], { x: 16, y: 20, width: 20, height: 20 }),
    ).toEqual({ x: 16, y: 20, width: 9, height: 20 });
  });
  it("keeps duplicate categories distinct and missing geometry nonnumeric", () => {
    const o = option() as any;
    expect(o.yAxis.type).toBe("category");
    expect(o.xAxis.type).toBe("category");
    expect(o.yAxis.data).toEqual([0, 1, 2, 3]);
    expect(o.series[0].data.map((d: any) => d.value)).toEqual([
      [0, 0, -10],
      [0, 1, 0],
      [0, 2, 20],
      [0, 3],
    ]);
    expect(o.series[0].data[3].tooltip.show).toBe(false);
    expect(o.tooltip.formatter({ dataIndex: 1 })).toContain("0.00");
    expect(o.tooltip.formatter({ dataIndex: 3 })).toBe("");
  });
  it("suppresses tooltips when disabled", () => {
    const i = heatmapFixture();
    const off = {
      ...i,
      style: {
        ...i.style,
        application: {
          ...i.style.application,
          tooltip: { enabled: false, mode: "single" },
        },
      },
    };
    const o = option(off) as any;
    expect(o.tooltip.show).toBe(false);
    expect(o.tooltip.formatter({ dataIndex: 0 })).toBe("");
  });
  it("reverses gradient and labels together without changing cell colors", () => {
    const i = heatmapFixture();
    const reversed = {
      ...i,
      style: {
        ...i.style,
        gradientLegend: { ...i.style.gradientLegend, reverseOrder: true },
      },
    };
    const a = heatmapChrome(i);
    const b = heatmapChrome(reversed);
    expect((a.options.graphic as any[])[0].style.fill.colorStops[0].color).toBe(
      i.style.colorRange[2],
    );
    expect((b.options.graphic as any[])[0].style.fill.colorStops[0].color).toBe(
      i.style.colorRange[0],
    );
    expect(
      projectHeatmapHover(i)?.project(JSON.stringify(["a", "v"]))?.y,
    ).toBeGreaterThan(
      projectHeatmapHover(reversed)?.project(JSON.stringify(["a", "v"]))?.y ??
        Number.POSITIVE_INFINITY,
    );
    const first = (a.options.graphic as any[]).find(
      (item) => item.style?.text === "-10.00",
    );
    const reverseFirst = (b.options.graphic as any[]).find(
      (item) => item.style?.text === "-10.00",
    );
    expect(first).toBeDefined();
    expect(reverseFirst).toBeDefined();
    expect(first.y).toBeGreaterThan(reverseFirst.y);
    expect(projectHeatmapHover(i)?.project(JSON.stringify(["d", "v"]))).toBeUndefined();
    expect((option() as any).series[0].data).toEqual(
      (option(reversed) as any).series[0].data,
    );
  });
  it("paints actual native ECharts SVG with finite labels and transparent missing borders", () => {
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 600,
      height: 400,
    });
    try {
      chart.setOption(option());
      const svg = chart.renderToSVGString();
      expect(svg).toContain("Same");
      expect(svg).toContain("-10.00");
      expect(svg).toContain("0.00");
      expect(svg).not.toMatch(/NaN|Infinity/);
      expect(svg).toMatch(
        /fill="none"[^>]*stroke="#111"[^>]*ecmeta_data_index="3"[^>]*ecmeta_silent="true"/,
      );
      expect(svg).toContain('stroke="#111"');
    } finally {
      chart.dispose();
    }
  });
});
