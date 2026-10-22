import { type EChartsOption, graphic, init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import { areaInput } from "./rangeArea.fixtures";
import { rangeInput, rangeOptions } from "./rangeBar.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function render(
  options: EChartsOption,
  check: (chart: ReturnType<typeof init>) => void,
) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
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
for (const direction of ["vertical", "horizontal"] as const) {
  it(`reverses ${direction} Bar geometry without exchanging min/max labels`, () => {
    const input = rangeInput(direction);
    input.style.categoryCoordinates = {
      kind: "category",
      fullExtent: [-0.5, 2.5],
      ticks: [],
      reverse: true,
    };
    input.style.valueScale!.reverse = true;
    input.style.fields.amount.label.enabled = true;
    input.context.legendSelection = { other: false };
    input.context.display = {
      ...input.context.display,
      seriesLabel: (v) => `endpoint${v}`,
    };
    render(rangeOptions(input), (chart) => {
      const vertical = direction === "vertical";
      const axes = chart.getOption() as {
        xAxis: { inverse: boolean }[];
        yAxis: { inverse: boolean }[];
      };
      expect((vertical ? axes.xAxis : axes.yAxis)[0].inverse).toBe(vertical);
      expect((vertical ? axes.yAxis : axes.xAxis)[0].inverse).toBe(true);
      const labels = chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((e) => e.type === "tspan");
      const center = (text: string) => {
        const item = labels.find(
          (e) => (e as unknown as { style: { text: string } }).style.text === text,
        );
        expect(item).toBeDefined();
        const rect = item!.getBoundingRect().clone();
        if (item!.transform) rect.applyTransform(item!.transform);
        return vertical ? rect.y + rect.height / 2 : rect.x + rect.width / 2;
      };
      if (vertical) expect(center("endpoint2")).toBeLessThan(center("endpoint8"));
      else expect(center("endpoint2")).toBeGreaterThan(center("endpoint8"));
    });
  });
}
it("keeps reversed Area hit cells positive and anchored to the actual reversed coordinates", () => {
  const input = areaInput();
  input.style.categoryCoordinates = {
    kind: "category",
    fullExtent: [-0.5, 2.5],
    ticks: [],
    reverse: true,
  };
  input.style.valueScale!.reverse = true;
  const translated = translateRangeArea(input);
  expect(translated.status).toBe("supported");
  if (translated.status !== "supported") throw Error(JSON.stringify(translated));
  render(translated.options, (chart) => {
    const axes = chart.getOption() as {
      xAxis: { inverse: boolean }[];
      yAxis: { inverse: boolean }[];
    };
    expect(axes.xAxis[0].inverse).toBe(true);
    expect(axes.yAxis[0].inverse).toBe(true);
    const targets = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter(
        (e): e is InstanceType<typeof graphic.Rect> =>
          e instanceof graphic.Rect && e.style.fill === "rgba(0,0,0,0)",
      );
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.shape.width).toBeGreaterThan(0);
      expect(target.shape.height).toBeGreaterThanOrEqual(0);
    }
    const first = chart.convertToPixel({ gridIndex: 0 }, [0, 2]) as number[];
    const last = chart.convertToPixel({ gridIndex: 0 }, [2, 10]) as number[];
    expect(first[0]).toBeGreaterThan(last[0]);
    expect(first[1]).toBeLessThan(last[1]);
  });
});
