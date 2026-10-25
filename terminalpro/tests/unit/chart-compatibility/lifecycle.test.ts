import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChartLifecycle } from "../../../src/components/General/Table/Chart/echarts/lifecycle";
import type { PieLegendPagination } from "../../../src/components/General/Table/Chart/echarts/pieLegendTypes";

const mocks = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("echarts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("echarts")>()),
  init: mocks.init,
}));
const request = (revision: number) => ({
  revision,
  options: { title: { text: String(revision) } },
});

describe("hierarchy hover lifecycle join", () => {
  function setup() {
    let width = 400;
    const container = document.createElement("div");
    Object.defineProperties(container, { clientWidth: { get: () => width }, clientHeight: { value: 200 } });
    const listeners = new Map<string, (event: unknown) => void>();
    const chart = { on: vi.fn((name, listener) => listeners.set(name, listener)), off: vi.fn((name) => listeners.delete(name)), setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), dispatchAction: vi.fn(), getDataURL: vi.fn(() => "image") };
    mocks.init.mockReturnValue(chart);
    const plan = { seriesId: "tree", graphicId: "marker", project: (id: string) => id === "leaf" ? { x: 10, y: 20, size: 8, rotation: 0, color: "#fff" } : undefined };
    const owner = createChartLifecycle(container);
    const next = (revision: number) => ({ revision, options: { tooltip: { show: false } }, hierarchyHover: plan });
    const hover = () => listeners.get("mouseover")?.({ seriesId: "tree", data: { id: "leaf" } });
    return { owner, chart, next, hover, listeners, zero: () => { width = 0; }, restore: () => { width = 400; } };
  }
  it("keeps accepted hover on stale commands and expires coordinates until a fresh viewport request", () => {
    const f = setup();
    f.owner.mount(f.next(1));
    f.hover();
    expect(f.chart.setOption).toHaveBeenLastCalledWith({ graphic: [expect.objectContaining({ id: "marker", silent: true })] });
    f.owner.update({ ...f.next(0), hierarchyHover: undefined });
    f.chart.setOption.mockClear(); f.hover();
    expect(f.chart.setOption).toHaveBeenCalledOnce();
    f.owner.resize();
    f.chart.setOption.mockClear(); f.hover();
    expect(f.chart.setOption).not.toHaveBeenCalled();
    f.owner.update(f.next(2)); f.hover();
    expect(f.chart.setOption).toHaveBeenLastCalledWith({ graphic: [expect.objectContaining({ id: "marker" })] });
    f.zero(); f.owner.resize(); f.restore(); f.owner.resize();
    f.chart.setOption.mockClear(); f.hover();
    expect(f.chart.setOption).not.toHaveBeenCalled();
    f.owner.update(f.next(3)); f.hover();
    expect(f.chart.setOption).toHaveBeenCalledTimes(2);
    f.owner.dispose();
    expect(f.listeners.size).toBe(0);
  });
  it("invalidates export and releases every owner when zero-size marker cleanup fails", () => {
    const f = setup(); f.owner.mount(f.next(1)); f.hover(); f.zero();
    f.chart.setOption.mockImplementationOnce(() => { throw Error("marker cleanup"); });
    expect(() => f.owner.update(f.next(2))).toThrow("marker cleanup");
    expect(f.chart.dispose).toHaveBeenCalledOnce();
    expect(() => f.owner.exportImage()).toThrow("unavailable");
    expect(f.listeners.size).toBe(0);
    f.restore(); f.owner.update(f.next(3)); f.hover();
    expect(f.chart.setOption).toHaveBeenLastCalledWith({ graphic: [expect.objectContaining({ id: "marker" })] });
    f.owner.dispose();
  });
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
    dispatchAction: ReturnType<typeof vi.fn>;
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
      dispatchAction: vi.fn(),
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
      dispatchAction: vi.fn(),
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
  it("expires native hover before every replacement and releases a failed public hide action", () => {
    const owner = createChartLifecycle(container);
    owner.mount({ ...request(1), options: { tooltip: { trigger: "item" } } });
    expect(chart.dispatchAction).toHaveBeenLastCalledWith({ type: "hideTip" });
    expect(chart.dispatchAction.mock.invocationCallOrder[0]).toBeLessThan(
      chart.setOption.mock.invocationCallOrder[0],
    );
    chart.dispatchAction.mockImplementationOnce(() => {
      throw new Error("hideTip");
    });
    expect(() => owner.update(request(2))).toThrow("hideTip");
    expect(chart.dispose).toHaveBeenCalledTimes(1);
    expect(chart.setOption).toHaveBeenCalledTimes(1);
    expect(() => owner.exportImage()).toThrow("unavailable");
    expect(owner.resize()).toBe("applied");
    owner.update(request(2));
    expect(chart.dispatchAction).toHaveBeenCalledTimes(4);
    expect(chart.setOption).toHaveBeenLastCalledWith(request(2).options, {
      notMerge: true,
    });
    owner.dispose();
  });
});

