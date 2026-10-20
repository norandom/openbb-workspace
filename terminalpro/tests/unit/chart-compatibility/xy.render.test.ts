import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateXy } from "../../../src/components/General/Table/Chart/echarts/xy";
import { xyInput } from "./xy.fixtures";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as any),
);
function render(input: any, check: (chart: any, series: any) => void) {
  const result = translateXy(input);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption(result.options);
    check(chart, (chart as any).getModel().getSeries()[0]);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
}
it.each(["scatter", "bubble"])(
  "renders %s triangles with original nominal anchor",
  (family) => {
    const input: any = xyInput();
    input.chartType = family;
    if (family === "scatter")
      input.assignments = [{ xColId: "x", yColId: "y" }];
    input.style.series.markers.shape = "triangle";
    input.style.series.shadow.enabled = false;
    render(input, (chart, series) => {
      const data = series.getData();
      [0, 2].forEach((i) => {
        const raw = series.option.data[i];
        const center = chart.convertToPixel({ seriesIndex: 0 }, raw.value);
        const point = data.getItemLayout(i);
        expect(point[0]).toBeCloseTo(center[0], 4);
        expect(point[1]).toBeCloseTo(center[1], 4);
        const group = data.getItemGraphicEl(i);
        const path = group.childAt(0);
        const rect = path.getUpdatedPathProxy().getBoundingRect().clone();
        rect.applyTransform(path.getComputedTransform());
        const diameter = raw.diameter;
        expect(rect.width).toBeCloseTo(diameter, 4);
        expect(rect.y).toBeCloseTo(center[1] - 0.5 * diameter, 4);
        expect(rect.y + rect.height).toBeCloseTo(
          center[1] + 0.37 * diameter,
          4,
        );
      });
    });
  },
);
it.each(["x", "y"])(
  "keeps explicit %s limits and finite automatic opposite limits",
  (id) => {
    for (const bounds of [
      {},
      { min: -100 },
      { max: 100 },
      { min: -10, max: 100 },
      { min: 100, max: 200 },
    ]) {
      const input: any = xyInput();
      Object.assign(input.style.axes[id], bounds);
      render(input, (_chart, series) => {
        const extent = series.coordinateSystem.getAxis(id).scale.getExtent();
        expect(extent.every(Number.isFinite)).toBe(true);
        expect(extent[0]).toBeLessThan(extent[1]);
        if (bounds.min !== undefined) expect(extent[0]).toBe(bounds.min);
        if (bounds.max !== undefined) expect(extent[1]).toBe(bounds.max);
      });
    }
    for (const bounds of [{ min: 100 }, { max: -100 }]) {
      const input: any = xyInput();
      Object.assign(input.style.axes[id], bounds);
      expect(translateXy(input).status).toBe("invalid");
    }
  },
);
it("retains item-tooltip raw row identity in the renderer for duplicate coordinates", () => {
  const input: any = xyInput();
  input.snapshot.rows[1].values.x = 1;
  input.snapshot.rows[1].values.y = 10;
  render(input, (chart, series) => {
    const data = series.getData();
    expect(data.count()).toBe(3);
    const tooltip = chart.getOption().tooltip[0].formatter;
    for (const index of [1, 0]) {
      const params = series.getDataParams(index);
      expect(params.data.metadata.rowId).toBe(`r${index}`);
      expect(tooltip(params)).toContain(`s: number:${index - 1}`);
      const expected = chart.convertToPixel(
        { seriesIndex: 0 },
        params.data.value,
      );
      expect(data.getItemLayout(index)).toEqual(expected);
    }
  });
});
