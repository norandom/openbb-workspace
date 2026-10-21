import type { EChartsOption } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { translateBoxPlot } from "../../../src/components/General/Table/Chart/echarts/boxPlot";
import { boxPlotNavigationWindow } from "../../../src/components/General/Table/Chart/echarts/boxPlotNavigationWindow";
import type { BoxPlotMappingInput } from "../../../src/components/General/Table/Chart/echarts/boxPlotTypes";
import { navigatorAxes } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigatorOverview";
import { histogramInput } from "./histogram.fixtures";

type Previous = [0, 0, 1, 2, 3, 4, 5, 6];
type Mutable<T, D extends number = 6> = D extends 0
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : { -readonly [K in keyof T]: Mutable<T[K], Previous[D]> };
function boxInput(
  direction: "vertical" | "horizontal" = "vertical",
): Mutable<BoxPlotMappingInput> {
  const h = histogramInput([0, 2, 4, 6, 8, null, 10, 12, 14, 16, 18]);
  h.snapshot.rows.forEach((r, n) => {
    r.category = n < 5 ? "first" : n === 5 ? "" : "last";
    r.values.other = n === 5 ? null : n < 5 ? n + 20 : n + 25;
  });
  const category = h.style.axes.x.appearance;
  const number = h.style.axes.y;
  category.fields.type = "category";
  category.fields.position = direction === "vertical" ? "bottom" : "left";
  number.appearance.fields.position = direction === "vertical" ? "left" : "bottom";
  for (const a of [category, number.appearance]) {
    a.title.enabled = false;
    a.labels.rotation = 0;
    a.grid.enabled = false;
  }
  h.style.application.title.enabled =
    h.style.application.subtitle.enabled =
    h.style.application.legend.enabled =
      false;
  h.style.application.padding = { top: 40, bottom: 40, left: 40, right: 40 };
  const stroke = {
    stroke: "#ae1234",
    strokeWidth: 2,
    strokeOpacity: 0.7,
    lineDash: [3, 1],
    lineDashOffset: 1,
  };
  return {
    snapshot: h.snapshot,
    style: {
      common: h.style.common,
      application: h.style.application,
      direction,
      axes: { category, number },
      band: { paddingInner: 0.3, paddingOuter: 0, groupPaddingInner: 0.2 },
      fields: {
        amount: {
          ...stroke,
          fill: "#145da0",
          fillOpacity: 0.4,
          whisker: { ...stroke, stroke: "#cc7766", strokeWidth: 3, strokeOpacity: 0.2 },
          cap: { lengthRatio: 0.5 },
        },
        other: {
          ...stroke,
          fill: "#b33b32",
          fillOpacity: 0.8,
          whisker: { ...stroke },
          cap: { lengthRatio: 1 },
        },
      },
    },
    context: { ...h.context, viewport: { width: 600, height: 500 } },
  };
}
function navigable(
  direction: "vertical" | "horizontal" = "vertical",
): BoxPlotMappingInput {
  const input = boxInput(direction);
  return {
    ...input,
    context: {
      ...input.context,
      navigation: {
        enabled: true,
        mini: true,
        theme: projectCallerTheme("light", [], {}),
      },
    },
  };
}
function customSeries(options: EChartsOption, index: number) {
  const series = navigatorAxes(options.series)[index];
  if (series.type !== "custom") throw Error("Expected Box custom geometry.");
  return series;
}
function supportedBox(input: BoxPlotMappingInput) {
  const result = translateBoxPlot(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (s: string) => ({ width: s.length * 6 }) } as any),
);
it("crops numeric screen x once and retains every category and full overview", () => {
  const input = navigable("horizontal");
  const full = supportedBox(input);
  const crop = boxPlotNavigationWindow(input, full.options, {
    dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
  });
  expect(navigatorAxes(crop.xAxis)[0].min).toBe(
    navigatorAxes(full.options.xAxis)[0].min,
  );
  expect(navigatorAxes(crop.xAxis)[0].max).toBe(
    navigatorAxes(full.options.xAxis)[0].max,
  );
  expect(JSON.stringify(navigatorAxes(crop.series)[0].data)).toEqual(
    JSON.stringify(navigatorAxes(full.options.series)[0].data),
  );
  expect(JSON.stringify(navigatorAxes(crop.yAxis)[0])).toEqual(
    JSON.stringify(navigatorAxes(full.options.yAxis)[0]),
  );
  expect(customSeries(crop, 2).renderItem).not.toBe(customSeries(crop, 0).renderItem);
  expect(JSON.stringify(navigatorAxes(crop.xAxis)[1])).toEqual(
    JSON.stringify(navigatorAxes(full.options.xAxis)[1]),
  );
  expect(navigatorAxes(crop.dataZoom)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        xAxisIndex: [0],
        filterMode: "none",
        start: 25,
        end: 75,
      }),
    ]),
  );
});
it("autoscales vertical visible summaries without changing full observations or overview", () => {
  const input = navigable();
  const full = supportedBox(input);
  const crop = boxPlotNavigationWindow(input, full.options, {
    dataZoom: [{ id: "openbb-navigator", start: 0, end: 20 }],
  });
  expect(navigatorAxes(crop.yAxis)[0].max).toBeLessThan(
    navigatorAxes(full.options.yAxis)[0].max as number,
  );
  expect(JSON.stringify(navigatorAxes(crop.series)[0].data)).toEqual(
    JSON.stringify(navigatorAxes(full.options.series)[0].data),
  );
  expect(JSON.stringify(navigatorAxes(crop.yAxis)[1])).toEqual(
    JSON.stringify(navigatorAxes(full.options.yAxis)[1]),
  );
  const reset = boxPlotNavigationWindow(input, full.options, {
    dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }],
  });
  expect(JSON.stringify(navigatorAxes(reset.yAxis)[0])).toEqual(
    JSON.stringify(navigatorAxes(full.options.yAxis)[0]),
  );
});
it("throws nonfinite ranges and keeps overview independent of transient legend hiding", () => {
  const input = navigable();
  const full = supportedBox(input);
  expect(() =>
    boxPlotNavigationWindow(input, full.options, {
      dataZoom: [{ id: "openbb-navigator", start: Number.NaN, end: 50 }],
    }),
  ).toThrow();
  const projected = {
    ...full.options,
    legend: { selected: { amount: false, other: false } },
  };
  const result = boxPlotNavigationWindow(input, projected, full.options);
  expect(customSeries(result, 0).renderItem).toBeTypeOf("function");
  expect(JSON.stringify(navigatorAxes(result.yAxis)[1])).toEqual(
    JSON.stringify(navigatorAxes(full.options.yAxis)[1]),
  );
});