it("uses latest native legend selection, prunes IDs, retains zoom and resets scope", () => {
  let native: Record<string, unknown> = {};
  const listeners = new Map<string, () => void>();
  const chart = {
    setOption: vi.fn((options) => {
      native = options;
    }),
    getOption: vi.fn(() => native),
    on: vi.fn((event, cb) => listeners.set(event, cb)),
    off: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getDataURL: vi.fn(() => "data:image/png,current"),
    dispatchAction: vi.fn(),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: 400 },
    clientHeight: { value: 200 },
  });
  const options = (ids = ["a", "b"]) => ({
    legend: { data: ids },
    dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }],
  });
  const first = vi.fn(() => options());
  const latest = vi.fn(() => options(["b", "c"]));
  const owner = createChartLifecycle(container);
  owner.mount({
    revision: 1,
    options: options(),
    legendScope: "one",
    projectLegendSelection: first,
  });
  native = {
    legend: [{ selected: { a: false, b: false, "openbb-mini-a": false } }],
    dataZoom: [{ id: "openbb-navigator", start: 20, end: 60 }],
  };
  listeners.get("legendselectchanged")?.();
  expect(first).toHaveBeenLastCalledWith({ a: false, b: false });
  owner.update({
    revision: 2,
    options: options(["b", "c"]),
    legendScope: "one",
    projectLegendSelection: latest,
  });
  expect(latest).toHaveBeenLastCalledWith({ b: false, c: true });
  expect(chart.setOption.mock.lastCall?.[0].dataZoom).toMatchObject([
    { start: 20, end: 60 },
  ]);
  const stale = vi.fn(() => options());
  owner.update({
    revision: 1,
    options: options(),
    legendScope: "one",
    projectLegendSelection: stale,
  });
  chart.setOption.mockImplementation((options) => {
    native = options;
    listeners.get("legendselectchanged")?.();
  });
  owner.resize();
  expect(latest).toHaveBeenCalledTimes(2);
  expect(stale).not.toHaveBeenCalled();
  expect(
    chart.on.mock.calls.filter(([event]) => event === "legendselectchanged"),
  ).toHaveLength(1);
  owner.update({
    revision: 3,
    options: options(),
    legendScope: "two",
    projectLegendSelection: first,
  });
  expect(first).toHaveBeenLastCalledWith({ a: true, b: true });
  expect(chart.setOption.mock.lastCall?.[0].dataZoom).toMatchObject([
    { start: 0, end: 100 },
  ]);
  const onError = vi.fn(() => expect(() => owner.exportImage()).toThrow());
  owner.update({
    revision: 4,
    options: options(),
    legendScope: "two",
    projectLegendSelection: first,
    onError,
  });
  const late = listeners.get("legendselectchanged");
  first.mockImplementationOnce(() => {
    throw new Error("projection");
  });
  late?.();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "projection" }),
  );
  expect(chart.off).toHaveBeenCalledWith("legendselectchanged", late);
  expect(chart.dispose).toHaveBeenCalledTimes(1);
  owner.resize();
  expect(owner.exportImage(undefined, 4)).toContain("current");
  const calls = first.mock.calls.length;
  late?.();
  expect(first).toHaveBeenCalledTimes(calls);
  owner.dispose();
  late?.();
  expect(chart.dispose).toHaveBeenCalledTimes(2);
});

