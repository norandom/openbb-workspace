import { init } from "echarts";
import { expect, it } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import { translateRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBar";
import { areaInput } from "./rangeArea.fixtures";
import { rangeInput } from "./rangeBar.fixtures";
for (const dimension of ["width", "height"] as const) {
  it(`renders an empty finite plot when ${dimension} has no available space`, () => {
    const bar = rangeInput();
    const area = areaInput();
    bar.context.plot[dimension] = 0;
    area.context.plot[dimension] = 0;
    for (const result of [translateRangeBar(bar), translateRangeArea(area)]) {
      expect(result.status).toBe("supported");
      if (result.status !== "supported") throw Error(JSON.stringify(result));
      expect(result.options.series).toEqual([]);
      const chart = init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 600,
        height: 500,
      });
      try {
        chart.setOption(result.options);
        expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
      } finally {
        chart.dispose();
      }
    }
  });
}
