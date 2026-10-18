import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChartLifecycle } from "../../../src/components/General/Table/Chart/echarts/lifecycle";

const mocks = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("echarts", () => ({ init: mocks.init }));
const request = (revision: number) => ({
  revision,
  options: { title: { text: String(revision) } },
});

describe("bounded ECharts ownership", () => {
  let container: HTMLDivElement;
  let width: number;
  let height: number;
  let chart: {
    setOption: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getDataURL: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.resetAllMocks();
    width = 400;
    height = 200;
    container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { get: () => width },
      clientHeight: { get: () => height },
    });
    chart = {
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      getDataURL: vi.fn(() => "data:image/png;base64,chart"),
    };
    mocks.init.mockReturnValue(chart);
  });
  it("mounts complete options and accepts only strictly newer revisions", () => {
    const owner = createChartLifecycle(container);
    expect(() => owner.update(request(0))).toThrow();
    expect(owner.mount(request(1))).toBe("applied");
    expect(chart.setOption).toHaveBeenLastCalledWith(request(1).options, {
      notMerge: true,
    });
    expect(owner.update(request(1))).toBe("stale");
    expect(owner.mount(request(0))).toBe("stale");
    expect(owner.update(request(2))).toBe("applied");
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    expect(mocks.init).toHaveBeenCalledTimes(1);
  });
  it("defers zero size and retains only latest accepted pending work", () => {
    width = 0;
    const owner = createChartLifecycle(container);
    expect(owner.mount(request(1))).toBe("deferred");
    expect(owner.update(request(3))).toBe("deferred");
    expect(owner.update(request(2))).toBe("stale");
    expect(owner.resize()).toBe("deferred");
    expect(() => owner.exportImage()).toThrow();
    expect(mocks.init).not.toHaveBeenCalled();
    width = 500;
    expect(owner.resize()).toBe("applied");
    expect(chart.setOption).toHaveBeenLastCalledWith(request(3).options, {
      notMerge: true,
    });
    height = 0;
    expect(owner.update(request(4))).toBe("deferred");
    expect(() => owner.exportImage()).toThrow();
    height = 300;
    expect(owner.resize()).toBe("applied");
    expect(chart.setOption).toHaveBeenLastCalledWith(request(4).options, {
      notMerge: true,
    });
    expect(chart.resize).toHaveBeenCalled();
  });
  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects invalid revision %s without advancing ordering", (revision) => {
    const owner = createChartLifecycle(container);
    expect(() => owner.mount(request(revision))).toThrow();
    owner.mount(request(1));
    expect(() => owner.update(request(revision))).toThrow();
    expect(owner.update(request(2))).toBe("applied");
  });
  it("exports PNG with public options and propagates errors without losing ownership", () => {
    const owner = createChartLifecycle(container);
    expect(() => owner.exportImage()).toThrow();
    owner.mount(request(1));
    expect(owner.exportImage({ pixelRatio: 2, backgroundColor: "white" })).toContain(
      "data:image/png",
    );
    expect(chart.getDataURL).toHaveBeenCalledWith({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "white",
    });
    chart.getDataURL.mockImplementationOnce(() => {
      throw new Error("export");
    });
    expect(() => owner.exportImage()).toThrow("export");
    expect(owner.update(request(2))).toBe("applied");
  });
  it("exports only the applied pending expected revision, including resize recovery before apply", () => {
    const owner = createChartLifecycle(container);
    owner.mount(request(1));
    expect(() => owner.exportImage(undefined, 2)).toThrow();
    expect(() => owner.exportImage(undefined, Number.NaN)).toThrow();
    expect(owner.exportImage(undefined, 1)).toContain("data:image/png");
    width = 0;
    expect(owner.update(request(2))).toBe("deferred");
    width = 400;
    expect(() => owner.exportImage(undefined, 1)).toThrow();
    expect(() => owner.exportImage(undefined, 2)).toThrow();
    expect(() => owner.exportImage()).toThrow();
    owner.resize();
    expect(owner.exportImage(undefined, 2)).toContain("data:image/png");
    expect(() => owner.exportImage(undefined, 1)).toThrow();
    owner.dispose();
    expect(() => owner.exportImage(undefined, 2)).toThrow();
  });
  it("retains the transient navigator extent during redraw and resets it after hiding", () => {
    const getOption = vi.fn(() => ({
      dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
    }));
    Object.assign(chart, { getOption, on: vi.fn() });
    const zoom = (revision: number) => ({
      ...request(revision),
      options: {
        dataZoom: [
          { id: "openbb-navigator", type: "slider" as const, start: 0, end: 100 },
        ],
      },
    });
    const owner = createChartLifecycle(container);
    owner.mount(zoom(1));
    owner.update(zoom(2));
    expect(chart.setOption.mock.lastCall?.[0].dataZoom[0]).toMatchObject({
      start: 25,
      end: 75,
    });
    owner.update(request(3));
    owner.update(zoom(4));
    expect(chart.setOption.mock.lastCall?.[0].dataZoom[0]).toMatchObject({
      start: 0,
      end: 100,
    });
  });
  it.each([
    "setOption",
    "resize",
  ] as const)("cleans up %s failure and can recover last accepted work", (operation) => {
    const owner = createChartLifecycle(container);
    owner.mount(request(1));
    chart[operation].mockImplementationOnce(() => {
      throw new Error(operation);
    });
    expect(() =>
      operation === "setOption" ? owner.update(request(2)) : owner.resize(),
    ).toThrow(operation);
    expect(chart.dispose).toHaveBeenCalledTimes(1);
    expect(owner.resize()).toBe("applied");
    expect(chart.setOption).toHaveBeenLastCalledWith(request(1).options, {
      notMerge: true,
    });
    expect(owner.update(request(2))).toBe("applied");
  });
  it("releases failed initial option application and retries on resize", () => {
    chart.setOption.mockImplementationOnce(() => {
      throw new Error("initial option");
    });
    const owner = createChartLifecycle(container);
    expect(() => owner.mount(request(1))).toThrow("initial option");
    expect(chart.dispose).toHaveBeenCalledTimes(1);
    expect(owner.resize()).toBe("applied");
  });
  it("propagates initialization failure and permits recovery", () => {
    mocks.init.mockImplementationOnce(() => {
      throw new Error("init");
    });
    const owner = createChartLifecycle(container);
    expect(() => owner.mount(request(1))).toThrow("init");
    expect(owner.resize()).toBe("applied");
  });
  it("retains deferred revision after recovery fails and preserves the primary failure", () => {
    width = 0;
    const owner = createChartLifecycle(container);
    owner.mount(request(1));
    owner.update(request(4));
    width = 400;
    chart.setOption.mockImplementationOnce(() => {
      throw new Error("apply");
    });
    chart.dispose.mockImplementationOnce(() => {
      throw new Error("cleanup");
    });
    expect(() => owner.resize()).toThrow("apply");
    expect(owner.update(request(3))).toBe("stale");
    expect(owner.resize()).toBe("applied");
    expect(chart.setOption).toHaveBeenLastCalledWith(request(4).options, {
      notMerge: true,
    });
  });
  it("terminal disposal prevents stale owners affecting a replacement", () => {
    const old = createChartLifecycle(container);
    old.mount(request(1));
    old.dispose();
    old.dispose();
    const oldChart = chart;
    chart = {
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      getDataURL: vi.fn(),
    };
    mocks.init.mockReturnValue(chart);
    const replacement = createChartLifecycle(container);
    replacement.mount(request(1));
    expect(old.mount(request(Number.NaN))).toBe("disposed");
    expect(old.update(request(10))).toBe("disposed");
    expect(old.resize()).toBe("disposed");
    expect(() => old.exportImage()).toThrow();
    expect(oldChart.dispose).toHaveBeenCalledTimes(1);
    expect(chart.dispose).not.toHaveBeenCalled();
    expect(replacement.update(request(2))).toBe("applied");
  });
  it("discards deferred work on disposal and remains terminal if cleanup throws", () => {
    width = 0;
    const pending = createChartLifecycle(container);
    pending.mount(request(1));
    pending.dispose();
    width = 400;
    expect(pending.resize()).toBe("disposed");
    expect(mocks.init).not.toHaveBeenCalled();
    const owner = createChartLifecycle(container);
    owner.mount(request(1));
    chart.dispose.mockImplementationOnce(() => {
      throw new Error("cleanup");
    });
    expect(() => owner.dispose()).toThrow("cleanup");
    expect(() => owner.dispose()).not.toThrow();
    expect(owner.resize()).toBe("disposed");
  });
});