it("releases listeners if normalized initialization fails and recovers without reviving old callbacks", () => {
  const callbacks: (() => void)[] = [];
  const chart = {
    on: vi.fn((_event, callback) => callbacks.push(callback)),
    off: vi.fn(),
    setOption: vi.fn().mockImplementationOnce(() => {
      throw new Error("initial normalized");
    }),
    getOption: vi.fn(() => ({})),
    dispose: vi.fn(),
    resize: vi.fn(),
    getDataURL: vi.fn(),
    dispatchAction: vi.fn(),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: 400 },
    clientHeight: { value: 200 },
  });
  const projectLegendSelection = vi.fn(() => ({ legend: { data: ["a"] } }));
  const owner = createChartLifecycle(container);
  expect(() =>
    owner.mount({
      revision: 1,
      options: { legend: { data: ["a"] } },
      legendScope: "one",
      projectLegendSelection,
    }),
  ).toThrow("initial normalized");
  const legendCallback = callbacks[1];
  expect(chart.off).toHaveBeenCalledWith("legendselectchanged", legendCallback);
  expect(chart.dispose).toHaveBeenCalledTimes(1);
  owner.resize();
  const calls = projectLegendSelection.mock.calls.length;
  legendCallback();
  expect(projectLegendSelection).toHaveBeenCalledTimes(calls);
});

it("resets native selection and zoom across accepted deferred A to B to A scopes", () => {
  let width = 400;
  let native = {};
  const options = {
    legend: { data: ["a"] },
    dataZoom: [{ id: "openbb-navigator", start: 0, end: 100 }],
  };
  const projectLegendSelection = vi.fn(() => options);
  const chart = {
    setOption: vi.fn((value) => {
      native = value;
    }),
    getOption: vi.fn(() => native),
    on: vi.fn(),
    off: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getDataURL: vi.fn(),
    dispatchAction: vi.fn(),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { get: () => width },
    clientHeight: { value: 200 },
  });
  const owner = createChartLifecycle(container);
  const scoped = (revision: number, legendScope: string) => ({
    revision,
    legendScope,
    options,
    projectLegendSelection,
  });
  owner.mount(scoped(1, "A"));
  native = {
    legend: [{ selected: { a: false } }],
    dataZoom: [{ id: "openbb-navigator", start: 20, end: 60 }],
  };
  width = 0;
  expect(owner.update(scoped(2, "B"))).toBe("deferred");
  expect(owner.update(scoped(3, "A"))).toBe("deferred");
  expect(owner.update(scoped(2, "B"))).toBe("stale");
  width = 400;
  owner.resize();
  expect(projectLegendSelection).toHaveBeenLastCalledWith({ a: true });
  expect(chart.setOption.mock.lastCall?.[0].dataZoom).toMatchObject([
    { start: 0, end: 100 },
  ]);
});

