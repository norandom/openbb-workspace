import { afterEach, describe, expect, it, vi } from "vitest";
import { createChartKeyboardBinding } from "../../../src/components/General/Table/Chart/echarts/chartKeyboardBinding";
import type { GroupedBarKeyboardPlan } from "../../../src/components/General/Table/Chart/echarts/chartKeyboardTypes";

export const keyboardPlan: GroupedBarKeyboardPlan = {
  kind: "grouped-bar",
  label: "Dolphin Interaction Data",
  gridId: "grid",
  xAxisId: "categories",
  yAxisId: "values",
  categories: ["Peter", "Mary", "Mercutio"],
  series: [
    { id: "tm", name: "TM", values: [60, 57, 238] },
    { id: "ym", name: "YM", values: [64, 93, 217] },
  ],
  geometry: { barWidth: 10, barGap: 0.2 },
  focus: { color: "blue", backgroundColor: "white", borderWidth: 2 },
};

afterEach(() => document.body.replaceChildren());
function fixture() {
  const container = document.createElement("div");
  document.body.append(container);
  let selected: Record<string, boolean> = {};
  const ports = {
    container,
    isActive: vi.fn(() => true),
    readSelected: () => selected,
    convertToPixel: vi.fn(
      (
        finder: { xAxisId?: string; yAxisId?: string },
        value: number | string,
      ) =>
        finder.xAxisId
          ? 50 + keyboardPlan.categories.indexOf(String(value)) * 100
          : 300 - Number(value),
    ),
    highlight: vi.fn(),
    clear: vi.fn(),
    fail: vi.fn(),
  };
  const binding = createChartKeyboardBinding(ports);
  binding.sync(keyboardPlan, "one");
  const plot = () =>
    container.querySelector<HTMLElement>('[data-chart-keyboard="plot"]')!;
  const key = (value: string) => {
    const event = new KeyboardEvent("keydown", {
      key: value,
      bubbles: true,
      cancelable: true,
    });
    plot().dispatchEvent(event);
    return event;
  };
  return {
    container,
    ports,
    binding,
    plot,
    key,
    select: (value: Record<string, boolean>) => {
      selected = value;
      binding.sync(keyboardPlan, "one");
    },
  };
}

describe("grouped-bar keyboard binding", () => {
  it("navigates clamped categories and visible declaration-order series, announces and outlines the actual point", () => {
    const f = fixture();
    f.plot().focus();
    expect(f.ports.highlight).toHaveBeenLastCalledWith("tm", 0);
    expect(f.plot().getAttribute("aria-label")).toContain("Peter, TM, 60");
    f.key("ArrowRight");
    f.key("ArrowRight");
    f.key("ArrowRight");
    f.key("ArrowDown");
    expect(f.ports.highlight).toHaveBeenLastCalledWith("ym", 2);
    expect(f.plot().getAttribute("aria-label")).toContain("Mercutio, YM, 217");
    const outline = f.container.querySelector<HTMLElement>(
      '[data-chart-keyboard="outline"]',
    )!;
    expect(outline.style.left).toBe("251px");
    expect(outline.style.top).toBe("83px");
    expect(outline.style.width).toBe("10px");
    f.select({ YM: false });
    expect(f.ports.highlight).toHaveBeenLastCalledWith("tm", 2);
    f.key("ArrowLeft");
    expect(f.ports.highlight).toHaveBeenLastCalledWith("tm", 1);
    f.binding.dispose();
    expect(f.container.children).toHaveLength(0);
  });
  it("keeps Enter/Space inert and prevents submission, leaves Escape unchanged, clears on blur and survives hide-all", () => {
    const f = fixture();
    f.plot().focus();
    f.ports.clear.mockClear();
    f.ports.highlight.mockClear();
    expect(f.key("Enter").defaultPrevented).toBe(true);
    expect(f.key(" ").defaultPrevented).toBe(true);
    expect(f.key("Escape").defaultPrevented).toBe(false);
    expect(f.ports.clear).not.toHaveBeenCalled();
    expect(f.ports.highlight).not.toHaveBeenCalled();
    f.select({ TM: false, YM: false });
    expect(f.plot().getAttribute("aria-label")).toContain("No visible data");
    f.select({ TM: false, YM: true });
    expect(f.ports.highlight).toHaveBeenLastCalledWith("ym", 0);
    f.plot().blur();
    expect(f.ports.clear).toHaveBeenCalled();
    f.binding.dispose();
  });
  it("expires stale detached listeners and inactive events, reports public-port failures, resets scope", () => {
    const f = fixture();
    const old = f.plot();
    f.ports.isActive.mockReturnValue(false);
    old.focus();
    expect(f.ports.highlight).not.toHaveBeenCalled();
    f.ports.isActive.mockReturnValue(true);
    old.blur();
    old.focus();
    f.key("ArrowRight");
    f.binding.sync(keyboardPlan, "two");
    expect(f.ports.highlight).toHaveBeenLastCalledWith("tm", 0);
    f.ports.convertToPixel.mockImplementation(() => {
      throw Error("conversion failed");
    });
    f.key("ArrowDown");
    expect(f.ports.fail).toHaveBeenCalledWith(
      expect.objectContaining({ message: "conversion failed" }),
    );
    f.binding.sync(undefined, "two");
    f.ports.highlight.mockClear();
    old.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(f.ports.highlight).not.toHaveBeenCalled();
    f.binding.dispose();
  });
});
