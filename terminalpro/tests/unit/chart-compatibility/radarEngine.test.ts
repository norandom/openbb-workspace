import { type EChartsType, init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { radarData } from "../../../src/components/General/Table/Chart/echarts/radarData";
import {
  radarLayout,
  radarPoint,
} from "../../../src/components/General/Table/Chart/echarts/radarLayout";
import { radarRevenue } from "./fixtures/radarContract";
import { radarInput, radarOptions } from "./radar.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);
function withChart(
  input: ReturnType<typeof radarInput>,
  check: (chart: EChartsType, options: any) => void,
) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...input.context.viewport,
  });
  try {
    const options = radarOptions(input);
    chart.setOption(options);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    check(chart, options);
  } finally {
    chart.dispose();
  }
}
function elements(chart: EChartsType, index: number): any[] {
  const data = (chart as any).getModel().getSeriesByIndex(index).getData();
  return Array.from({ length: data.count() }, (_, i) => data.getItemGraphicEl(i));
}
it("native ECharts paints clockwise affine signed points, breaks gaps, and wraps the valid endpoints", () => {
  const input = radarInput();
  withChart(input, (chart) => {
    const groups = elements(chart, 0);
    const layout = radarLayout(input, radarData(input));
    const point = (i: number, v: number) =>
      radarPoint(i, 6, v, layout.geometry, layout.domain.extent);
    for (const [i, value] of [
      [0, 10],
      [1, -5],
      [2, 0],
      [4, 20],
      [5, 30],
    ]) {
      const circle = groups[i].children().find((e: any) => e.type === "circle");
      expect([circle.shape.cx, circle.shape.cy]).toEqual(point(i, value));
    }
    expect(groups[2].children().some((e: any) => e.type === "line")).toBe(false);
    expect(groups[3].children()).toHaveLength(0);
    const last = groups[5].children().find((e: any) => e.type === "line");
    expect([last.shape.x2, last.shape.y2]).toEqual(point(0, 10));
    expect(chart.renderToSVGString().match(/>period:A<\/text>/g)).toHaveLength(2);
  });
});
it("Area native polygon closes a missing spoke at geometric center and has no invented missing tooltip", () => {
  const input = { ...radarInput(), family: "radarArea" as const };
  withChart(input, (chart, options) => {
    const groups = elements(chart, 0);
    const layout = radarLayout(input, radarData(input));
    const polygon = groups[0].children().find((e: any) => e.type === "polygon");
    expect(polygon.shape.points[3]).toEqual(layout.geometry.center);
    expect(polygon.silent).toBe(true);
    expect(groups[3].children()).toHaveLength(0);
    const formatter = options.tooltip.formatter;
    for (const i of [0, 1, 2, 4])
      expect(
        formatter({ data: options.series[0].data[i], seriesId: "primary" }),
      ).toContain(String(input.snapshot.rows[i].values.primary));
    expect(formatter({ data: options.series[0].data[3] })).toBe("");
  });
});
it("legend deselection removes native geometry and reprojects visible domains without dropping category labels", () => {
  const input = radarInput();
  const changed = {
    ...input,
    snapshot: {
      ...input.snapshot,
      rows: input.snapshot.rows.map((r) => ({
        ...r,
        values: { ...r.values, secondary: 1000 },
      })),
    },
    context: { ...input.context, legendSelection: { secondary: false } },
  };
  withChart(changed, (chart, options) => {
    expect(radarLayout(changed, radarData(changed)).domain.extent).toEqual([-10, 30]);
    expect((chart as any).getModel().getSeriesByIndex(1).getData().count()).toBe(6);
    expect(chart.renderToSVGString()).toContain(">period:D</text>");
    expect(options.legend.selected.secondary).toBe(false);
    expect(elements(chart, 1).every((e) => e === undefined)).toBe(true);
  });
});
it("renders circle grids, annular geometry, label orientation, line paint and marker shapes through the engine", () => {
  const base = radarInput();
  const input = {
    ...base,
    style: {
      ...base.style,
      polarAxis: {
        ...base.style.polarAxis,
        shape: "circle" as const,
        innerRadiusRatio: 0.5,
        thickness: 3,
        labels: { ...base.style.polarAxis.labels, orientation: "parallel" as const },
      },
      series: {
        ...base.style.series,
        stroke: "#123456",
        fill: "#654321",
        strokeWidth: 4,
        lineDash: [5, 2],
        markers: { ...base.style.series.markers, shape: "diamond", size: 12 },
        labels: { ...base.style.series.labels, enabled: true },
      },
    },
  };
  withChart(input, (chart) => {
    const groups = elements(chart, 0);
    const line = groups[0].children().find((e: any) => e.type === "line");
    expect(line.style.lineWidth).toBe(4);
    expect(line.style.lineDash).toEqual([5, 2]);
    expect(line.style.stroke).toContain("18,52,86");
    expect(groups[0].children().some((e: any) => e.type === "path")).toBe(true);
    const svg = chart.renderToSVGString();
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain(">label:10</text>");
  });
});
it("native signed radii retain negative and zero affine offsets independently of the mapper", () => {
  const input = radarInput();
  withChart(input, (chart) => {
    const layout = radarLayout(input, radarData(input));
    const groups = elements(chart, 0);
    const radius = (index: number) => {
      const p = groups[index].children().find((e: any) => e.type === "circle");
      return Math.hypot(
        p.shape.cx - layout.geometry.center[0],
        p.shape.cy - layout.geometry.center[1],
      );
    };
    expect(radius(1) / layout.geometry.radius).toBeCloseTo(0.125);
    expect(radius(2) / layout.geometry.radius).toBeCloseTo(0.25);
    const first = groups[0].children().find((e: any) => e.type === "circle");
    expect(first.shape.cx).toBeCloseTo(layout.geometry.center[0]);
    expect(first.shape.cy).toBeLessThan(layout.geometry.center[1]);
  });
});
it("all-zero native geometry stays at midpoint and missing Area defaults do not manufacture markers", () => {
  const base = radarInput();
  const input = {
    ...base,
    family: "radarArea" as const,
    snapshot: {
      ...base.snapshot,
      rows: base.snapshot.rows.map((r) => ({
        ...r,
        values: { primary: 0, secondary: 0 },
      })),
    },
    style: {
      ...base.style,
      series: {
        ...base.style.series,
        markers: { ...base.style.series.markers, enabled: false },
      },
    },
  };
  withChart(input, (chart) => {
    const g = radarLayout(input, radarData(input)).geometry;
    const first = elements(chart, 0)[0].children();
    const hit = first.find((e: any) => e.type === "circle");
    expect(g.center[1] - hit.shape.cy).toBeCloseTo(g.radius / 2);
    expect(first.filter((e: any) => e.type === "circle")).toHaveLength(1);
    expect(hit.style.fill).toBe("transparent");
  });
});
it("common chrome and legend spacing/paint settings reach native options; tooltip modes retain raw values", () => {
  const base = radarInput();
  const a = base.style.application;
  const input = {
    ...base,
    style: {
      ...base.style,
      application: {
        ...a,
        title: { ...a.title, enabled: true, text: "Revenue USD" },
        subtitle: { ...a.subtitle, enabled: true, text: "Fiscal quarters" },
        legend: {
          ...a.legend,
          enabled: true,
          position: "top",
          markerSize: 17,
          itemSpacing: 11,
          horizontalSpacing: 19,
          verticalSpacing: 13,
        },
        legendMarkerStrokeWidth: 3,
        palette: { fills: ["#ff0000"], strokes: ["#00ff00"] },
      },
      series: { ...base.style.series, strokeOpacity: 1 },
    },
  };
  withChart(input, (chart, options) => {
    const svg = chart.renderToSVGString();
    expect(svg).toContain("Revenue USD");
    expect(svg).toContain("Fiscal quarters");
    const line = elements(chart, 0)[0]
      .children()
      .find((e: any) => e.type === "line");
    expect(line.style.stroke).toContain("255,0,0");
    expect(options.legend.textStyle.padding).toEqual([6.5, 19, 6.5, 6]);
    expect(decodeURIComponent(options.legend.data[0].icon)).toContain(
      'stroke-width="0.17647058823529413"',
    );
  });
  const data = radarOptions(base).series[0].data[1];
  for (const mode of ["shared", "single", "compact"]) {
    const current = {
      ...base,
      style: { ...base.style, application: { ...a, tooltip: { enabled: true, mode } } },
    };
    const text = radarOptions(current).tooltip.formatter({ data, seriesId: "primary" });
    expect(text).toContain(`primary: ${base.context.display.tooltipNumber(-5)}`);
    expect(text.includes("secondary:")).toBe(mode === "shared");
    expect(text.includes("period:A")).toBe(mode !== "compact");
  }
  const area = { ...input, family: "radarArea" as const };
  withChart(area, (chart) => {
    const polygon = elements(chart, 0)[0]
      .children()
      .find((e: any) => e.type === "polygon");
    expect(polygon.style.stroke).toContain("0,255,0");
    expect(polygon.style.fill).toContain("255,0,0");
  });
});
it("native FMP radii represent exact reported USD amounts without applying scale metadata", () => {
  const base = radarInput();
  const amounts = radarRevenue.series[0].values;
  const input = {
    ...base,
    assignments: [{ colId: "primary" }],
    snapshot: {
      ...base.snapshot,
      columns: base.snapshot.columns.map((c) => ({ ...c, scale: 1000000 })),
      rows: amounts.map((primary, i) => ({
        id: `q${i + 1}`,
        category: `Q${i + 1}`,
        values: { primary },
      })),
    },
  };
  withChart(input, (chart) => {
    const g = radarLayout(input, radarData(input)).geometry;
    elements(chart, 0).forEach((group, i) => {
      const p = group.children().find((e: any) => e.type === "circle");
      const actual = Math.hypot(p.shape.cx - g.center[0], p.shape.cy - g.center[1]);
      expect(actual / g.radius).toBeCloseTo(amounts[i] / 150000000000);
    });
  });
});
