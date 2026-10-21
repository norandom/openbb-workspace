import { graphic, init, type EChartsType } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { resolvePieAssignments } from "../../../src/components/General/Table/Chart/compatibility/pieAssignments";
import { companions, key, mains, pieInput, pieOptions } from "./pie.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);
function withChart(
  input: ReturnType<typeof pieInput>,
  check: (chart: EChartsType, options: any) => void,
) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...input.context.viewport,
  });
  try {
    const options = pieOptions(input);
    chart.setOption(options);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    check(chart, options);
  } finally {
    chart.dispose();
  }
}
function geometry(chart: EChartsType, index: number) {
  const model = (chart as any).getModel().getSeriesByIndex(index),
    data = model.getData();
  return Array.from({ length: data.count() }, (_, i) => ({
    layout: data.getItemLayout(i),
    element: data.getItemGraphicEl(i),
    name: data.getName(i),
  }));
}
it("renders native independent fractions/radii, independent text styles and callout leaders", () => {
  const input = pieInput();
  input.style.series.calloutLabel.color = "#abcdef";
  input.style.series.sectorLabel.color = "#f12345";
  input.style.series.sectorLabel.size = 6;
  input.context.display.seriesLabel = (value) =>
    typeof value === "number" ? String(value) : `label:${value}`;
  withChart(input, (chart, options) => {
    for (const [index, expected] of [
      [0, 0.3],
      [2, 0.1],
    ]) {
      const rows = geometry(chart, index),
        other = geometry(chart, index + 1);
      expect(rows[0].layout.endAngle - rows[0].layout.startAngle).toBeCloseTo(
        expected * Math.PI * 2,
      );
      expect(Math.cos(rows[0].layout.startAngle)).toBeCloseTo(0);
      expect(Math.sin(rows[0].layout.startAngle)).toBeCloseTo(-1);
      rows.forEach((row, i) => {
        expect(row.layout).toEqual(other[i].layout);
        expect(row.layout.r).toBe(options.series[index].radius[1]);
        expect(row.element.getTextContent()?.style.fill).toBe("#abcdef");
        expect(row.element.getTextGuideLine()).toBeDefined();
        expect(other[i].element.style.fill).toBe("transparent");
        expect(other[i].element.style.lineWidth).toBe(0);
        expect(other[i].element.getTextContent()?.style.fill).toBe("#f12345");
        expect(other[i].element.getTextContent()?.style.opacity).toBe(1);
        let ancestor = other[i].element,
          silent = false;
        while (ancestor) {
          silent ||= ancestor.silent;
          ancestor = ancestor.parent;
        }
        expect(silent).toBe(true);
      });
    }
    expect(options.legend.data).toHaveLength(4);
    expect(chart.renderToSVGString()).toContain(">3</text>");
    expect(chart.renderToSVGString()).toContain("label:A");
  });
});
it("reprojects native duplicate-key selections ring-locally, updates labels/outlines and restores entries", () => {
  const input = pieInput();
  withChart(input, (chart, options) => {
    const reproject = () => {
      input.context.legendSelection = (
        chart.getOption().legend as any[]
      )[0].selected;
      chart.setOption(pieOptions(input), { notMerge: true });
    };
    chart.dispatchAction({
      type: "legendUnSelect",
      name: key("revenue", "r0"),
    });
    expect(geometry(chart, 0)[0].name).toBe(key("revenue", "r1"));
    expect(geometry(chart, 0)[0].layout).toEqual(geometry(chart, 1)[0].layout);
    reproject();
    expect(
      geometry(chart, 0)[0].layout.endAngle -
        geometry(chart, 0)[0].layout.startAngle,
    ).toBeCloseTo(2 * Math.PI);
    expect(
      geometry(chart, 2)[0].layout.endAngle -
        geometry(chart, 2)[0].layout.startAngle,
    ).toBeCloseTo(0.1 * 2 * Math.PI);
    const oldPosition = geometry(chart, 1)[0].element.getTextContent().x;
    chart.dispatchAction({
      type: "legendUnSelect",
      name: key("revenue", "r1"),
    });
    reproject();
    expect(geometry(chart, 0)).toHaveLength(0);
    chart.renderToSVGString();
    expect(
      chart
        .getZr()
        .storage.getDisplayList(true)
        .filter(
          (e) =>
            e instanceof graphic.Circle &&
            e.style.stroke === input.style.series.calloutLabel.color,
        ),
    ).toHaveLength(1);
    chart.dispatchAction({ type: "legendSelect", name: key("revenue", "r0") });
    reproject();
    expect(geometry(chart, 0)[0].name).toBe(key("revenue", "r0"));
    expect(geometry(chart, 1)[0].element.getTextContent().x).toBeCloseTo(
      oldPosition,
    );
    expect((chart.getOption().legend as any[])[0].data).toHaveLength(
      options.legend.data.length,
    );
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  });
});
it("preserves original pixel collapses and prevents swapped radii or invented zero sectors", () => {
  for (const radius of [50, 20, 0]) {
    const input = pieInput();
    input.context.viewport = { width: radius * 2, height: radius * 2 };
    input.style.application.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    input.style.application.title.enabled =
      input.style.application.subtitle.enabled =
      input.style.application.legend.enabled =
        false;
    input.style.series.calloutLabel.enabled = false;
    withChart(input, (chart, options) => {
      expect(mains(options).map((s) => s.radius)).toEqual(
        radius === 50
          ? [
              [30, 50],
              [0, 10],
            ]
          : radius === 20
            ? [
                [0, 20],
                [0, 0],
              ]
            : [
                [0, 0],
                [0, 0],
              ],
      );
      if (radius <= 20)
        expect(
          geometry(chart, 2).every(
            (d) =>
              d.element.ignore ||
              d.layout.r === 0 ||
              d.layout.endAngle === d.layout.startAngle,
          ),
        ).toBe(true);
    });
  }
  const input = pieInput();
  input.snapshot.rows.forEach((r) => {
    r.values.revenue = 0;
    r.values.profit = -2;
  });
  withChart(input, (chart, options) => {
    expect(options.graphic).toHaveLength(2);
    expect(
      options.graphic.every(
        (g: any) =>
          g.style.fill === "none" && g.style.lineWidth === 1 && g.silent,
      ),
    ).toBe(true);
    expect(geometry(chart, 0).every((d) => d.layout.angle === 0)).toBe(true);
  });
});
it("moves horizontal sector text with rotation and position ratio and suppresses labels that do not fit", () => {
  const input = pieInput("pie");
  input.style.series.calloutLabel.enabled = false;
  input.context.display.seriesLabel = (v) =>
    typeof v === "number" ? "V" : String(v);
  let first: number[] = [];
  withChart(input, (chart) => {
    const t = geometry(chart, 1)[0].element.getTextContent();
    first = [t.x, t.y];
    expect(t.rotation).toBe(0);
    expect(t.ignore).toBe(false);
  });
  input.style.series.rotation = 90;
  input.style.series.sectorLabel.positionRatio = 0.8;
  withChart(input, (chart) => {
    const t = geometry(chart, 1)[0].element.getTextContent();
    expect(t.x).not.toBeCloseTo(first[0]);
    expect(t.y).not.toBeCloseTo(first[1]);
    expect(geometry(chart, 0)[0].layout.startAngle).toBeCloseTo(0);
  });
  input.context.display.seriesLabel = () =>
    "An impossibly long financial observation value".repeat(20);
  withChart(input, (chart, options) => {
    expect(
      companions(options)[0].data.every((d: any) => d.label.show === false),
    ).toBe(true);
    expect(
      geometry(chart, 1).every((d) => d.element.getTextContent().ignore),
    ).toBe(true);
  });
});
it("keeps a finite extreme saved rotation and positions sector text at independently computed ring coordinates", () => {
  const input = pieInput("pie");
  input.style.series.rotation = Number.MAX_VALUE;
  input.style.series.calloutLabel.enabled = false;
  input.style.series.sectorLabel.positionRatio = 0.7;
  input.style.series.sectorLabel.positionOffset = 3;
  input.context.display.seriesLabel = (value) =>
    typeof value === "number" ? "V" : String(value);
  withChart(input, (chart, options) => {
    const [inner, outer] = mains(options)[0].radius,
      center = mains(options)[0].center;
    const angle = ((-90 + (Number.MAX_VALUE % 360) + 54) * Math.PI) / 180;
    const distance = inner + (outer - inner) * 0.7 + 3;
    const text = geometry(chart, 1)[0].element.getTextContent();
    expect(text.x).toBeCloseTo(center[0] + Math.cos(angle) * distance, 8);
    expect(text.y).toBeCloseTo(center[1] + Math.sin(angle) * distance, 8);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  });
});
it.each(["empty", "missing", "nonpositive"])(
  "renders unfilled zero-total outlines for %s observations and recovers",
  (mode) => {
    const input = pieInput();
    input.snapshot.rows =
      mode === "empty"
        ? []
        : [
            {
              id: "r0",
              category: "Q1",
              values:
                mode === "missing"
                  ? { revenue: null }
                  : { revenue: -2, profit: 0 },
            },
          ];
    withChart(input, (chart, options) => {
      const circles = chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((e) => e instanceof graphic.Circle) as InstanceType<
        typeof graphic.Circle
      >[];
      expect(circles).toHaveLength(2);
      circles.forEach((circle, i) => {
        expect(circle.shape.r).toBe(mains(options)[i].radius[1]);
        expect(circle.style).toMatchObject({
          fill: "none",
          stroke: input.style.series.calloutLabel.color,
          opacity: 1,
          lineWidth: 1,
        });
      });
      expect(geometry(chart, 0).every((d) => d.layout.angle === 0)).toBe(true);
      input.snapshot.rows = pieInput().snapshot.rows;
      chart.setOption(pieOptions(input), { notMerge: true });
      chart.renderToSVGString();
      expect(
        chart
          .getZr()
          .storage.getDisplayList(true)
          .filter((e) => e instanceof graphic.Circle),
      ).toHaveLength(0);
      expect(geometry(chart, 0)[0].layout.angle).toBeCloseTo(0.3 * Math.PI * 2);
    });
  },
);
it("uses explicit inner outlines, preserves three-ring pixel collapse and suppresses reversed geometry", () => {
  const input = pieInput();
  input.snapshot.rows = [];
  input.style.series.innerRadiusRatio = 0.5;
  withChart(input, (_chart, options) =>
    expect(options.graphic).toHaveLength(4),
  );
  delete input.style.series.innerRadiusRatio;
  input.snapshot.columns.push({ id: "third", label: "Third", role: "number" });
  input.snapshot.selectedColumnIds.push("third");
  input.assignment = resolvePieAssignments({
    chartType: "donut",
    valueColumns: ["revenue", "profit", "third"].map((colId) => ({
      colId,
      selected: true,
    })),
  }) as any;
  input.context.viewport = { width: 100, height: 100 };
  input.style.application.padding = { top: 0, right: 0, bottom: 0, left: 0 };
  input.style.application.title.enabled =
    input.style.application.subtitle.enabled =
    input.style.application.legend.enabled =
    input.style.series.calloutLabel.enabled =
      false;
  withChart(input, (_chart, options) =>
    expect(mains(options).map((s) => s.radius)).toEqual([
      [30, 50],
      [0, 10],
      [0, 0],
    ]),
  );
  const reverse = pieInput();
  reverse.style.series.outerRadiusRatio = 0.1;
  withChart(reverse, (chart, options) => {
    expect(mains(options)[0].radius).toEqual([0, 0]);
    expect(geometry(chart, 0).every((d) => d.layout.angle === 0)).toBe(true);
  });
});
it("centers a single enabled pie value and keeps label opacity independent from transparent fill", () => {
  const input = pieInput("pie");
  input.context.legendSelection = { [key("revenue", "r0")]: false };
  input.style.series.paint.fillOpacity = 0;
  withChart(input, (chart, options) => {
    const text = geometry(chart, 1)[0].element.getTextContent(),
      center = mains(options)[0].center;
    expect(text.x).toBeCloseTo(center[0]);
    expect(text.y).toBeCloseTo(center[1]);
    expect(text.ignore).toBe(false);
    expect(text.style.opacity).toBe(1);
    expect(geometry(chart, 0)[0].element.style.fill).toBe("rgba(179,59,50,0)");
    expect(options.tooltip.trigger).toBe("item");
    expect(companions(options)[0].tooltip.show).toBe(false);
    expect(geometry(chart, 1)[0].element.getTextGuideLine()).toBeUndefined();
  });
});
it("independently disables each label channel, respects callout minimum and renders saved leader/paint effects", () => {
  const input = pieInput("pie");
  input.style.series.calloutLabel.minAngle = 120;
  input.style.series.calloutLine = {
    length: 20,
    strokeWidth: 4,
    colors: ["#fedcba"],
  };
  input.style.series.calloutLabel.offset = 8;
  withChart(input, (chart, options) => {
    expect(geometry(chart, 0)[0].element.getTextContent().ignore).toBe(true);
    const row = geometry(chart, 0)[1];
    expect(row.element.getTextContent().ignore).toBe(false);
    expect(row.element.getTextGuideLine().style).toMatchObject({
      stroke: "#fedcba",
      lineWidth: 4,
      opacity: 1,
    });
    expect(row.element.style).toMatchObject({
      lineWidth: 3,
      lineDash: [5, 2],
      shadowBlur: 4,
      shadowOffsetX: -2,
      shadowOffsetY: 3,
    });
    expect(options.series[0]).toMatchObject({
      selectedOffset: 0,
      minAngle: 0,
      emphasis: { scale: false },
      labelLine: { length: 20 },
      label: { distanceToLabelLine: 8 },
    });
  });
  input.style.series.calloutLabel.enabled = false;
  withChart(input, (chart, options) => {
    expect(companions(options)).toHaveLength(1);
    expect(
      geometry(chart, 0).every((d) => d.element.getTextContent().ignore),
    ).toBe(true);
  });
  input.style.series.sectorLabel.enabled = false;
  input.style.series.calloutLabel.enabled = true;
  withChart(input, (_chart, options) => {
    expect(companions(options)).toHaveLength(0);
    expect(mains(options)).toHaveLength(1);
  });
});
it.each(["light", "dark"])(
  "renders %s common appearance and native painted legend swatches without Cartesian navigation",
  (theme) => {
    const input = pieInput();
    const dark = theme === "dark";
    input.style.application.palette = dark
      ? { fills: ["#ffffff", "#bbbbbb"], strokes: ["#dddddd", "#aaaaaa"] }
      : { fills: ["#112233", "#445566"], strokes: ["#223344", "#556677"] };
    input.style.application.background.fill = dark ? "#101010" : "#fafafa";
    input.style.application.legend.position = "right";
    withChart(input, (chart, options) => {
      const svg = chart.renderToSVGString();
      expect(svg).toContain("Financials");
      expect(svg).toContain("Raw observations");
      expect(svg).toContain(input.style.application.background.fill);
      expect(svg).toContain("Arial");
      expect(svg).toContain("Verdana");
      expect(options.legend).toMatchObject({
        orient: "vertical",
        textStyle: { fontFamily: "Arial", fontWeight: 400 },
        itemStyle: { borderWidth: 2 },
      });
      const provider = (chart as any)
        .getModel()
        .getSeriesByIndex(0).legendVisualProvider;
      expect(provider.getItemVisual(0, "style").fill).toBe(
        mains(options)[0].data[0].itemStyle.color,
      );
      expect(options).not.toHaveProperty("xAxis");
      expect(options).not.toHaveProperty("yAxis");
      expect(options).not.toHaveProperty("grid");
      expect(options).not.toHaveProperty("dataZoom");
      expect(options.series[0].id).not.toContain(":sector-labels");
    });
  },
);
