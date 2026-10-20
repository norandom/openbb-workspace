import { expect, it } from "vitest";
import { cartesianNavigator, retainNavigatorExtent } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigator";
const theme: any = { navigatorBorderColor: "#444", colors: { textColor: "#fff", foregroundColor: "#111", chartBackgroundColor: "#111" } };
const source = (): any => ({ grid: { left: 30, right: 30, top: 10, bottom: 20 }, xAxis: [{ id: "x", type: "category", data: ["a", "b"] }], yAxis: [{ id: "usd", type: "value", min: -100, max: 1000 }, { id: "eps", type: "value", min: 0, max: 5, offset: 70, inverse: true, interval: 1 }], series: [{ id: "revenue", name: "revenue", type: "bar", data: [100, 200], yAxisIndex: 0 }, { id: "eps", name: "eps", type: "line", data: [1, 2], yAxisIndex: 1 }] });
it("clones every independent scale and remaps series", () => {
 const input = source(); const before = structuredClone(input);
 const out: any = cartesianNavigator(input, true, true, theme, { width: 800 });
 expect(out.yAxis).toHaveLength(4);
 expect(out.series.slice(2).map((s: any) => s.yAxisIndex)).toEqual([2, 3]);
 expect(out.yAxis[3]).toMatchObject({ min: 0, max: 5, interval: 1, inverse: true, offset: 0, show: false, gridIndex: 1 });
 expect(out.dataZoom[0].xAxisIndex).toEqual([0]); expect(input).toEqual(before);
});
it("keeps disabled identity and retained slider ranges", () => {
 const input = source(); expect(cartesianNavigator(input, false, false, theme, { width: 800 })).toBe(input);
 const out: any = cartesianNavigator(input, true, false, theme, { width: 800 });
 expect(out.xAxis).toBe(input.xAxis);
 expect((retainNavigatorExtent(out, { dataZoom: [{ id: "openbb-navigator", start: 21, end: 73 }] }) as any).dataZoom[0]).toMatchObject({ start: 21, end: 73 });
});
import { init } from "echarts";
import { beforeEach, vi } from "vitest";
import { translateCombo } from "../../../src/components/General/Table/Chart/echarts/combo";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (s: string) => ({ width: s.length * 6 }) } as any));
function combo(hidden = false, allSecondary = false): any {
 const { application, series, line, ...common } = applicationStyle();
 const { axes, series: effective, ...shared } = application;
 effective.shadow.enabled = false;
 const ids = allSecondary ? ["eps", "yield"] : ["area", "eps", "yield"];
 const input: any = {
  snapshot: { ...validSnapshotInput, columns: ids.map(id => ({ id, label: id, role: "number" })), selectedColumnIds: ids,
   rows: [0, 1, 2].map(i => ({ id: String(i), category: "Repeated", values: { area: 1000 * (i + 1), eps: i + 1, yield: 20 + i } })) },
  assignments: ids.map(id => ({ colId: id, chartType: id === "area" ? "area" : "line", secondaryAxis: id !== "area" })),
  style: { common, application: shared, axes: { category: axes.category, primary: axes.number, secondary: { eps: axes.number, yield: axes.number } }, geometry: { area: { series: effective, overrides: {} }, line: { series: effective, overrides: {} } } },
  context: { ...mappingContext(), ...(hidden ? { legendSelection: { area: false, eps: false } } : {}) },
 };
 const result = translateCombo(input); if (result.status !== "supported") throw Error(JSON.stringify(result)); return result.options;
}
it.each([false, true])("renders actual combo miniature with independent axes (all secondary: %s)", allSecondary => {
 const overview = combo(false, allSecondary), main = combo(true, allSecondary);
 const before = JSON.stringify(overview);
 const out: any = cartesianNavigator(main, true, true, theme, { width: 800 }, overview);
 const mainCount = main.series.length, axisCount = overview.yAxis.length;
 expect(out.series.slice(mainCount)).toHaveLength(overview.series.length);
 for (let i = 0; i < overview.series.length; i++) {
  expect(out.series[mainCount + i].yAxisIndex).toBe(axisCount + (overview.series[i].yAxisIndex ?? 0));
  expect(out.series[mainCount + i].data).toEqual(overview.series[i].data);
 }
 const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 800, height: 500 });
 try {
  chart.setOption({ ...out, animation: false });
  const native = (chart as any).getModel().getSeries();
  const mini = native.slice(mainCount);
  for (const series of mini) {
   expect(series.coordinateSystem.getAxis("y").model.componentIndex).toBe(series.option.yAxisIndex);
   expect(series.coordinateSystem.getAxis("x").model.componentIndex).toBe(1);
   expect(series.coordinateSystem.master.model.componentIndex).toBe(1);
  }
  const eps = mini.find((s: any) => s.option.id.startsWith("openbb-mini-eps"));
  const yieldSeries = mini.find((s: any) => s.option.id.startsWith("openbb-mini-yield"));
  expect(eps.coordinateSystem.getAxis("y").scale.getExtent()[1]).toBeLessThan(yieldSeries.coordinateSystem.getAxis("y").scale.getExtent()[1]);
  expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
 } finally { chart.dispose(); }
 expect(JSON.stringify(overview)).toBe(before);
});
it("allocates collision-free deterministic IDs, names, axes and stacks", () => {
 const overview = source(); overview.series[0].stack = "s"; overview.series[1].stack = "s";
 const main = source(); main.series.push({ id: "openbb-mini-revenue", name: "openbb-mini-revenue", type: "bar", stack: "openbb-mini-s", data: [1,2] });
 main.yAxis.push({ id: "openbb-mini-usd", type: "value" });
 const render = () => cartesianNavigator(main, true, true, theme, { width: 800 }, overview) as any;
 const out = render(); expect(out).toEqual(render());
 for (const key of ["id", "name"]) expect(new Set(out.series.map((s: any) => s[key])).size).toBe(out.series.length);
 expect(new Set(out.yAxis.map((s: any) => s.id)).size).toBe(out.yAxis.length);
 expect(out.series[3].stack).toBe(out.series[4].stack); expect(out.series[3].stack).not.toBe("openbb-mini-s");
});
it("resolves axis IDs and rejects conflicting, unresolved or invalid selectors", () => {
 const input = source(); input.series[1].yAxisId = "eps";
 expect((cartesianNavigator(input, true, true, theme, { width: 800 }) as any).series[3].yAxisIndex).toBe(3);
 for (const value of [{ yAxisId: "missing" }, { yAxisId: "usd" }, { yAxisIndex: -1 }, { yAxisIndex: 1.5 }, { yAxisIndex: 9 }]) {
  const bad = source(); Object.assign(bad.series[1], value);
  expect(() => cartesianNavigator(bad, true, true, theme, { width: 800 })).toThrow(/axis reference/);
 }
});
it("preserves singular horizontal axes and only targets main X axes", () => {
 const input = source(); input.xAxis = { type: "value", min: -50, max: 50, inverse: true }; input.yAxis = { type: "category", inverse: true, data: ["a", "b"] }; input.series = [input.series[0]];
 const out: any = cartesianNavigator(input, false, true, theme, { width: 800 });
 expect(out.dataZoom[0]).toMatchObject({ xAxisIndex: [0], filterMode: "none" });
 expect(out.xAxis[1]).toMatchObject({ type: "value", min: -50, max: 50, inverse: true, show: true });
 expect(out.yAxis[1]).toMatchObject({ data: ["a", "b"], inverse: true });
});
it("targets all main X axes while leaving overview axes outside the slider", () => {
 const input = source(); input.xAxis.push({ id: "x2", type: "category", data: ["c", "d"] }); input.series[1].xAxisIndex = 1;
 const out: any = cartesianNavigator(input, true, true, theme, { width: 800 });
 expect(out.dataZoom[0].xAxisIndex).toEqual([0, 1]);
 expect(out.series.slice(2).map((s: any) => s.xAxisIndex)).toEqual([2, 3]);
 expect(out.xAxis[3].data).toEqual(["c", "d"]);
});
it("clamps retained ranges and ignores missing or nonfinite ranges", () => {
 const input = cartesianNavigator(source(), true, false, theme, { width: 800 });
 expect(retainNavigatorExtent(input, {})).toBe(input);
 expect(retainNavigatorExtent(input, { dataZoom: { id: "openbb-navigator", start: NaN, end: 30 } })).toBe(input);
 expect((retainNavigatorExtent(input, { dataZoom: { id: "openbb-navigator", start: -5, end: 120 } }) as any).dataZoom[0]).toMatchObject({ start: 0, end: 100 });
});