function pagingFixture() {
  let width = 400;
  let native: any = {};
  const listeners = new Map<string, (event?: unknown) => void>();
  const bounds = { x: 0, y: 0, width: 40, height: 20 };
  const legendPagination: PieLegendPagination = {
    canonicalLegendId: "canonical",
    pages: ["a", "b"].map((key) => ({
      anchorKey: key,
      items: [{ key, label: key, legendId: key, bounds }],
    })),
    pager: {
      previousId: "prev",
      nextId: "next",
      counterId: "counter",
      previousBounds: bounds,
      nextBounds: bounds,
    },
  };
  const options = {
    legend: [
      { id: "canonical", show: false, data: ["a", "b"] },
      ...["a", "b"].map((id) => ({ id, data: [id] })),
    ],
    graphic: ["prev", "next", "counter"].map((id) => ({
      id,
      type: "text" as const,
      style: { text: "" },
    })),
  };
  const chart = {
    setOption: vi.fn((value) => {
      native = structuredClone(value);
    }),
    getOption: vi.fn(() => native),
    on: vi.fn((event, callback) => listeners.set(event, callback)),
    off: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getDataURL: vi.fn(() => JSON.stringify(native)),
    dispatchAction: vi.fn(({ type, name }) => {
      if (type !== "legendToggleSelect") return;
      native.legend[0].selected[name] = !native.legend[0].selected[name];
      listeners.get("legendselectchanged")?.();
    }),
  };
  mocks.init.mockReturnValue(chart);
  const container = document.createElement("div");
  document.body.append(container);
  Object.defineProperties(container, {
    clientWidth: { get: () => width },
    clientHeight: { value: 200 },
  });
  const projectLegendSelection = vi.fn(() => options);
  const onError = vi.fn();
  const scoped = (revision: number, legendScope = "one") => ({
    revision,
    legendScope,
    options,
    legendPagination,
    projectLegendSelection,
    onError,
  });
  const owner = createChartLifecycle(container);
  const event = () => ({
    componentType: "graphic",
    info: native.graphic.find((value: any) => value.id === "next").info,
  });
  return {
    owner,
    chart,
    container,
    scoped,
    event,
    listeners,
    onError,
    projectLegendSelection,
    native: () => native,
    width: (value: number) => {
      width = value;
    },
  };
}

it("repaints pages at the accepted revision, exports current canvas options, and retains native selection", () => {
  const f = pagingFixture();
  f.owner.mount(f.scoped(1));
  const firstEvent = f.event();
  f.listeners.get("click")?.(firstEvent);
  expect(f.chart.setOption).toHaveBeenCalledTimes(2);
  expect(f.native().legend.map((value: any) => value.show)).toEqual([
    false,
    false,
    true,
  ]);
  expect(f.owner.exportImage(undefined, 1)).toContain('"text":"2 / 2"');
  expect(f.owner.update(f.scoped(1))).toBe("stale");
  f.listeners.get("click")?.(firstEvent);
  expect(f.chart.setOption).toHaveBeenCalledTimes(2);
  const item = f.container.querySelector<HTMLButtonElement>('[aria-label="b"]')!;
  item.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
  expect(
    f.chart.dispatchAction.mock.calls.filter(
      ([action]) => action.type === "legendToggleSelect",
    ),
  ).toEqual([[{ type: "legendToggleSelect", name: "b" }]]);
  expect(f.projectLegendSelection).toHaveBeenLastCalledWith({ a: true, b: false });
  expect(f.native().legend.every((value: any) => value.selected.b === false)).toBe(
    true,
  );
  expect(
    f.container.querySelector('[aria-label="b"]')?.getAttribute("aria-checked"),
  ).toBe("false");
  f.owner.update(f.scoped(2));
  f.owner.resize();
  expect(f.native().legend[2].show).toBe(true);
  f.owner.update(f.scoped(3, "two"));
  expect(f.native().legend[1].show).toBe(true);
  expect(f.projectLegendSelection).toHaveBeenLastCalledWith({ a: true, b: true });
  f.owner.dispose();
  f.container.remove();
});