it("uses latest native legend selection, prunes IDs, retains zoom and resets scope", () => {
  let native: Record<string, unknown> = {};
  const listeners = new Map<string, () => void>();
  const chart = {
    setOption: vi.fn((options) => { native = options; }), getOption: vi.fn(() => native),
    on: vi.fn((event, cb) => listeners.set(event, cb)), off: vi.fn(),
    resize: vi.fn(), dispose: vi.fn(), getDataURL: vi.fn(() => "data:image/png,current"),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { value: 400 }, clientHeight: { value: 200 } });
  const options = (ids = ["a", "b"]) => ({ legend: { data: ids }, dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }] });
  const first = vi.fn(() => options()); const latest = vi.fn(() => options(["b", "c"]));
  const owner = createChartLifecycle(container);
  owner.mount({ revision: 1, options: options(), legendScope: "one", projectLegendSelection: first });
  native = { legend: [{ selected: { a: false, b: false, "openbb-mini-a": false } }], dataZoom: [{ id: "openbb-navigator", start: 20, end: 60 }] };
  listeners.get("legendselectchanged")?.();
  expect(first).toHaveBeenLastCalledWith({ a: false, b: false });
  owner.update({ revision: 2, options: options(["b", "c"]), legendScope: "one", projectLegendSelection: latest });
  expect(latest).toHaveBeenLastCalledWith({ b: false, c: true });
  expect(chart.setOption.mock.lastCall?.[0].dataZoom).toMatchObject([{ start: 20, end: 60 }]);
  const stale = vi.fn(() => options());
  owner.update({ revision: 1, options: options(), legendScope: "one", projectLegendSelection: stale });
  chart.setOption.mockImplementation((options) => {
    native = options;
    listeners.get("legendselectchanged")?.();
  });
  owner.resize(); expect(latest).toHaveBeenCalledTimes(2);
  expect(stale).not.toHaveBeenCalled();
  expect(chart.on.mock.calls.filter(([event]) => event === "legendselectchanged")).toHaveLength(1);
  owner.update({ revision: 3, options: options(), legendScope: "two", projectLegendSelection: first });
  expect(first).toHaveBeenLastCalledWith({ a: true, b: true });
  expect(chart.setOption.mock.lastCall?.[0].dataZoom).toMatchObject([{ start: 0, end: 100 }]);
  const onError = vi.fn(() => expect(() => owner.exportImage()).toThrow());
  owner.update({ revision: 4, options: options(), legendScope: "two", projectLegendSelection: first, onError });
  const late = listeners.get("legendselectchanged");
  first.mockImplementationOnce(() => { throw new Error("projection"); });
  late?.(); expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "projection" }));
  expect(chart.off).toHaveBeenCalledWith("legendselectchanged", late);
  expect(chart.dispose).toHaveBeenCalledTimes(1);
  owner.resize();
  expect(owner.exportImage(undefined, 4)).toContain("current");
  const calls = first.mock.calls.length;
  late?.(); expect(first).toHaveBeenCalledTimes(calls);
  owner.dispose(); late?.(); expect(chart.dispose).toHaveBeenCalledTimes(2);
});

