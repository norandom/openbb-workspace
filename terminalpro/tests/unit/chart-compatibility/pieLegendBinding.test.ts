import { describe, expect, it, vi } from "vitest";
import type { EChartsOption } from "echarts";
import { createPieLegendBinding } from "../../../src/components/General/Table/Chart/echarts/pieLegendBinding";
import type { PieLegendPagination } from "../../../src/components/General/Table/Chart/echarts/pieLegendTypes";

const rect = { x: 10, y: 20, width: 60, height: 16 };
function plan(keys = ["a", "b", "c"]): PieLegendPagination {
  return { canonicalLegendId: "canonical", pages: keys.map((key) => ({
    anchorKey: key, items: [{ key, label: `Label ${key}`, legendId: key, bounds: rect }],
  })), pager: { previousId: "prev", nextId: "next", counterId: "count", previousBounds: rect, nextBounds: rect } };
}
function options(value: PieLegendPagination): EChartsOption {
  return { legend: [{ id: "canonical", show: false, data: value.pages.map((page) => page.anchorKey) },
    ...value.pages.map((page) => ({ id: page.anchorKey, show: true, data: [page.anchorKey] }))],
  graphic: [{ type: "group", children: ["prev", "next", "count"].map((id) => ({ id, type: "text", style: { text: "initial" } })) }] };
}
function fixture() {
  const container = document.createElement("div");
  document.body.append(container);
  const selected = { a: false, b: true, c: true };
  const ports = { container, readSelected: () => selected, isActive: vi.fn(() => true), toggle: vi.fn(), repaint: vi.fn(), fail: vi.fn() };
  const binding = createPieLegendBinding(ports);
  const draw = (value = plan(), scope = "one") => {
    const result = binding.project(options(value), value, scope);
    binding.sync();
    return result;
  };
  const click = (result: EChartsOption, direction: -1 | 1 = 1) => {
    const graphics = result.graphic as { children: { id: string; info: unknown }[] }[];
    binding.handleClick({ componentType: "graphic", info: graphics[0].children.find((item) => item.id === (direction === 1 ? "next" : "prev"))?.info });
  };
  const shown = (result: EChartsOption) => (result.legend as { id: string; show: boolean }[]).filter((item) => item.show).map((item) => item.id);
  return { binding, ports, draw, click, shown, container, selected };
}

