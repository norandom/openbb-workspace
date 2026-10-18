import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  EChartsHost,
  type EChartsHostHandle,
} from "../../../src/components/General/Table/Chart/echarts/EChartsHost";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../../../src/components/General/Table/Chart/echarts/lifecycle", () => ({
  createChartLifecycle: mocks.create,
}));
const owners: ReturnType<typeof makeOwner>[] = [];
const callbacks: ResizeObserverCallback[] = [];
const disconnect = vi.fn();
function makeOwner() {
  return {
    mount: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    exportImage: vi.fn(() => "data:image/png;base64,owned"),
  };
}
let element: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  owners.length = 0;
  callbacks.length = 0;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  mocks.create.mockImplementation(() => {
    const owner = makeOwner();
    owners.push(owner);
    return owner;
  });
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(() => {
  act(() => root.unmount());
  element.remove();
  vi.unstubAllGlobals();
});
it("mounts, updates complete requests, exports, and disconnects its owner", () => {
  const ref = createRef<EChartsHostHandle>();
  act(() =>
    root.render(
      <EChartsHost ref={ref} options={{ title: { text: "USD" } }} revision={1} />,
    ),
  );
  expect(owners[0].mount).toHaveBeenCalledWith({
    options: { title: { text: "USD" } },
    revision: 1,
  });
  act(() =>
    root.render(
      <EChartsHost ref={ref} options={{ title: { text: "EUR" } }} revision={2} />,
    ),
  );
  expect(owners[0].update).toHaveBeenCalledWith({
    options: { title: { text: "EUR" } },
    revision: 2,
  });
  expect(ref.current?.exportImage({ pixelRatio: 2 })).toContain("data:image/png");
  expect(owners[0].exportImage).toHaveBeenCalledWith({ pixelRatio: 2 });
  act(() => root.render(null));
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(owners[0].dispose).toHaveBeenCalledTimes(1);
  expect(ref.current).toBeNull();
});
it("ignores a disconnected observer after a replacement mounts", () => {
  act(() => root.render(<EChartsHost options={{}} revision={1} />));
  act(() => root.render(null));
  act(() => root.render(<EChartsHost options={{}} revision={2} />));
  callbacks[0]([], {} as ResizeObserver);
  expect(owners[0].resize).not.toHaveBeenCalled();
  expect(owners[1].resize).not.toHaveBeenCalled();
  callbacks[1]([], {} as ResizeObserver);
  expect(owners[1].resize).toHaveBeenCalledTimes(1);
});
it("reports resize failures while retaining the lifecycle retry path", () => {
  const onError = vi.fn();
  act(() => root.render(<EChartsHost options={{}} revision={1} onError={onError} />));
  owners[0].resize.mockImplementationOnce(() => {
    throw new Error("resize failed");
  });
  callbacks[0]([], {} as ResizeObserver);
  callbacks[0]([], {} as ResizeObserver);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "resize failed" }),
  );
  expect(owners[0].resize).toHaveBeenCalledTimes(2);
});
it("cleans partially mounted resources before reporting mount failure", () => {
  mocks.create.mockImplementationOnce(() => {
    const owner = makeOwner();
    owner.mount.mockImplementation(() => {
      throw new Error("mount failed");
    });
    owners.push(owner);
    return owner;
  });
  const onError = vi.fn();
  act(() => root.render(<EChartsHost options={{}} revision={1} onError={onError} />));
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "mount failed" }),
  );
  expect(owners[0].dispose).toHaveBeenCalledTimes(1);
  expect(disconnect).toHaveBeenCalledTimes(1);
});
it("keeps StrictMode replay ownership separate and makes retained handles unavailable", () => {
  const ref = createRef<EChartsHostHandle>();
  act(() =>
    root.render(
      <React.StrictMode>
        <EChartsHost ref={ref} options={{}} revision={1} />
      </React.StrictMode>,
    ),
  );
  expect(owners).toHaveLength(2);
  expect(owners[0].dispose).toHaveBeenCalledTimes(1);
  callbacks[0]([], {} as ResizeObserver);
  expect(owners[0].resize).not.toHaveBeenCalled();
  expect(owners[1].resize).not.toHaveBeenCalled();
  const handle = ref.current;
  if (!handle) throw new Error("Missing mounted handle");
  act(() => root.render(null));
  expect(() => handle.exportImage()).toThrow("Chart image is unavailable");
  expect(owners[1].dispose).toHaveBeenCalledTimes(1);
});
it("reports update failures and allows a newer request to recover", () => {
  const onError = vi.fn();
  act(() => root.render(<EChartsHost options={{}} revision={1} onError={onError} />));
  owners[0].update.mockImplementationOnce(() => {
    throw new Error("update failed");
  });
  act(() => root.render(<EChartsHost options={{}} revision={2} onError={onError} />));
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "update failed" }),
  );
  act(() => root.render(<EChartsHost options={{}} revision={3} onError={onError} />));
  expect(owners[0].update).toHaveBeenLastCalledWith({ options: {}, revision: 3 });
});
it("notifies positive initial and resized dimensions through the latest callback, then ignores disposal", () => {
  let width = 640;
  let height = 360;
  const first = vi.fn();
  const second = vi.fn();
  const widthSpy = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(() => width);
  const heightSpy = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockImplementation(() => height);
  try {
    act(() => root.render(<EChartsHost options={{}} revision={1} onResize={first} />));
    expect(first).toHaveBeenCalledExactlyOnceWith({ width: 640, height: 360 });
    act(() => root.render(<EChartsHost options={{}} revision={2} onResize={second} />));
    width = 800;
    height = 500;
    callbacks[0]([], {} as ResizeObserver);
    expect(second).toHaveBeenCalledExactlyOnceWith({ width: 800, height: 500 });
    width = 0;
    callbacks[0]([], {} as ResizeObserver);
    expect(second).toHaveBeenCalledTimes(1);
    act(() => root.render(null));
    width = 900;
    callbacks[0]([], {} as ResizeObserver);
    expect(second).toHaveBeenCalledTimes(1);
  } finally {
    widthSpy.mockRestore();
    heightSpy.mockRestore();
  }
});
