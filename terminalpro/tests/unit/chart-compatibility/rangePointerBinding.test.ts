import { afterEach, describe, expect, it, vi } from "vitest";
import { createRangePointerBinding } from "../../../src/components/General/Table/Chart/echarts/rangePointerBinding";
import type { ChartPointerPlan } from "../../../src/components/General/Table/Chart/echarts/chartPointerTypes";
function host() {
  const element = document.createElement("div");
  let width = 600;
  Object.defineProperties(element, {
    clientWidth: { get: () => width },
    clientHeight: { get: () => 500 },
  });
  element.getBoundingClientRect = () =>
    ({ left: 100, top: 50, width: 1200, height: 1000 }) as DOMRect;
  document.body.append(element);
  return { element, resize: (next = 500) => (width = next) };
}
function plan(pagination = true): ChartPointerPlan {
  return {
    viewport: { width: 600, height: 500 },
    plot: { left: 40, top: 40, width: 500, height: 400 },
    pagination,
    pick: vi.fn(() => ({ distance: 0, matches: [{ key: "a" }, { key: "b" }] })),
    present: (match) => ({ html: `<b>${match.key}</b>`, anchor: { x: 80, y: 80 } }),
  };
}
function event(element: HTMLElement, type: string, x = 100, y = 100) {
  element.dispatchEvent(
    new MouseEvent(type, { clientX: 100 + x * 2, clientY: 50 + y * 2, bubbles: true }),
  );
}
afterEach(() => document.body.replaceChildren());
describe("Range transient pointer lifetime", () => {
  it("retains series/raw-datum pagination identity when an Area endpoint winner changes", () => {
    const { element } = host();
    const binding = createRangePointerBinding(element, vi.fn());
    let endpoint = "low";
    const p = {
      ...plan(),
      pick: () => ({
        distance: 0,
        matches: [
          { key: "b:0:low", identityKey: "b:0" },
          { key: `a:0:${endpoint}`, identityKey: "a:0" },
        ],
      }),
    };
    binding.setPlan(p);
    event(element, "pointermove");
    event(element, "click");
    expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("a:0:low");
    endpoint = "high";
    event(element, "pointermove");
    expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("a:0:high");
    binding.dispose();
  });
  it("retains drag suppression across navigation clear/setPlan replacement and release", () => {
    const { element } = host();
    const binding = createRangePointerBinding(element, vi.fn());
    const p = plan();
    binding.setPlan(p);
    event(element, "pointermove");
    event(element, "pointerdown");
    event(element, "pointermove", 140, 100);
    binding.clear();
    binding.setPlan(p);
    event(element, "pointerup", 140, 100);
    event(element, "click", 140, 100);
    expect(p.pick).toHaveBeenCalledTimes(1);
    expect(
      element.querySelector("[data-openbb-range-pointer]")?.getAttribute("style"),
    ).toContain("display: none");
    binding.dispose();
  });
  it("picks blank plot in CSS pixels, retains identity and click-pages without wheel interception", () => {
    const { element } = host();
    const onError = vi.fn();
    const binding = createRangePointerBinding(element, onError);
    const p = plan();
    binding.setPlan(p);
    event(element, "pointermove");
    expect(p.pick).toHaveBeenCalledWith({ x: 100, y: 100 }, "hover");
    expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("a");
    event(element, "click");
    expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("b");
    event(element, "pointermove");
    expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("b");
    event(element, "click");
    expect(element.querySelector('[role="tooltip"]')?.textContent).toBe("a");
    expect(element.dispatchEvent(new WheelEvent("wheel", { cancelable: true }))).toBe(
      true,
    );
    binding.dispose();
    expect(element.querySelector('[role="tooltip"]')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
  it("rejects title/miniature pixels, old viewport, replacement plans and drag release", () => {
    const { element, resize } = host();
    const binding = createRangePointerBinding(element, vi.fn());
    const p = plan();
    binding.setPlan(p);
    event(element, "pointermove", 100, 10);
    expect(p.pick).not.toHaveBeenCalled();
    event(element, "pointermove");
    event(element, "pointerdown");
    event(element, "pointermove", 140, 100);
    event(element, "pointerup", 140, 100);
    event(element, "click", 140, 100);
    expect((p.pick as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    resize();
    event(element, "pointermove");
    expect(binding.consumeDoubleClick({ x: 100, y: 100 })).toBe(false);
    resize(600);
    event(element, "pointermove");
    expect((p.pick as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    binding.clear();
    expect(binding.consumeDoubleClick({ x: 100, y: 100 })).toBe(false);
    binding.dispose();
  });
  it("consumes only zero-distance node doubleclick and clears failed state", () => {
    const { element } = host();
    const error = vi.fn();
    const binding = createRangePointerBinding(element, error);
    const p = plan();
    binding.setPlan(p);
    expect(binding.consumeDoubleClick({ x: 100, y: 100 })).toBe(true);
    binding.setPlan({
      ...p,
      pagination: false,
      pick: () => ({ distance: 1, matches: [{ key: "a" }] }),
    });
    expect(binding.consumeDoubleClick({ x: 100, y: 100 })).toBe(false);
    binding.setPlan({
      ...p,
      pagination: true,
      pick: () => ({ distance: 1, matches: [{ key: "a" }] }),
    });
    expect(binding.consumeDoubleClick({ x: 100, y: 100 })).toBe(true);
    binding.setPlan({
      ...p,
      pick: () => {
        throw Error("pick failed");
      },
    });
    event(element, "pointermove");
    expect(error).toHaveBeenCalledOnce();
    expect(binding.consumeDoubleClick({ x: 100, y: 100 })).toBe(false);
    binding.dispose();
  });
});
