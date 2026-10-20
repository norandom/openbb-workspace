import { init, type EChartsOption } from "echarts";
import { expect, it } from "vitest";
import "../../../src/components/General/Table/Chart/echarts/xyClip";

function options(optIn = true): EChartsOption {
  return {
    animation: false,
    grid: { left: 20, right: 20, top: 10, bottom: 10 },
    xAxis: { show: false, min: 0, max: 10 }, yAxis: { show: false, min: 0, max: 10 },
    series: [{ id: "openbb-mini-xy:test", type: "scatter", symbolSize: 60,
      data: [[0, 0], [10, 10]], openbbXyMiniClip: optIn } as any],
  };
}

it("clips miniature bubble pixels to the coordinate rectangle through resize and export", () => {
  const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 300, height: 100 });
  try {
    chart.setOption(options());
    const svg = chart.renderToSVGString();
    expect(svg).toMatch(/clip-path="url\(#/);
    expect(svg).toContain('d="M20 10l260 0l0 80l-260 0Z"');
    expect(svg.match(/matrix\(30,0,0,30,/g)).toHaveLength(2);
    chart.resize({ width: 400, height: 120 });
    expect(chart.renderToSVGString()).toContain('d="M20 10l360 0l0 100l-360 0Z"');
    chart.setOption(options(false));
    expect(chart.renderToSVGString()).not.toMatch(/clip-path="url\(#/);
  } finally { chart.dispose(); }
});

it("clips only the opted-in miniature when main and miniature share a chart", () => {
  const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 300, height: 100 });
  try {
    const option = options();
    const series = (option.series as any[])[0];
    chart.setOption({ ...option, series: [{ ...series, id: "xy:main" }, series] });
    const document = new DOMParser().parseFromString(chart.renderToSVGString(), "image/svg+xml");
    const main = document.querySelector('[ecmeta_series_index="0"]');
    const miniature = document.querySelector('[ecmeta_series_index="1"]');
    expect(main?.closest('[clip-path]')).toBeNull();
    expect(miniature?.closest('[clip-path]')).not.toBeNull();
    expect(document.querySelectorAll("clipPath")).toHaveLength(1);
  } finally { chart.dispose(); }
});

it("leaves main XY and unrelated scatter series without the extension clip", () => {
  const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 300, height: 100 });
  try {
    const option = options();
    const series = (option.series as any[])[0];
    chart.setOption({ ...option, series: [{ ...series, id: "xy:main" },
      { ...series, id: "openbb-mini-unrelated", openbbXyMiniClip: false }] });
    expect(chart.renderToSVGString()).not.toMatch(/clip-path="url\(#/);
  } finally { chart.dispose(); }
});
