import { type EChartsOption, type EChartsType, graphic, init } from "echarts";
import { beforeEach, expect, vi } from "vitest";
import type { ResolvedApplicationAxis } from "../../../src/components/General/Table/Chart/application/appearanceModel";
import type { RangeResolvedAxis } from "../../../src/components/General/Table/Chart/application/rangeAxisAppearance";
import type { WaterfallRenderInput } from "../../../src/components/General/Table/Chart/application/waterfallTypes";
import { projectWaterfall } from "../../../src/components/General/Table/Chart/echarts/waterfall";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";

type Mutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Value)[]
    ? Mutable<Value>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
export function waterfallInput(
  values: (number | null)[] = [10, -3, 0, null, 2],
): Mutable<WaterfallRenderInput> {
  const application = applicationStyle().application;
  application.title.enabled =
    application.subtitle.enabled =
    application.legend.enabled =
      false;
  application.padding = { top: 30, right: 30, bottom: 30, left: 60 };
  for (const axis of Object.values(application.axes)) {
    axis.title.enabled = false;
    axis.labels.rotation = 0;
    axis.grid.enabled = false;
  }
  const item = (name: string, fill: string) => ({
    name,
    fill,
    stroke: fill,
    strokeWidth: 0,
    strokeOpacity: 1,
    fillOpacity: 1,
    lineDash: [],
    lineDashOffset: 0,
    label: {
      ...application.series.labels,
      enabled: false,
      placement: "inside-center",
      spacing: 0,
    },
  });
  const policyAxis = (axis: ResolvedApplicationAxis): RangeResolvedAxis => ({
    ...axis,
    labels: {
      ...axis.labels,
      enabled: true,
      avoidCollisions: true,
      wrapping: axis.fields.type === "category" ? "on-space" : "never",
    },
  });
  const input: WaterfallRenderInput = {
    snapshot: {
      ...structuredClone(validSnapshotInput),
      selectedColumnIds: ["period", "revenue"],
      rows: values.map((delta, index) => ({
        id: `source-${index}`,
        category: index === 4 ? "Total" : "same",
        values: { revenue: delta },
      })),
    },
    fieldId: "revenue",
    appearance: {
      application: {
        ...application,
        axes: {
          category: policyAxis(application.axes.category),
          number: policyAxis(application.axes.number),
        },
      },
      axisRuntime: {} as WaterfallRenderInput["appearance"]["axisRuntime"],
      series: {
        direction: "vertical",
        visible: true,
        tooltipEnabled: true,
        item: {
          positive: item("Positive", "#145da0"),
          negative: item("Negative", "#b33b32"),
          total: item("Total", "#888888"),
        },
        line: {
          enabled: true,
          stroke: "#919191",
          strokeWidth: 2,
          strokeOpacity: 1,
          lineDash: [],
          lineDashOffset: 0,
        },
      },
    },
    context: { ...mappingContext(), viewport: { width: 620, height: 420 } },
    theme: {
      name: "synthetic",
      mode: "light",
      overrides: {},
      palette: application.palette,
      colors: {
        base: "ag-default",
        foregroundColor: "#ffffff",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#ffffff",
      },
    },
    navigatorEnabled: false,
    miniChartEnabled: false,
    navigation: {
      pagination: true,
      showInMiniChart: true,
      outsideMinor: false,
      hoverRange: "exact",
      clickRange: "exact",
      zoom: {
        enabled: true,
        scaleX: true,
        scaleY: false,
        scrolling: true,
        panning: true,
      },
      autoScale: { enabled: true, padding: 0, minVisibleItems: 1 },
    },
  };
  return input as Mutable<WaterfallRenderInput>;
}
export function projected(input: WaterfallRenderInput) {
  const result = projectWaterfall(input);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
export function engine(options: EChartsOption, check: (chart: EChartsType) => void) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 620,
    height: 420,
  });
  try {
    chart.setOption(options);
    check(chart);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
}
export function bars(chart: EChartsType) {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter(
      (e): e is InstanceType<typeof graphic.Rect> =>
        e instanceof graphic.Rect &&
        ["#145da0", "#b33b32"].includes(String(e.style.fill)),
    );
}
