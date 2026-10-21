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
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (s: string) => ({ width: s.length * 6 }) } as any),
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
