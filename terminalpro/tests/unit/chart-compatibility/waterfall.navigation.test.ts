import { expect, it } from "vitest";
import { bars, engine, projected, waterfallInput } from "./waterfall.fixtures";

it("keeps horizontal duplicate continuous categories and singleton width finite", () => {
  for (const values of [[10, -3, 2], [10]]) {
    const input = waterfallInput(values);
    input.appearance.series.direction = "horizontal";
    input.appearance.application.axes.category.fields.type = "number";
    input.appearance.application.axes.category.fields.position = "left";
    input.appearance.application.axes.number.fields.position = "bottom";
    input.snapshot.rows.forEach((r, i) => {
      r.category = [5, 5, 1][i];
    });
    const result = projected(input);
    expect((result.options.series as any)[0].data.map((d: any) => d.value[2])).toEqual(
      values.length === 1 ? [10] : [10, 7, 9],
    );
    engine(result.options, (chart) => {
      expect(bars(chart)).toHaveLength(values.length);
      for (const bar of bars(chart)) expect(bar.shape.height).toBeGreaterThan(0);
    });
  }
});

function zoom(
  result: ReturnType<typeof projected>,
  start: number,
  end: number,
  numeric = [0, 100],
) {
  return result.projectNavigationWindow!(result.options, {
    dataZoom: [
      { id: "openbb-navigator", start, end },
      { id: "openbb-waterfall-number-inside", start: numeric[0], end: numeric[1] },
    ],
  });
}
it("crops the precomputed full prefix and keeps duplicate-labelled source identities", () => {
  const result = projected(waterfallInput([10, -3, 2, -1]));
  const options: any = zoom(result, 50, 100);
  expect(options.series[0].data).toEqual([
    { id: "source-2", value: [0, 7, 9, 2, 2] },
    { id: "source-3", value: [1, 9, 8, -1, 3] },
  ]);
  engine(options, (chart) => expect(bars(chart)).toHaveLength(2));
  expect((zoom(result, 0, 100).series as any)[0].data[0].value).toEqual([
    0, 0, 10, 10, 0,
  ]);
});
it("retains hidden default zoom and consumes axis, scrolling and panning policy", () => {
  const input = waterfallInput();
  let options: any = projected(input).options;
  expect(options.dataZoom[0]).toMatchObject({ id: "openbb-navigator", show: false });
  expect(options.dataZoom[1]).toMatchObject({
    zoomOnMouseWheel: true,
    moveOnMouseMove: true,
  });
  expect(options.dataZoom[2]).toMatchObject({
    zoomOnMouseWheel: false,
    moveOnMouseMove: false,
  });
  input.navigation.zoom.scaleX = false;
  input.navigation.zoom.scaleY = true;
  input.navigation.zoom.scrolling = false;
  input.navigation.zoom.panning = false;
  options = projected(input).options;
  expect(
    options.dataZoom
      .slice(1)
      .every((z: any) => !z.zoomOnMouseWheel && !z.moveOnMouseMove),
  ).toBe(true);
  input.navigation.zoom.enabled = false;
  expect(projected(input).options.dataZoom).toBeUndefined();
});
it("uses full engine coordinates in a miniature and reserves main label space", () => {
  const input = waterfallInput([10, -3, 2, -1]);
  input.miniChartEnabled = true;
  const result = projected(input);
  const cropped: any = zoom(result, 50, 100);
  const mini = cropped.series.find(
    (s: any) => s.id === "openbb-mini-openbb-waterfall-data",
  );
  expect(mini.data.map((d: any) => d.value[4])).toEqual([0, 1, 2, 3]);
  engine(cropped, (chart) => {
    expect(bars(chart)).toHaveLength(6);
    const main = chart.convertToPixel({ gridIndex: 0 }, [0, 9]) as number[];
    const miniature = chart.convertToPixel({ gridIndex: 1 }, [0, 10]) as number[];
    expect(miniature[1]).toBeGreaterThan(main[1]);
    expect(bars(chart).filter((r) => r.shape.y > 300)).toHaveLength(4);
  });
  input.navigation.showInMiniChart = false;
  expect(
    (projected(input).options.series as any[]).filter((s) =>
      String(s.id).startsWith("openbb-mini-"),
    ),
  ).toHaveLength(0);
});
it("maps horizontal category navigation to y and preserves top-to-bottom order", () => {
  const input = waterfallInput([10, -3, 2]);
  input.appearance.series.direction = "horizontal";
  input.appearance.application.axes.category.fields.position = "left";
  input.appearance.application.axes.number.fields.position = "bottom";
  input.miniChartEnabled = true;
  const result = projected(input);
  const options: any = zoom(result, 34, 100);
  expect(options.dataZoom[0].yAxisIndex).toBeDefined();
  engine(options, (chart) => {
    const first = chart.convertToPixel({ gridIndex: 0 }, [7, 0]) as number[];
    const second = chart.convertToPixel({ gridIndex: 0 }, [9, 1]) as number[];
    expect(first[1]).toBeLessThan(second[1]);
    expect(bars(chart)[0].shape.width).toBeGreaterThan(0);
  });
});
it("consumes autoscale padding/minimum observations and numeric-axis window", () => {
  const input = waterfallInput([100, -1, -1, -1]);
  input.navigation.autoScale.padding = 0.5;
  const result = projected(input);
  expect((zoom(result, 50, 100).yAxis as any[])[0]).toMatchObject({
    min: 96,
    max: 100,
  });
  input.navigation.autoScale.minVisibleItems = 3;
  const limited = projected(input);
  expect((zoom(limited, 50, 100).yAxis as any[])[0]).toMatchObject({
    min: 0,
    max: 100,
  });
  expect((zoom(limited, 0, 100, [50, 100]).yAxis as any[])[0]).toMatchObject({
    min: 50,
    max: 100,
  });
});
it("follows native hidden-carrier zoom events and crops full continuous categories by their domain", () => {
  const input = waterfallInput([10, -3, 2]);
  input.appearance.application.axes.category.fields.type = "number";
  input.snapshot.rows.forEach((row, i) => {
    row.category = [20, 5, 10][i];
  });
  const result = projected(input);
  engine(result.options, (chart) => {
    chart.dispatchAction({
      type: "dataZoom",
      dataZoomId: "openbb-navigator",
      start: 0,
      end: 50,
    });
    const cropped: any = result.projectNavigationWindow!(
      result.options,
      chart.getOption(),
    );
    expect(
      cropped.series[0].data.map((d: any) => [d.id, d.value[1], d.value[2]]),
    ).toEqual([
      ["source-1", 10, 7],
      ["source-2", 7, 9],
    ]);
    chart.setOption(cropped, { notMerge: true });
    expect(bars(chart)).toHaveLength(2);
    expect(
      result.projectPointer!(cropped)!.present({ key: "source-1" })!.html,
    ).toContain("number:-3");
  });
});