it("releases listeners if normalized initialization fails and recovers without reviving old callbacks", () => {
  const callbacks: (() => void)[] = [];
  const chart = { on: vi.fn((_event, callback) => callbacks.push(callback)), off: vi.fn(),
    setOption: vi.fn().mockImplementationOnce(() => { throw new Error("initial normalized"); }),
    getOption: vi.fn(() => ({})), dispose: vi.fn(), resize: vi.fn(), getDataURL: vi.fn(),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { value: 400 }, clientHeight: { value: 200 } });
  const projectLegendSelection = vi.fn(() => ({ legend: { data: ["a"] } }));
  const owner = createChartLifecycle(container);
  expect(() => owner.mount({ revision: 1, options: { legend: { data: ["a"] } }, legendScope: "one", projectLegendSelection })).toThrow("initial normalized");
  expect(chart.off).toHaveBeenCalledWith("legendselectchanged", callbacks[0]);
  expect(chart.dispose).toHaveBeenCalledTimes(1);
  owner.resize(); const calls = projectLegendSelection.mock.calls.length;
  callbacks[0](); expect(projectLegendSelection).toHaveBeenCalledTimes(calls);
});

it("resets native selection and zoom across accepted deferred A to B to A scopes", () => {
  let width = 400;
  let native = {};
  const options = { legend: { data: ["a"] }, dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }] };
  const projectLegendSelection = vi.fn(() => options);
  const chart = {
    setOption: vi.fn((value) => { native = value; }), getOption: vi.fn(() => native),
    on: vi.fn(), off: vi.fn(), resize: vi.fn(), dispose: vi.fn(), getDataURL: vi.fn(),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { get: () => width }, clientHeight: { value: 200 } });
  const owner = createChartLifecycle(container);
  const scoped = (revision: number, legendScope: string) => ({ revision, legendScope, options, projectLegendSelection });
  owner.mount(scoped(1, "A"));
  native = { legend: [{ selected: { a: false } }], dataZoom: [{ id: "openbb-navigator", start: 20, end: 60 }] };
  width = 0;
  expect(owner.update(scoped(2, "B"))).toBe("deferred");
  expect(owner.update(scoped(3, "A"))).toBe("deferred");
  expect(owner.update(scoped(2, "B"))).toBe("stale");
  width = 400;
  owner.resize();
  expect(projectLegendSelection).toHaveBeenLastCalledWith({ a: true });
  expect(chart.setOption.mock.lastCall?.[0].dataZoom).toMatchObject([{ start: 0, end: 100 }]);
});
