import { type EChartsOption, type EChartsType, graphic, init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { translateBoxPlot } from "../../../src/components/General/Table/Chart/echarts/boxPlot";
import { histogramInput } from "./histogram.fixtures";

function navigable(direction: "vertical" | "horizontal" = "vertical") {
  const h = histogramInput([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  h.snapshot.rows.forEach((r, i) => {
    r.category = i < 5 ? "first" : "last";
    r.values.other = (r.values.amount as number) + 20;
  });
  const category = h.style.axes.x.appearance;
  const number = h.style.axes.y;
  category.fields.type = "category";
  category.fields.position = direction === "vertical" ? "bottom" : "left";
  number.appearance.fields.position = direction === "vertical" ? "left" : "bottom";
  const stroke = {
    stroke: "#ae1234",
    strokeWidth: 2,
    strokeOpacity: 0.7,
    lineDash: [],
    lineDashOffset: 0,
  };
  const field = {
    ...stroke,
    fill: "#145da0",
    fillOpacity: 0.4,
    whisker: stroke,
    cap: { lengthRatio: 0.5 },
  };
  return {
    snapshot: h.snapshot,
    style: {
      common: h.style.common,
      application: h.style.application,
      direction,
      axes: { category, number },
      band: { paddingInner: 0.3, paddingOuter: 0, groupPaddingInner: 0.2 },
      fields: { amount: field, other: { ...field, fill: "#b33b32" } },
    },
    context: {
      ...h.context,
      navigation: {
        enabled: true,
        mini: true,
        theme: projectCallerTheme("light", [], {}),
      },
    },
  };
}
function supportedBox(input: ReturnType<typeof navigable>) {
  const result = translateBoxPlot(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as any),
);

import { boxPlotNavigationWindow } from "../../../src/components/General/Table/Chart/echarts/boxPlotNavigationWindow";

function boxes(chart: EChartsType) {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter(
      (el): el is InstanceType<typeof graphic.Rect> =>
        el instanceof graphic.Rect && el.style.fill === "#145da0",
    );
}
function engine(options: EChartsOption, check: (chart: EChartsType) => void) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption(options);
    check(chart);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
}
it("native vertical crop expands actual main boxes and leaves overview geometry full size", () => {
  const input = navigable();
  const full = supportedBox(input);
  let main = 0;
  let mini = 0;
  engine(full.options, (chart) => {
    const rects = boxes(chart);
    main = rects[0].shape.width;
    mini = rects[2].shape.width;
    expect(chart.renderToSVGString()).toContain("first");
  });
  expect((full.options.series as any[])[0].data[0].value).toEqual([0, 0, 2, 4, 6, 8]);
  const options = boxPlotNavigationWindow(input, full.options, {
    dataZoom: [{ id: "openbb-navigator", start: 0, end: 50 }],
  });
  engine(options, (chart) => {
    const rects = boxes(chart);
    expect(rects[0].shape.width).toBeGreaterThan(main * 1.8);
    expect(rects[2].shape.width).toBe(mini);
  });
});

it("renders planned wrapped category labels at raw slots and measures the numeric span from the final grid", () => {
  const input = navigable();
  input.context.display.category = String;
  input.context.navigation.enabled = input.context.navigation.mini = false;
  input.style.application.title.enabled =
    input.style.application.subtitle.enabled = false;
  input.style.application.legend.enabled = false;
  input.style.application.padding = {
    top: 20,
    bottom: 20,
    left: 20,
    right: 20,
  };
  for (const axis of [input.style.axes.category, input.style.axes.number.appearance]) {
    axis.title.enabled = false;
    axis.labels.rotation = undefined;
    axis.labels.autoRotate = true;
  }
  input.snapshot.rows = Array.from({ length: 12 }, (_, i) => ({
    id: `fiscal-${i}`,
    category: `FY ${2016 + i}${i === 0 ? " (partial: 1/4 quarters)" : i === 11 ? " (partial: 3/4 quarters)" : ""}`,
    values: { amount: i + 1, other: i + 2 },
  }));
  input.context.viewport.width = 600;
  const result = supportedBox(input);
  const xAxis = result.options.xAxis as any;
  expect(xAxis.axisLabel.rotate).toBe(25);
  expect(xAxis.axisLabel.customValues).toEqual([0, 2, 4, 6, 8, 10]);
  expect(xAxis.axisLabel.formatter(2)).toBe("FY\n2018");
  expect(result.projection.groups).toHaveLength(12);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(result.options);
    const model = (chart as any).getModel();
    const grid = model.getComponent("grid", 0).coordinateSystem.getRect();
    expect(grid.height).toBeCloseTo(result.valueAxis.span);
    expect(
      model
        .getComponent("xAxis", 0)
        .axis.getViewLabels()
        .map((label: any) => label.tickValue),
    ).toEqual([0, 2, 4, 6, 8, 10]);
    expect(chart.renderToSVGString()).toContain("2018");
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
  const compact = supportedBox({
    ...input,
    context: { ...input.context, viewport: { width: 600, height: 240 } },
  });
  expect(compact.valueAxis.span).toBeLessThan(result.valueAxis.span);
  expect(compact.valueAxis.density.tickCount).toBeLessThan(
    result.valueAxis.density.tickCount,
  );
  expect(compact.valueAxis.fullExtent).not.toEqual(result.valueAxis.fullExtent);
});

it("renders numeric main text above an 18px miniature whose labels remain raw", () => {
  const input = navigable("horizontal");
  input.context.display.numericAxis = (value) => `financial ${value.toFixed(2)} B`;
  const result = supportedBox(input);
  engine(result.options, (chart) => {
    const model = (chart as any).getModel();
    const main = model.getComponent("grid", 0).coordinateSystem.getRect();
    const mini = model.getComponent("grid", 1).coordinateSystem.getRect();
    expect(mini.height).toBe(18);
    expect(main.width).toBeCloseTo(result.valueAxis.span);
    expect(mini.y - (main.y + main.height)).toBeGreaterThan(10);
    const financial = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter(
        (item: any) =>
          item.type === "tspan" && String(item.style.text).startsWith("financial"),
      );
    expect(financial.length).toBeGreaterThan(1);
    for (const item of financial) {
      const bounds = item.getBoundingRect().clone();
      if (item.transform) bounds.applyTransform(item.transform);
      expect(bounds.y + bounds.height).toBeLessThan(mini.y);
    }
    const miniAxis = model.getComponent("xAxis", 1).axis;
    expect(
      miniAxis
        .getViewLabels()
        .every((label: any) => label.formattedLabel === String(label.tickValue)),
    ).toBe(true);
    expect(miniAxis.getViewLabels().length).toBeGreaterThan(2);
  });
});
it("native horizontal crop applies percentages exactly once to raw financial coordinates", () => {
  const input = navigable("horizontal");
  const full = supportedBox(input);
  expect((full.options.series as any[])[0].data[0].value).toEqual([0, 0, 2, 4, 6, 8]);
  const options = boxPlotNavigationWindow(input, full.options, {
    dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
  });
  engine(options, (chart) => {
    const axis = Array.isArray(full.options.xAxis)
      ? full.options.xAxis[0]
      : full.options.xAxis;
    const min = axis!.min as number;
    const max = axis!.max as number;
    const grid = Array.isArray(options.grid) ? options.grid[0] : options.grid;
    const left = chart.convertToPixel(
      { xAxisIndex: 0 },
      min + (max - min) * 0.25,
    ) as number;
    const right = chart.convertToPixel(
      { xAxisIndex: 0 },
      min + (max - min) * 0.75,
    ) as number;
    expect(left).toBeCloseTo(Number(grid!.left));
    expect(right).toBeCloseTo(800 - Number(grid!.right));
    expect(boxes(chart).length).toBe(4);
    expect(chart.renderToSVGString()).toContain("first");
  });
});