describe("renderer-local pie legend paging", () => {
  it("retains the focused preview item as the page anchor when resize splits its current page", () => {
    const f = fixture();
    const interaction = { mode: "preview" as const, focusColor: "blue", focusBackgroundColor: "white", pageActiveColor: "black", pageInactiveColor: "gray" };
    const wide = { ...plan(), interaction, pages: [{ anchorKey: "a", items: plan().pages.flatMap((page) => page.items) }] };
    f.binding.project(options(wide), wide, "one"); f.binding.sync();
    const second = f.container.querySelector<HTMLButtonElement>('[aria-label="Label b"]')!; second.focus();
    const narrow = { ...plan(), interaction };
    const output = f.binding.project(options(narrow), narrow, "one"); f.binding.sync();
    expect(f.shown(output)).toEqual(["b"]); expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0); f.binding.dispose(); f.container.remove();
  });
  it("opts into roving preview focus, native selection mirroring, hover and double-click isolate/restore", () => {
    const f = fixture();
    const select = vi.fn((next) => Object.assign(f.selected, next));
    const emphasize = vi.fn();
    f.binding.dispose();
    const binding = createPieLegendBinding({ ...f.ports, select, emphasize });
    const value = { ...plan(), interaction: { mode: "preview" as const, focusColor: "blue", focusBackgroundColor: "white", pageActiveColor: "black", pageInactiveColor: "gray" } };
    const draw = () => { const result = binding.project(options(value), value, "preview"); binding.sync(); return result; };
    f.ports.repaint.mockImplementation(draw); draw();
    const switches = () => [...f.container.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    expect(switches().map((node) => node.tabIndex)).toEqual([0, -1, -1]);
    switches()[0].focus(); switches()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }));
    expect(document.activeElement).toBe(switches()[1]); expect(switches()[1].tabIndex).toBe(0);
    expect(f.container.querySelector('[role="status"]')?.textContent).toContain("2 of 3");
    expect(emphasize).toHaveBeenLastCalledWith("b");
    switches()[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(select).toHaveBeenLastCalledWith({ a: false, b: true, c: false });
    draw(); switches()[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(select).toHaveBeenLastCalledWith({ a: true, b: true, c: true });
    switches()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.activeElement).toBe(switches()[1]);
    const graphics = (draw().graphic as any[])[0].children;
    expect(graphics.find((item: any) => item.id === "prev").style).toMatchObject({ fill: "black", opacity: 1 });
    switches()[2].focus(); const last = (draw().graphic as any[])[0].children;
    expect(last.find((item: any) => item.id === "next").style).toMatchObject({ fill: "gray", opacity: 1 });
    const stale = switches()[0]; binding.dispose(); stale.dispatchEvent(new MouseEvent("dblclick"));
    expect(select).toHaveBeenCalledTimes(2); f.container.remove();
  });
  it("decorates copies, keeps only the current native page visible, and rejects stale tokens", () => {
    const f = fixture();
    const input = options(plan());
    const original = structuredClone(input);
    const first = f.binding.project(input, plan(), "one");
    expect(input).toEqual(original);
    expect(f.shown(first)).toEqual(["a"]);
    f.click(first, -1); expect(f.ports.repaint).not.toHaveBeenCalled();
    f.click(first); expect(f.ports.repaint).toHaveBeenCalledTimes(1);
    const second = f.draw(); expect(f.shown(second)).toEqual(["b"]);
    f.click(first); expect(f.ports.repaint).toHaveBeenCalledTimes(1);
    f.click(second); expect(f.shown(f.draw())).toEqual(["c"]);
    f.binding.dispose(); f.container.remove();
  });

  it("retains a key across reflow, clamps removed anchors, and resets on scope change", () => {
    const f = fixture(); f.click(f.draw()); f.click(f.draw());
    expect(f.shown(f.draw(plan(["a", "b"])))).toEqual(["b"]);
    f.click(f.draw(), 1);
    expect(f.shown(f.draw(plan(["c", "a", "b"])))).toEqual(["c"]);
    expect(f.shown(f.draw(plan(["a", "b"])))).toEqual(["a"]);
    f.click(f.draw(plan(["a", "b"])));
    expect(f.shown(f.draw(plan(["a"])))).toEqual(["a"]);
    expect(f.shown(f.draw(plan(), "two"))).toEqual(["a"]);
    f.binding.dispose(); f.container.remove();
  });

  it("keys accessible controls by slice identity when native component ordinals change", () => {
    const f = fixture(); f.draw();
    const retained = f.container.querySelector<HTMLButtonElement>('[aria-label="Label b"]')!;
    retained.focus();
    const reordered = plan(["b", "a", "c"]);
    const value = { ...reordered, pages: reordered.pages.map((page, index) => ({
      ...page, items: page.items.map((item) => ({ ...item, legendId: String(index) })),
    })) };
    f.draw(value);
    expect(f.container.querySelector('[aria-label="Label b"]')).toBe(retained);
    expect(document.activeElement).toBe(retained);
    retained.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(f.ports.toggle).toHaveBeenCalledExactlyOnceWith("b");
    f.binding.dispose(); f.container.remove();
  });

  it("ignores non-pager, invalid direction, inactive and disposed callbacks", () => {
    const f = fixture(); const first = f.draw();
    f.binding.handleClick({ componentType: "legend", info: { kind: "pie-legend-page", direction: 1, token: 1 } });
    f.binding.handleClick({ componentType: "graphic", info: { kind: "pie-legend-page", direction: 3, token: 1 } });
    f.ports.isActive.mockReturnValue(false); f.click(first);
    f.binding.dispose(); f.ports.isActive.mockReturnValue(true); f.click(first);
    f.draw();
    expect(f.ports.repaint).not.toHaveBeenCalled();
    expect(f.container.children).toHaveLength(0); f.container.remove();
  });

  it("exposes native selection through stable switches, reveals focused off-page keys, and dispatches once", () => {
    const f = fixture();
    f.ports.repaint.mockImplementation(() => { f.draw(); });
    f.draw();
    const item = f.container.querySelector<HTMLButtonElement>('[aria-label="Label b"]')!;
    expect(f.container.querySelector('[aria-label="Label a"]')?.getAttribute("aria-checked")).toBe("false");
    item.focus();
    expect(document.activeElement).toBe(item);
    expect(f.container.querySelector('[role="status"]')?.textContent).toBe("Legend page 2 of 3");
    expect(item.style.left).toBe("10px"); expect(item.style.pointerEvents).toBe("none");
    item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    item.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    item.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true }));
    expect(f.ports.toggle.mock.calls).toEqual([["b"], ["b"]]);
    f.selected.b = false; f.draw();
    expect(document.activeElement).toBe(item);
    expect(item.getAttribute("aria-checked")).toBe("false");
    expect(item.style.outline).not.toBe("none");
    f.binding.dispose(); f.container.remove();
  });

  it("shares pager keyboard actions, disables boundaries, and clears controls when omitted", () => {
    const f = fixture(); f.ports.repaint.mockImplementation(() => { f.draw(); }); f.draw();
    const previous = f.container.querySelector<HTMLButtonElement>('[aria-label="Previous legend page"]')!;
    const next = f.container.querySelector<HTMLButtonElement>('[aria-label="Next legend page"]')!;
    expect(previous.disabled).toBe(true);
    next.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(f.container.querySelector('[role="status"]')?.textContent).toContain("2 of 3");
    next.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(next.disabled).toBe(true); expect(previous.disabled).toBe(false);
    f.draw(plan(["a"])); expect(next.hidden).toBe(true);
    f.binding.project({}, undefined, "one"); f.binding.sync();
    expect(f.container.children).toHaveLength(0);
    expect(f.container.style.position).toBe(""); f.container.remove();
  });

  it("reports page and keyboard failures through the lifecycle port", () => {
    const f = fixture(); f.ports.repaint.mockImplementation(() => { throw new Error("repaint"); });
    f.click(f.draw()); expect(f.ports.fail).toHaveBeenCalledWith(expect.objectContaining({ message: "repaint" }));
    f.ports.toggle.mockImplementation(() => { throw new Error("toggle"); });
    f.container.querySelector<HTMLButtonElement>('[aria-label="Label a"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(f.ports.fail).toHaveBeenLastCalledWith(expect.objectContaining({ message: "toggle" }));
    f.binding.dispose(); f.container.remove();
  });
});
