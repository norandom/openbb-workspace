import { describe, expect, it } from "vitest";
import { measureText } from "../../../src/components/General/Table/Chart/echarts/cartesianLayout";
import { funnelGeometry } from "../../../src/components/General/Table/Chart/echarts/funnelGeometry";
import { fixture } from "./funnelFixture";

describe("Funnel finite geometry", () => {
  it("retains missing positions, signed magnitudes and separate adjacent dropoffs", () => {
    const g = funnelGeometry(fixture("funnel", [-8, 4, null, 0, 2]));
    expect(g.stages.map((s) => s.index)).toEqual([0, 1, 3, 4]);
    expect(g.stages.filter((s) => s.connector).map((s) => s.index)).toEqual([0, 3]);
    expect(g.stages[0].points[1][0] - g.stages[0].points[0][0]).toBe(g.plot.width);
    expect(g.stages[2].points[1][0] - g.stages[2].points[0][0]).toBe(0);
  });
  it("uses Pyramid axial fractions rather than equal area and respects reverse", () => {
    const i = fixture("pyramid", [1, 1]);
    const g = funnelGeometry(i);
    expect(g.stages[0].points[2][1] - g.stages[0].points[0][1]).toBe(g.plot.height / 2);
    expect(g.stages[0].points[0][0]).toBe(g.plot.x + g.plot.width / 2);
    const r = funnelGeometry({
      ...i,
      style: {
        ...i.style,
        family: "pyramid",
        spacing: 0,
        reverse: true,
        shadow: { enabled: false, color: "#000", blur: 0, xOffset: 0, yOffset: 0 },
      },
    });
    expect(r.stages[0].points[0][0]).toBe(r.plot.x);
  });
  it("preserves the Pyramid apex with native interstage spacing and directional aspect", () => {
    const i = fixture("pyramid", [1, 1]);
    if (i.style.family !== "pyramid") throw Error("fixture");
    const g = funnelGeometry({ ...i, style: { ...i.style, spacing: 2 } });
    expect(g.stages[0].points[0]).toEqual([g.plot.x + g.plot.width / 2, g.plot.y]);
    expect(g.stages[0].points[2][1] - g.stages[0].points[0][1]).toBe(
      (g.plot.height - 2) / 2,
    );
    expect(g.stages[1].points[0][1] - g.stages[0].points[2][1]).toBe(2);
    expect(g.stages[1].points[2][1]).toBe(g.plot.y + g.plot.height);
    const h = funnelGeometry({
      ...i,
      style: { ...i.style, direction: "horizontal", aspectRatio: 2 },
    });
    expect(h.plot.width / h.plot.height).toBe(0.5);
  });
  it("tapers Cone between immediate neighbors without bridging missing endpoints", () => {
    const g = funnelGeometry(fixture("coneFunnel", [8, 4, null, 2]));
    expect(g.stages[0].points[1][0] - g.stages[0].points[0][0]).toBe(g.plot.width);
    expect(g.stages[0].points[2][0] - g.stages[0].points[3][0]).toBe(g.plot.width / 2);
    expect(g.stages[1].points).toHaveLength(0);
    expect(g.stages[2].points).toHaveLength(0);
  });
  it("transposes stage progression and bounds reserved label rectangles", () => {
    const i = fixture("funnel", [8, 4]);
    const g = funnelGeometry({ ...i, style: { ...i.style, direction: "horizontal" } });
    expect(g.stages[1].center[0]).toBeGreaterThan(g.stages[0].center[0]);
    for (const box of [g.plot, g.stageLabelArea, g.numericLabelArea]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(600);
      expect(box.y + box.height).toBeLessThanOrEqual(400);
    }
  });
  it("reserves measured separate typography and native axial numeric spacing", () => {
    for (const direction of ["vertical", "horizontal"] as const) {
      const i = fixture("coneFunnel", [-8, 4]);
      const input = {
        ...i,
        style: {
          ...i.style,
          direction,
          label: { ...i.style.label, placement: "before" as const, spacing: 4 },
        },
      };
      const g = funnelGeometry(input);
      const size = measureText("Stage 0", input.style.stageLabel);
      expect(
        direction === "vertical" ? g.stageLabelArea.width : g.stageLabelArea.height,
      ).toBe(direction === "vertical" ? size.width : size.height);
      const numeric = measureText("-8.00", input.style.label);
      expect(
        direction === "vertical"
          ? g.plot.y - g.numericLabelArea.y
          : g.plot.x - g.numericLabelArea.x,
      ).toBe((direction === "vertical" ? numeric.height : numeric.width) + 4);
      const off = funnelGeometry({
        ...input,
        style: { ...input.style, label: { ...input.style.label, enabled: false } },
      });
      expect(
        direction === "vertical" ? off.plot.height : off.plot.width,
      ).toBeGreaterThan(direction === "vertical" ? g.plot.height : g.plot.width);
    }
  });
  it("keeps zero and extreme normalized ranges finite without changing source values", () => {
    for (const family of ["funnel", "coneFunnel", "pyramid"] as const) {
      const input = fixture(family, [Number.MAX_VALUE, 0, null, Number.MAX_VALUE]);
      const before = structuredClone(input.data);
      const g = funnelGeometry(input);
      expect(input.data).toEqual(before);
      expect(g.stages.flatMap((s) => s.points.flat()).every(Number.isFinite)).toBe(
        true,
      );
      if (family === "pyramid")
        expect(g.stages[1].points[0][1]).toBe(g.stages[1].points[2][1]);
    }
    expect(
      funnelGeometry(fixture("funnel", [0, 0])).stages.every(
        (s) => s.points[0][0] === s.points[1][0],
      ),
    ).toBe(true);
  });
  it("removes only Funnel connectors when dropoff is disabled", () => {
    const i = fixture();
    if (i.style.family !== "funnel") throw Error("fixture");
    const a = funnelGeometry(i);
    const b = funnelGeometry({
      ...i,
      style: { ...i.style, dropOff: { ...i.style.dropOff, enabled: false } },
    });
    expect(b.stages.map((s) => s.points)).toEqual(a.stages.map((s) => s.points));
    expect(b.stages.every((s) => s.connector === undefined)).toBe(true);
  });
  it("bounds overflowing labels and returns a blank plot when no space remains", () => {
    const i = fixture();
    const g = funnelGeometry({
      ...i,
      context: { ...i.context, viewport: { width: 20, height: 15 } },
      style: { ...i.style, stageLabel: { ...i.style.stageLabel, size: 200 } },
    });
    expect(g.plot.width).toBe(0);
    expect(g.stages).toEqual([]);
    expect(g.stageLabelArea.x + g.stageLabelArea.width).toBeLessThanOrEqual(20);
    expect(g.stageLabelArea.y + g.stageLabelArea.height).toBeLessThanOrEqual(15);
  });
});