it("rejects applying/unsized/stale generation page events and resets accepted deferred scopes", () => {
  const f = pagingFixture();
  f.owner.mount(f.scoped(1));
  const callback = f.listeners.get("click")!;
  const stale = f.event();
  f.width(0);
  callback(stale);
  expect(f.chart.setOption).toHaveBeenCalledTimes(1);
  f.owner.update(f.scoped(2, "two"));
  f.owner.update(f.scoped(3));
  expect(f.container.children).toHaveLength(0);
  f.width(400);
  f.owner.resize();
  callback(stale);
  expect(f.native().legend[1].show).toBe(true);
  const activeEvent = f.event();
  f.chart.setOption.mockImplementationOnce((value) => {
    callback(activeEvent);
    Object.assign(f.native(), value);
  });
  f.owner.resize();
  expect(f.native().legend[1].show).toBe(true);
  f.owner.dispose();
  const calls = f.chart.setOption.mock.calls.length;
  callback(activeEvent);
  expect(f.chart.setOption).toHaveBeenCalledTimes(calls);
  expect(f.chart.off).toHaveBeenCalledWith("click", callback);
  expect(f.container.children).toHaveLength(0);
  f.container.remove();
});

it.each([
  "paint",
  "accessibility",
  "hideTip",
])("invalidates export and releases page controls after %s failure", (failure) => {
  const f = pagingFixture();
  f.owner.mount(f.scoped(1));
  const late = f.listeners.get("click")!;
  const stale = f.event();
  if (failure === "hideTip")
    f.chart.dispatchAction.mockImplementationOnce(() => {
      throw new Error("hideTip");
    });
  else if (failure === "paint")
    f.chart.setOption.mockImplementationOnce(() => {
      throw new Error("paint");
    });
  else
    f.chart.getOption
      .mockImplementationOnce(() => f.native())
      .mockImplementationOnce(() => {
        throw new Error("accessibility");
      });
  late(stale);
  expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ message: failure }));
  expect(f.chart.dispose).toHaveBeenCalledTimes(1);
  expect(() => f.owner.exportImage(undefined, 1)).toThrow("unavailable");
  expect(f.container.children).toHaveLength(0);
  f.owner.resize();
  const calls = f.chart.setOption.mock.calls.length;
  late(stale);
  expect(f.chart.setOption).toHaveBeenCalledTimes(calls);
  f.owner.dispose();
  f.container.remove();
});

function navigationFixture() {
  let native: any = {};
  let fail = false;
  const listeners = new Map<string, () => void>();
  const options: any = {
    legend: { data: ["a"] },
    dataZoom: [
      { id: "openbb-navigator", start: 0, end: 100 },
      { id: "openbb-box-inside", start: 0, end: 100 },
    ],
  };
  const order: string[] = [];
  const chart = {
    setOption: vi.fn((o) => {
      native = structuredClone(o);
      listeners.get("datazoom")?.();
    }),
    getOption: vi.fn(() => native),
    on: vi.fn((e, c) => listeners.set(e, c)),
    off: vi.fn(),
    dispose: vi.fn(),
    resize: vi.fn(),
    getDataURL: vi.fn(() => "image"),
    dispatchAction: vi.fn(),
  };
  mocks.init.mockReturnValue(chart);
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientWidth: { value: 600 },
    clientHeight: { value: 400 },
  });
  const owner = createChartLifecycle(element);
  const onError = vi.fn();
  const projectLegendSelection = vi.fn(() => {
    order.push("legend");
    return options;
  });
  const projectNavigationWindow = vi.fn((o, current) => {
    order.push("navigation");
    if (fail) throw Error("projection");
    return { ...o, title: { text: String(current.dataZoom[0].start) } };
  });
  const request = (revision: number, legendScope = "box") => ({
    revision,
    legendScope,
    options,
    projectLegendSelection,
    projectNavigationWindow,
    onError,
  });
  return {
    owner,
    chart,
    element,
    listeners,
    request,
    onError,
    projectNavigationWindow,
    order,
    native: () => native,
    fail: () => {
      fail = true;
    },
  };
}
it("joins legend then navigation, retains percentages through resize/new viewport request and clears family scope", () => {
  const f = navigationFixture();
  f.owner.mount(f.request(1));
  expect(f.order).toEqual(["legend", "navigation"]);
  f.native().dataZoom.forEach((z: any) => Object.assign(z, { start: 20, end: 60 }));
  f.listeners.get("datazoom")!();
  expect(f.native().title.text).toBe("20");
  f.owner.resize();
  f.owner.update(f.request(2));
  expect(f.native().dataZoom).toMatchObject([
    { start: 20, end: 60 },
    { start: 20, end: 60 },
  ]);
  f.listeners.get("legendselectchanged")!();
  expect(f.native().title.text).toBe("20");
  f.owner.update(f.request(3, "other"));
  expect(f.native().title.text).toBe("0");
  f.owner.dispose();
});
it.each([
  "callback",
  "setOption",
  "reset",
])("releases navigation failures and invalidates export for %s", (failure) => {
  const f = navigationFixture();
  f.owner.mount(f.request(1));
  const late = f.listeners.get("datazoom")!;
  if (failure === "callback") f.fail();
  if (failure === "setOption")
    f.chart.setOption.mockImplementationOnce(() => {
      throw Error("paint");
    });
  if (failure === "reset") {
    f.chart.dispatchAction.mockImplementationOnce(() => {
      throw Error("reset");
    });
    f.element.dispatchEvent(new MouseEvent("dblclick"));
  } else late();
  expect(f.onError).toHaveBeenCalledTimes(1);
  expect(f.chart.dispose).toHaveBeenCalledTimes(1);
  expect(() => f.owner.exportImage()).toThrow("unavailable");
  const calls = f.chart.setOption.mock.calls.length;
  late();
  expect(f.chart.setOption).toHaveBeenCalledTimes(calls);
  f.owner.dispose();
});