it.each([
  "min",
  "max",
] as const)("keeps the full autoscale when all selected summaries fall outside explicit %s", (bound) => {
  const input = boxInput();
  if (bound === "min") {
    input.style.axes.number.min = 50;
    input.snapshot.rows.forEach((r, i) => {
      if (i >= 6) r.values.other = 100;
    });
  } else input.style.axes.number.max = 5;
  const navigated = {
    ...input,
    context: {
      ...input.context,
      navigation: {
        enabled: true,
        mini: false,
        theme: projectCallerTheme("light", [], {}),
      },
    },
  };
  const full = supportedBox(navigated);
  const window = bound === "min" ? { start: 0, end: 20 } : { start: 80, end: 100 };
  const crop = boxPlotNavigationWindow(navigated, full.options, {
    dataZoom: [{ id: "openbb-navigator", ...window }],
  });
  expect(navigatorAxes(crop.yAxis)[0].min).toBe(
    navigatorAxes(full.options.yAxis)[0].min,
  );
  expect(navigatorAxes(crop.yAxis)[0].max).toBe(
    navigatorAxes(full.options.yAxis)[0].max,
  );
  expect(navigatorAxes(crop.dataZoom)[0]).toMatchObject(window);
});
it("reduces numeric tick count after measuring crowded financial labels", () => {
  const input = boxInput("horizontal");
  const ordinary = supportedBox(input);
  input.context.display.numericAxis = (v) => `USD long financial label ${v} million`;
  const crowded = supportedBox(input);
  expect(crowded.valueAxis.density.tickCount).toBeLessThan(
    ordinary.valueAxis.density.tickCount,
  );
  expect(crowded.valueAxis.density.tickCount).toBe(
    crowded.valueAxis.density.minTickCount,
  );
  expect(navigatorAxes(crowded.options.series)[0].data).toEqual(
    navigatorAxes(ordinary.options.series)[0].data,
  );
});
