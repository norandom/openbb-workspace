import { init, type GridComponentOption, type XAXisComponentOption } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { composeRangeApplication } from "../../../src/components/General/Table/Chart/echarts/rangeApplication";
import { measureText } from "../../../src/components/General/Table/Chart/echarts/cartesianLayout";
import { projectRangeLiveApplication } from "../../../src/components/General/Table/Chart/echarts/rangeLiveProjection";
import { rangeNavigatorInset } from "../../../src/components/General/Table/Chart/echarts/rangeNavigator";
import { rangeLiveInput } from "./rangeLive.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
const settings = { navigatorEnabled: true, miniChartEnabled: true };
it.each([
  "rangeBar",
  "rangeArea",
] as const)("keeps %s available with zoom enabled and both navigator controls off", (family) => {
  const base = rangeLiveInput(family);
  const result = projectRangeLiveApplication(
    {
      ...base,
      theme: {
        ...base.theme,
        overrides: {
          common: { legend: { position: "top" }, zoom: { enabled: true } },
        },
      },
    },
    { navigatorEnabled: false, miniChartEnabled: false },
  );
  expect(result.status, JSON.stringify(result)).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  const zoom = result.options.dataZoom as {
    id?: string;
    show?: boolean;
    zoomOnMouseWheel?: boolean;
    moveOnMouseMove?: boolean;
  }[];
  expect(zoom.find((item) => item.id === "openbb-navigator")?.show).toBe(false);
  expect(zoom.map((item) => item.id)).toContain("openbb-range-x-inside");
  expect(zoom.map((item) => item.id)).toContain("openbb-range-inside");
  expect(zoom.find((item) => item.id === "openbb-range-x-inside")).toMatchObject({
    zoomOnMouseWheel: true,
    moveOnMouseMove: true,
  });
  expect(result.options.grid).toEqual(result.composed.options.grid);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...base.viewport,
  });
  try {
    chart.setOption(result.options);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
});
const cases = [
  ["rangeArea", false, "bottom"],
  ["rangeArea", false, "top"],
  ["rangeBar", false, "bottom"],
  ["rangeBar", true, "bottom"],
  ["rangeBar", true, "top"],
] as const;
for (const [family, horizontal, position] of cases) {
  it(`keeps ${family} ${horizontal ? "horizontal" : "vertical"} ${position} axis text clear of the miniature`, () => {
    const base = rangeLiveInput(family);
    const source = {
      ...base,
      plotBottomInset: 13,
      baseline: {
        ...base.baseline,
        options: {
          [family === "rangeArea" ? "range-area" : "range-bar"]: {
            padding: { bottom: 31 },
            series: { direction: horizontal ? "horizontal" : "vertical" },
            axes: {
              [horizontal ? "number" : "category"]: {
                position,
                title: { enabled: true, text: "Fiscal observations, USD", spacing: 19 },
                label: { rotation: -45, padding: 9 },
              },
            },
          },
        },
      },
    };
    const result = projectRangeLiveApplication(source, settings);
    if (result.status !== "supported") throw Error(JSON.stringify(result));
    const reference = composeRangeApplication({
      ...source,
      plotBottomInset: 13 + rangeNavigatorInset(source, settings),
    });
    if (reference.status !== "supported") throw Error(JSON.stringify(reference));
    const grids = result.options.grid as GridComponentOption[];
    const nav = grids[1];
    const navTop = source.viewport.height - Number(nav.bottom) - Number(nav.height);
    const plotBottom = result.composed.plot.top + result.composed.plot.height;
    const axis = result.composed.appearance.axes[horizontal ? "number" : "category"];
    const x = (result.options.xAxis as XAXisComponentOption[])[0];
    expect(x.position).toBe(position);
    const textBottom =
      position === "bottom"
        ? plotBottom +
          Number(x.nameGap) +
          measureText(axis.title.text, axis.title).height
        : plotBottom;
    expect(navTop).toBeGreaterThanOrEqual(textBottom + 10);
    const labelSpace = Math.ceil(10 * 1.2) + 5;
    expect(navTop).toBeCloseTo(textBottom + 10 + (position === "top" ? labelSpace : 0));
    expect(Number(nav.bottom)).toBeGreaterThanOrEqual(
      31 + 13 + (position === "bottom" ? labelSpace : 0),
    );
    expect(nav.height).toBe(40);
    expect(grids[0]).toEqual(reference.options.grid);
    expect(result.composed.category.fullExtent).toEqual(reference.category.fullExtent);
    expect(result.composed.valueAxis.fullExtent).toEqual(
      reference.valueAxis.fullExtent,
    );
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...source.viewport,
    });
    try {
      chart.setOption(result.options);
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  });
}
