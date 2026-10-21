import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { init, setPlatformAPI, getInstanceByDom, type EChartsOption } from "echarts";
import { createChartLifecycle } from "../../../src/components/General/Table/Chart/echarts/lifecycle";

// Retain the real browser-mode engine and HTML tooltips; only choose SVG for jsdom painting.
vi.mock("echarts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts")>();
  return { ...actual, init: (container: HTMLDivElement) => actual.init(container, undefined, { renderer: "svg" }) };
});

const content = "Native legend tooltip";
function options(): EChartsOption {
  return {
    animation: false,
    tooltip: { trigger: "item", confine: true, showDelay: 0, transitionDuration: 0 },
    legend: { data: ["a", "b"], tooltip: { show: true, formatter: () => content } },
    series: [{ type: "pie", data: [{ name: "a", value: 1 }, { name: "b", value: 2 }] }],
  };
}
function container(): HTMLDivElement {
  const node = document.createElement("div"); document.body.append(node);
  Object.defineProperties(node, { clientWidth: { value: 400 }, clientHeight: { value: 200 } });
  return node;
}
function visibleHtmlTooltip(node: HTMLDivElement): void {
  const tooltip = [...node.querySelectorAll("div")].find((element) => element.textContent === content);
  expect(tooltip, "fresh native HTML tooltip content, distinct from legend SVG text").toBeDefined();
  expect(tooltip?.style.display).not.toBe("none");
  expect(tooltip?.style.visibility).not.toBe("hidden");
  expect(tooltip?.style.opacity).not.toBe("0");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  setPlatformAPI({ measureText: (text) => ({ width: String(text).length * 7 }) });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren(); });

it("reproduces the pinned engine's queued tooltip refresh against replaced HTML content", () => {
  const node = container(); const chart = init(node);
  try {
    chart.setOption(options(), { notMerge: true });
    chart.dispatchAction({ type: "showTip", legendIndex: 0, name: "b" });
    visibleHtmlTooltip(node);
    chart.resize();
    chart.setOption(options(), { notMerge: true });
    expect(() => vi.advanceTimersByTime(1)).toThrow(/Cannot set properties of null.*innerHTML/);
  } finally { chart.dispose(); }
});

it("neutralizes a resize-queued native tooltip before lifecycle repaint and retains selection/tooltips", () => {
  const node = container(); const owner = createChartLifecycle(node);
  const projectLegendSelection = () => options();
  const request = { revision: 1, options: options(), legendScope: "native-tooltip", projectLegendSelection };
  try {
    owner.mount(request);
    const chart = getInstanceByDom(node)!;
    chart.dispatchAction({ type: "legendToggleSelect", name: "a" });
    chart.dispatchAction({ type: "showTip", legendIndex: 0, name: "b" });
    visibleHtmlTooltip(node);
    owner.resize();
    expect(() => vi.advanceTimersByTime(1)).not.toThrow();
    expect((chart.getOption().legend as { selected: Record<string, boolean> }[])[0].selected).toEqual({ a: false, b: true });
    chart.dispatchAction({ type: "showTip", legendIndex: 0, name: "b" });
    visibleHtmlTooltip(node);
    expect(() => owner.exportImage(undefined, 1)).not.toThrow();
  } finally { owner.dispose(); }
});

it("expires the old hover when the incoming replacement omits tooltip", () => {
  const node = container(); const owner = createChartLifecycle(node);
  try {
    owner.mount({ revision: 1, options: options() });
    const chart = getInstanceByDom(node)!;
    chart.dispatchAction({ type: "showTip", legendIndex: 0, name: "b" });
    owner.resize();
    const { tooltip: _tooltip, ...withoutTooltip } = options();
    owner.update({ revision: 2, options: withoutTooltip });
    expect(() => vi.advanceTimersByTime(1)).not.toThrow();
    owner.update({ revision: 3, options: options() });
    chart.dispatchAction({ type: "showTip", legendIndex: 0, name: "b" });
    visibleHtmlTooltip(node);
  } finally { owner.dispose(); }
});
