import { init } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectRangeLiveApplication } from "../../../src/components/General/Table/Chart/echarts/rangeLiveProjection";
import { rangePointerCandidates } from "../../../src/components/General/Table/Chart/echarts/rangePointerCandidates";
import { rangeLiveInput } from "./rangeLive.fixtures";
import { rangeLiveMetadata } from "../../../src/components/General/Table/Chart/echarts/rangeLiveMetadata";
const settings = { navigatorEnabled: true, miniChartEnabled: true };
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function live(source = rangeLiveInput()) {
  const result = projectRangeLiveApplication(source, settings);
  expect(result.status, JSON.stringify(result)).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
describe("Range live navigation composition", () => {
  it("retains selected dark-theme pointer paint and typography", () => {
    const base = rangeLiveInput();
    const result = live({
      ...base,
      theme: {
        ...base.theme,
        mode: "dark",
        colors: {
          ...base.theme.colors,
          chartBackgroundColor: "#101010",
          textColor: "#eeeeee",
          foregroundColor: "#dddddd",
        },
      },
    });
    expect(result.projectPointer(result.options)?.paint).toMatchObject({
      background: "#101010",
      color: "#eeeeee",
      pointerLabelBackground: "#101010",
      pointerLabelColor: "#eeeeee",
    });
  });
  it.each([
    "number",
    "time",
  ] as const)("moves actual %s pixels on irregular 25%-75% navigation and preserves raw identities", (kind) => {
    const base = rangeLiveInput("rangeArea");
    const values =
      kind === "time"
        ? [Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2), Date.UTC(2024, 0, 10)]
        : [0, 1, 100];
    const source = {
      ...base,
      snapshot: {
        ...base.snapshot,
        rangeCategory: {
          categoryColumnId: "period",
          columnChartDataType: null,
          firstCategoryIsDate: kind === "time",
          kind: kind === "time" ? ("time" as const) : ("category" as const),
        },
        rows: values.flatMap((category, n) => [
          { id: `lo${n}`, category, values: { amount: n + 2, other: n + 3 } },
          { id: `hi${n}`, category, values: { amount: n + 8, other: n + 9 } },
        ]),
      },
      baseline: { ...base.baseline, model: { categoryAxisType: kind } },
    };
    const initial = live(source);
    const cropped = initial.projectNavigationWindow(initial.options, {
      dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
    });
    const c = rangeLiveMetadata(cropped).composed;
    expect(c.category.coordinates).toEqual(values);
    expect(c.category.visibleExtent[0]).toBeGreaterThan(c.category.fullExtent[0]!);
    expect(rangePointerCandidates(c)[0][0].x).not.toBe(
      rangePointerCandidates(initial.composed)[0][0].x,
    );
    expect(rangePointerCandidates(c)[0][0].rawIdentity?.sourceRowIds).toEqual([
      "lo0",
      "hi0",
    ]);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...base.viewport,
    });
    try {
      chart.setOption(cropped);
      expect(
        chart.convertToPixel({ xAxisIndex: 0 }, c.category.visibleExtent[0]!),
      ).toBeCloseTo(c.plot.left);
    } finally {
      chart.dispose();
    }
  });
  it("reflows actual Bar peer centers after legend changes and replans their full value extent", () => {
    const initial = live();
    const first = rangePointerCandidates(initial.composed)[0][0];
    const hidden = initial.projectLegendSelection({ other: false });
    const c = rangeLiveMetadata(hidden).composed;
    expect(rangePointerCandidates(c)[0][0].x).not.toBe(first.x);
    expect(c.valueAxis.fullExtent[1]).toBeLessThan(
      initial.composed.valueAxis.fullExtent[1]!,
    );
    expect(c.category.fullExtent).toEqual(initial.composed.category.fullExtent);
  });
  it.each([
    "rangeBar",
    "rangeArea",
  ] as const)("crops %s once through a silent carrier and retains full miniature", (family) => {
    const base = rangeLiveInput(family);
    const initial = live(base);
    const cropped = initial.projectNavigationWindow(initial.options, {
      dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
    });
    const metadata = (cropped as any).openbbRange;
    expect(metadata.composed.category.visibleExtent).not.toEqual(
      initial.composed.category.visibleExtent,
    );
    expect(metadata.composed.category.fullExtent).toEqual(
      initial.composed.category.fullExtent,
    );
    expect(cropped.grid).toEqual(initial.options.grid);
    const xs = Array.isArray(cropped.xAxis) ? cropped.xAxis : [cropped.xAxis];
    const zoom = Array.isArray(cropped.dataZoom) ? cropped.dataZoom : [];
    expect(
      zoom
        .filter((z) => z.id !== "openbb-range-inside")
        .every((z) =>
          (z as any).xAxisIndex.every(
            (n: number) => xs[n]?.id === "openbb-range-carrier",
          ),
        ),
    ).toBe(true);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...base.viewport,
    });
    try {
      chart.setOption(cropped);
      const c = metadata.composed;
      const value = c.category.visibleExtent[0];
      expect(chart.convertToPixel({ xAxisIndex: 0 }, value) as number).toBeCloseTo(
        c.plot.left,
      );
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
      expect(
        (cropped.series as any[]).filter((s) => String(s.id).startsWith("openbb-mini-"))
          .length,
      ).toBeGreaterThan(0);
    } finally {
      chart.dispose();
    }
    expect(initial.projectPointer(cropped)?.plot).toEqual(metadata.composed.plot);
    expect(rangePointerCandidates(metadata.composed)).not.toEqual(
      rangePointerCandidates(initial.composed),
    );
  });
  it("uses physical-x value navigation for horizontal Bar and replans enabled value extent on legend", () => {
    const base = rangeLiveInput();
    const initial = live({
      ...base,
      baseline: {
        ...base.baseline,
        options: { "range-bar": { series: { direction: "horizontal" } } },
      },
    });
    const cropped = initial.projectNavigationWindow(initial.options, {
      dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
    });
    const c = (cropped as any).openbbRange.composed;
    expect(c.valueAxis.visibleExtent[0]).toBeGreaterThan(
      initial.composed.valueAxis.fullExtent[0]!,
    );
    expect(c.category.visibleExtent).toEqual(initial.composed.category.visibleExtent);
    const hidden = initial.projectLegendSelection({ other: false });
    expect(
      (hidden as any).openbbRange.composed.projection.fields.find(
        (f: any) => f.descriptor.id === "other",
      ).enabled,
    ).toBe(false);
    expect(initial.projectPointer(hidden)).not.toEqual(
      initial.projectPointer(initial.options),
    );
  });
});
