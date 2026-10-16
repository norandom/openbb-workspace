// @vitest-environment node
import { expect, test } from "vitest";
import { init, version } from "echarts";

test("pinned real library renders known values through its SVG server renderer", () => {
  expect(version).toBe("6.0.0");
  const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 400 });
  try {
    chart.setOption({
      animation: false,
      xAxis: { type: "category", data: ["SYNTH_A", "SYNTH_B"] },
      yAxis: { type: "value", name: "USD" },
      series: [{ type: "bar", data: [123.45, 67.89], label: { show: true } }],
    });
    const svg = chart.renderToSVGString();
    for (const value of ["SYNTH_A", "SYNTH_B", "USD", "123.45", "67.89"])
      expect(svg).toContain(value);
  } finally {
    chart.dispose();
  }
  expect(chart.isDisposed()).toBe(true);
});
