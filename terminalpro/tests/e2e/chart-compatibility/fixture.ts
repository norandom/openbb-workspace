import * as echarts from "echarts";

const host = document.querySelector<HTMLDivElement>("#chart");
if (!host) throw new Error("Missing synthetic host");
const chart = echarts.init(host, undefined, { renderer: "svg" });
const option: echarts.EChartsOption = {
  animation: false,
  xAxis: { type: "category", data: ["SYNTH_A", "SYNTH_B"] },
  yAxis: { type: "value", name: "USD" },
  series: [{ type: "bar", data: [123.45, 67.89], label: { show: true } }],
};
chart.setOption(option, { notMerge: true });
Object.assign(window, {
  chartFixture: {
    version: echarts.version,
    values: () => (chart.getOption().series as { data: number[] }[])[0].data,
    disposed: () => chart.isDisposed(),
  },
});
document.querySelector("#dispose")?.addEventListener("click", () => {
  chart.dispose();
  document.querySelector("#status")!.textContent = "disposed";
});
window.addEventListener("pagehide", () => chart.dispose(), { once: true });
