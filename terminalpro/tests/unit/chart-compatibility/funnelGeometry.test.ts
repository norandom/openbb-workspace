import { describe, expect, it } from "vitest";
import { measureText } from "../../../src/components/General/Table/Chart/echarts/cartesianLayout";
import { funnelGeometry } from "../../../src/components/General/Table/Chart/echarts/funnelGeometry";
import { fixture } from "./funnelFixture";

describe("Funnel finite geometry", () => {
  it.each([
    "vertical",
    "horizontal",
  ] as const)("matches native zero-outer five-band spacing and centers in %s", (direction) => {
    const input = fixture("funnel", [8, 7, 6, 5, 4]);
    const g = funnelGeometry({ ...input, style: { ...input.style, direction } });
    const axis = direction === "vertical" ? 1 : 0;
    const start = direction === "vertical" ? g.plot.y : g.plot.x;
    const length = direction === "vertical" ? g.plot.height : g.plot.width;
    // Native BandScale n=5, inner=1/4, outer=0: bandwidth=3L/19,
    // gap=L/19, step=4L/19; both plot endpoints are occupied.
    expect(g.stages[0].points[0][axis]).toBe(start);
    expect(g.stages[4].points[2][axis]).toBe(start + length);
    for (const [index, stage] of g.stages.entries()) {
      const a = stage.points[0][axis];
      const b = stage.points[2][axis];
      expect(a).toBeCloseTo(start + (4 * index * length) / 19, 10);
      expect(b - a).toBeCloseTo((3 * length) / 19, 10);
      expect(stage.center[axis]).toBeCloseTo((a + b) / 2, 10);
      expect(g.positions[index]).toEqual(stage.center);
      if (index < 4) {
        expect(stage.connector![0][axis]).toBe(b);
        expect(stage.connector![2][axis] - b).toBeCloseTo(length / 19, 10);
        expect(stage.connector![2][axis]).toBe(g.stages[index + 1].points[0][axis]);
      }
      for (const [x, y] of [
        ...stage.points,
        ...(stage.connector ?? []),
        stage.center,
      ]) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(g.plot.x);
        expect(x).toBeLessThanOrEqual(g.plot.x + g.plot.width);
        expect(y).toBeGreaterThanOrEqual(g.plot.y);
        expect(y).toBeLessThanOrEqual(g.plot.y + g.plot.height);
      }
    }
  });
  it("fills singleton bands and bounds touching or fully spaced pairs", () => {
    for (const direction of ["vertical", "horizontal"] as const) {
      for (const count of [1, 2])
        for (const spacingRatio of [0, 0.25, 1]) {
          const input = fixture("funnel", count === 1 ? [8] : [8, 4]);
          if (input.style.family !== "funnel") throw Error("fixture");
          const g = funnelGeometry({
            ...input,
            style: { ...input.style, direction, spacingRatio },
          });
          const axis = direction === "vertical" ? 1 : 0;
          const start = direction === "vertical" ? g.plot.y : g.plot.x;
          const length = direction === "vertical" ? g.plot.height : g.plot.width;
          expect(g.stages[0].points[0][axis]).toBe(start);
          expect(g.stages.at(-1)!.points[2][axis]).toBe(start + length);
          for (const stage of g.stages) {
            const a = stage.points[0][axis];
            const b = stage.points[2][axis];
            const expectedWidth =
              count === 1 ? length : (length * (1 - spacingRatio)) / (2 - spacingRatio);
            expect(b - a).toBeCloseTo(expectedWidth, 10);
            expect(stage.center[axis]).toBeCloseTo((a + b) / 2, 10);
            expect(stage.points.flat().every(Number.isFinite)).toBe(true);
            expect(stage.hitArea).toBeDefined();
          }
          if (count === 1) expect(g.stages[0].connector).toBeUndefined();
          else
            expect(
              g.stages[0].connector![2][axis] - g.stages[0].connector![0][axis],
            ).toBeCloseTo(
              spacingRatio === 0 ? 0 : (length * spacingRatio) / (2 - spacingRatio),
              10,
            );
        }
    }
  });
  it("does not divide an empty stage domain or draw a zero-sized plot", () => {
    const input = fixture("funnel", [8]);
    if (input.data.family !== "funnel") throw Error("fixture");
    const empty = funnelGeometry({
      ...input,
      data: { ...input.data, stages: [], magnitudeRatios: [] },
    });
    expect(empty.stages).toEqual([]);
    expect(empty.positions).toEqual([]);
    const zero = funnelGeometry({
      ...input,
      context: { ...input.context, viewport: { width: 0, height: 0 } },
    });
    expect(zero.stages).toEqual([]);
    expect(zero.positions.flat().every(Number.isFinite)).toBe(true);
  });
  it("retains missing positions, signed magnitudes and separate adjacent dropoffs", () => {
    const g = funnelGeometry(fixture("funnel", [-8, 4, null, 0, 2]));
    expect(g.stages.map((s) => s.index)).toEqual([0, 1, 3, 4]);
    expect(g.stages.filter((s) => s.connector).map((s) => s.index)).toEqual([0, 3]);
    expect(g.stages[0].points[1][0] - g.stages[0].points[0][0]).toBe(g.plot.width);
    expect(g.stages[2].points[1][0] - g.stages[2].points[0][0]).toBe(0);
    expect(g.positions).toHaveLength(5);
    expect(g.positions[2][1]).toBeCloseTo(g.plot.y + g.plot.height / 2, 10);
    for (const stage of g.stages.filter((stage) => stage.connector)) {
      expect(stage.connector![0][1]).toBe(stage.points[2][1]);
      const next = g.stages.find((next) => next.index === stage.index + 1)!;
      expect(stage.connector![2][1]).toBe(next.points[0][1]);
    }
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
