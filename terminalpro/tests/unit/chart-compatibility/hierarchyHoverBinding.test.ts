import { describe, expect, it, vi } from "vitest";
import { createHierarchyHoverBinding } from "../../../src/components/General/Table/Chart/echarts/hierarchyHoverBinding";

function fixture() {
  const listeners = new Map<string, (event: unknown) => void>();
  const chart = {
    on: vi.fn((name, fn) => listeners.set(name, fn)),
    off: vi.fn((name, fn) => {
      if (listeners.get(name) === fn) listeners.delete(name);
    }),
    setOption: vi.fn(),
  };
  const fail = vi.fn();
  let active = true;
  const binding = createHierarchyHoverBinding(chart, () => active, fail);
  const plan = {
    seriesId: "hierarchy",
    graphicId: "marker",
    project: (id: string) =>
      id === "leaf" ? { x: 20, y: 30, rotation: 0, size: 8, color: "#fff" } : undefined,
  };
  return {
    chart,
    listeners,
    fail,
    binding,
    plan,
    deactivate: () => {
      active = false;
    },
  };
}
describe("hierarchy native hover binding", () => {
  it("uses stable leaf identity and one silent graphic without tooltip dependence", () => {
    const f = fixture();
    f.binding.setPlan(f.plan);
    f.listeners.get("mouseover")!({ seriesId: "hierarchy", data: { id: "leaf" } });
    expect(f.chart.setOption).toHaveBeenLastCalledWith(
      expect.objectContaining({
        graphic: [expect.objectContaining({ id: "marker", silent: true })],
      }),
    );
    f.listeners.get("mouseover")!({ seriesId: "other", data: { id: "leaf" } });
    expect(f.chart.setOption).toHaveBeenLastCalledWith({
      graphic: [{ id: "marker", $action: "remove" }],
    });
  });
  it("drops plans, rejects inherited data IDs, and removes exact listeners once", () => {
    const f = fixture();
    f.binding.setPlan(f.plan);
    f.listeners.get("mouseover")!({
      seriesId: "hierarchy",
      data: Object.create({ id: "leaf" }),
    });
    expect(f.chart.setOption).not.toHaveBeenCalled();
    f.binding.setPlan(undefined);
    f.listeners.get("mouseover")!({ seriesId: "hierarchy", data: { id: "leaf" } });
    expect(f.chart.setOption).not.toHaveBeenCalled();
    f.binding.dispose();
    f.binding.dispose();
    expect(f.chart.off).toHaveBeenCalledTimes(3);
    expect(f.listeners.size).toBe(0);
  });
  it("guards inactive callbacks and reports native update failures", () => {
    const f = fixture();
    f.binding.setPlan(f.plan);
    f.deactivate();
    f.listeners.get("mouseover")!({ seriesId: "hierarchy", data: { id: "leaf" } });
    expect(f.chart.setOption).not.toHaveBeenCalled();
    const g = fixture();
    g.binding.setPlan(g.plan);
    g.chart.setOption.mockImplementation(() => {
      throw Error("native");
    });
    g.listeners.get("mouseover")!({ seriesId: "hierarchy", data: { id: "leaf" } });
    expect(g.fail).toHaveBeenCalledOnce();
  });
  it("clears parents and nonfinite markers and expires the old viewport plan", () => {
    const f = fixture();
    const event = { seriesId: "hierarchy", data: { id: "leaf" } };
    f.binding.setPlan(f.plan);
    f.listeners.get("mouseover")!(event);
    f.listeners.get("mouseover")!({ seriesId: "hierarchy", data: { id: "parent" } });
    expect(f.chart.setOption).toHaveBeenLastCalledWith({
      graphic: [{ id: "marker", $action: "remove" }],
    });
    f.binding.setPlan({
      ...f.plan,
      project: () => ({ x: Number.NaN, y: 1, rotation: 0, size: 8, color: "#fff" }),
    });
    f.chart.setOption.mockClear();
    f.listeners.get("mouseover")!(event);
    expect(f.chart.setOption).not.toHaveBeenCalled();
    f.binding.setPlan(f.plan);
    f.listeners.get("mouseover")!(event);
    f.binding.setPlan(undefined);
    f.chart.setOption.mockClear();
    f.listeners.get("mouseover")!(event);
    expect(f.chart.setOption).not.toHaveBeenCalled();
  });
  it("attempts every listener removal and detaches state even if cleanup fails", () => {
    const f = fixture();
    f.binding.setPlan(f.plan);
    f.listeners.get("mouseover")!({ seriesId: "hierarchy", data: { id: "leaf" } });
    f.chart.off.mockImplementationOnce(() => {
      throw Error("remove listener");
    });
    expect(() => f.binding.dispose()).toThrow("remove listener");
    expect(f.chart.off).toHaveBeenCalledTimes(3);
    f.chart.setOption.mockClear();
    f.listeners.get("mouseover")?.({ seriesId: "hierarchy", data: { id: "leaf" } });
    f.binding.dispose();
    expect(f.chart.setOption).not.toHaveBeenCalled();
    expect(f.chart.off).toHaveBeenCalledTimes(3);
  });
});