import { translateBoxPlot } from "../../../src/components/General/Table/Chart/echarts/boxPlot";
import type { BoxPlotMappingInput } from "../../../src/components/General/Table/Chart/echarts/boxPlotTypes";
import { histogramInput } from "./histogram.fixtures";

it("uses actual Box configured legend defaults, retained native choices and new field defaults", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 7 }),
  } as any);
  let native: any = {};
  const events = new Map<string, () => void>();
  mocks.init.mockReturnValue({
    setOption: vi.fn((options) => {
      native = options;
    }),
    getOption: () => native,
    on: (event: string, callback: () => void) => events.set(event, callback),
    off: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    dispatchAction: vi.fn(),
  });
  const h = histogramInput([100, 120]);
  const category = {
    ...h.style.axes.x.appearance,
    fields: { ...h.style.axes.x.appearance.fields, type: "category" },
  };
  const stroke = {
    stroke: "#112233",
    strokeWidth: 2,
    strokeOpacity: 1,
    lineDash: [0],
    lineDashOffset: 0,
  };
  function project(ids: string[], legendSelection?: Readonly<Record<string, boolean>>) {
    const mapping: BoxPlotMappingInput = {
      snapshot: {
        ...h.snapshot,
        selectedColumnIds: [h.snapshot.categoryColumnId, ...ids],
      },
      style: {
        common: h.style.common,
        application: h.style.application,
        direction: "vertical",
        axes: { category, number: h.style.axes.y },
        band: { paddingInner: 0.2, paddingOuter: 0.3, groupPaddingInner: 0.1 },
        fields: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              ...stroke,
              fill: "#abcdef",
              fillOpacity: 1,
              whisker: stroke,
              cap: { lengthRatio: 0.5 },
              visible: false,
            },
          ]),
        ),
      },
      context: { ...h.context, legendSelection },
    };
    const result = translateBoxPlot(mapping);
    if (result.status !== "supported") throw Error(JSON.stringify(result));
    return result.options;
  }
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientWidth: { value: 600 },
    clientHeight: { value: 400 },
  });
  const owner = createChartLifecycle(element);
  const request = (revision: number, ids: string[]) => ({
    revision,
    legendScope: "box",
    options: project(ids),
    projectLegendSelection: (selected: Readonly<Record<string, boolean>>) =>
      project(ids, selected),
  });
  owner.mount(request(1, ["amount"]));
  expect(native.legend[0].selected).toEqual({ amount: false });
  expect(native.openbbBox.projection.fields[0].enabled).toBe(false);
  native.legend[0].selected = { ...native.legend[0].selected, amount: true };
  events.get("legendselectchanged")!();
  expect(native.openbbBox.projection.fields[0].enabled).toBe(true);
  owner.update(request(2, ["amount", "other"]));
  expect(native.legend[0].selected).toEqual({ amount: true, other: false });
  expect(native.openbbBox.projection.fields.map((f: any) => f.enabled)).toEqual([
    true,
    false,
  ]);
  owner.dispose();
});
it("uses the final projected pointer plan and expires hit targets on resize and disposal", () => {
  let width = 400;
  const container = document.createElement("div");
  document.body.append(container);
  Object.defineProperties(container, {
    clientWidth: { get: () => width },
    clientHeight: { get: () => 200 },
  });
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height: 200,
    right: width,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const chart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getDataURL: vi.fn(),
    dispatchAction: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getOption: () => ({}),
  };
  mocks.init.mockReturnValue(chart);
  const pick = vi.fn(() => ({ distance: 0, matches: [{ key: "field:0" }] }));
  const requestFor = (revision: number, viewportWidth: number) => ({
    revision,
    legendScope: "range",
    options: { legend: { data: ["field"] } },
    projectLegendSelection: () => ({ title: { text: "legend" } }),
    projectNavigationWindow: () => ({ title: { text: "window" } }),
    projectPointer: (options: unknown) => {
      expect(options).toMatchObject({ title: { text: "window" } });
      return {
        viewport: { width: viewportWidth, height: 200 },
        plot: { left: 0, top: 0, width: viewportWidth, height: 200 },
        pagination: false,
        pick,
        present: () => ({ html: "<b>Range endpoint</b>", anchor: { x: 100, y: 50 } }),
      };
    },
  });
  const owner = createChartLifecycle(container);
  owner.mount(requestFor(1, 400));
  container.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 50 }));
  expect(container.textContent).toContain("Range endpoint");
  width = 500;
  owner.resize();
  pick.mockClear();
  container.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 50 }));
  expect(pick).not.toHaveBeenCalled();
  expect(
    (container.querySelector("[data-openbb-range-pointer]") as HTMLElement).style
      .display,
  ).toBe("none");
  owner.update(requestFor(2, 500));
  container.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 50 }));
  expect(pick).toHaveBeenCalledTimes(1);
  owner.dispose();
  pick.mockClear();
  container.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 50 }));
  expect(pick).not.toHaveBeenCalled();
  container.remove();
});

it("reports a double-click picker failure once and invalidates export", () => {
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: 400 },
    clientHeight: { value: 200 },
  });
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 200,
    right: 400,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const chart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getDataURL: vi.fn(),
    dispatchAction: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getOption: () => ({}),
  };
  mocks.init.mockReturnValue(chart);
  const failure = Error("pointer picker failed");
  const onError = vi.fn();
  const owner = createChartLifecycle(container);
  owner.mount({
    revision: 1,
    options: {},
    onError,
    projectNavigationWindow: (options) => options,
    projectPointer: () => ({
      viewport: { width: 400, height: 200 },
      plot: { left: 0, top: 0, width: 400, height: 200 },
      pagination: true,
      pick: () => {
        throw failure;
      },
      present: () => undefined,
    }),
  });
  chart.dispatchAction.mockClear();
  container.dispatchEvent(new MouseEvent("dblclick", { clientX: 100, clientY: 50 }));
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(chart.dispatchAction).not.toHaveBeenCalled();
  expect(() => owner.exportImage()).toThrow("unavailable");
  owner.dispose();
});
