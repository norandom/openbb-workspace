import { type CustomSeriesOption, type EChartsType, graphic, init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { rangeInput, rangeOptions } from "./rangeBar.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function filled(chart: EChartsType, color = "#145da0") {
  return chart
    .getZr()
    .storage.getDisplayList(true)
    .filter(
      (el): el is InstanceType<typeof graphic.Rect> =>
        el instanceof graphic.Rect && el.style.fill === color,
    );
}
function engine(i: ReturnType<typeof rangeInput>, check: (c: EChartsType) => void) {
  const c = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...i.context.viewport,
  });
  try {
    c.setOption(rangeOptions(i));
    check(c);
    expect(c.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    c.dispose();
  }
}
function pixel(c: EChartsType, slot: number, value: number, vertical = true): number[] {
  return c.convertToPixel(
    { gridIndex: 0 },
    vertical ? [slot, value] : [value, slot],
  ) as number[];
}

it("renders source grouped intervals, reserved null slots, endpoint text and explicit nonuniform ticks in both directions", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = rangeInput(direction);
    const vertical = direction === "vertical";
    engine(i, (c) => {
      const boxes = filled(c);
      expect(boxes).toHaveLength(2);
      expect(filled(c, "#b33b32")).toHaveLength(2);
      const span = vertical ? 480 : 400;
      const categoryWidth = (span / 3) * 0.7;
      const step = Math.floor(categoryWidth / 1.8);
      const inset = Math.round((categoryWidth - step * 1.8) / 2);
      const width = Math.round(step * 0.8);
      for (const [index, slot] of [0, 2].entries()) {
        const low = Math.round(
          pixel(c, slot, slot === 0 ? 2 : 5, vertical)[vertical ? 1 : 0],
        );
        const high = Math.round(
          pixel(c, slot, slot === 0 ? 8 : 10, vertical)[vertical ? 1 : 0],
        );
        const center = pixel(c, slot, 0, vertical)[vertical ? 0 : 1];
        const r = boxes[index].shape;
        expect(vertical ? r.x : r.y).toBe(
          Math.round(center - categoryWidth / 2) + inset,
        );
        expect(vertical ? r.width : r.height).toBe(width);
        expect(vertical ? r.y : r.x).toBe(Math.min(low, high));
        expect(vertical ? r.height : r.width).toBe(Math.abs(high - low));
        expect(boxes[index].style.opacity).toBe(0.4);
      }
      const svg = c.renderToSVGString();
      expect([...svg.matchAll(/>(axis:[^<]*)</g)].map((m) => m[1])).toEqual([
        "axis:0",
        "axis:3",
        "axis:11",
        "axis:20",
      ]);
      expect(svg).toContain("label:2");
      expect(svg).toContain("label:8");
      expect(svg).toContain("clip-path=");
      const texts = c
        .getZr()
        .storage.getDisplayList(true)
        .filter((el) => el instanceof graphic.Text || el.type === "tspan");
      const lowLabel = texts.find((t) => t.style.text === "label:2")!;
      expect(lowLabel).toBeDefined();
      const highLabel = texts.find((t) => t.style.text === "label:8")!;
      const r = boxes[0].shape;
      expect(lowLabel.style.x).toBe(vertical ? r.x + r.width / 2 : r.x - 5);
      // ZRender emits middle-baseline spans; the deterministic font shim has height six.
      expect(lowLabel.style.y).toBe(
        vertical ? r.y + r.height + 5 + 3 : r.y + r.height / 2,
      );
      expect(highLabel.style.x).toBe(vertical ? r.x + r.width / 2 : r.x + r.width + 5);
      expect(highLabel.style.y).toBe(vertical ? r.y - 5 - 3 : r.y + r.height / 2);
      expect(lowLabel.style.textAlign).toBe(vertical ? "center" : "right");
      expect(highLabel.style.textAlign).toBe(vertical ? "center" : "left");
      const outline = c
        .getZr()
        .storage.getDisplayList(true)
        .find((el) => el instanceof graphic.Rect && el.style.stroke === "#ae1234")!;
      expect(outline.style).toMatchObject({
        opacity: 0.7,
        lineWidth: 2,
        lineDash: [3, 1],
        lineDashOffset: 1,
      });
    });
  }
});

it("renders singleton stroke thickness on distinct and equal domains without replacing raw endpoint labels", () => {
  for (const direction of ["vertical", "horizontal"] as const)
    for (const equal of [false, true]) {
      const i = rangeInput(direction);
      i.snapshot.rows = [i.snapshot.rows[0]];
      i.snapshot.rows[0].values.amount = 5;
      i.context.legendSelection = { other: false };
      if (equal) i.style.valueScale = { min: 5, max: 5, ticks: [5] };
      engine(i, (c) => {
        const r = filled(c)[0].shape;
        expect(direction === "vertical" ? r.height : r.width).toBe(2);
        expect(direction === "vertical" ? r.y : r.x).toBe(
          Math.round(
            pixel(c, 0, equal ? 0.5 : 5, direction === "vertical")[
              direction === "vertical" ? 1 : 0
            ],
          ),
        );
        expect(c.renderToSVGString()).toContain("label:5");
        if (equal) {
          expect(c.renderToSVGString().match(/>axis:5</g) ?? []).toHaveLength(1);
          expect(c.renderToSVGString()).not.toContain("axis:0.5");
        }
      });
    }
});

it("keeps raw 2/8 labels at the equal-domain midpoint and explicit ticks without data, or raw data without an effective scale", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = rangeInput(direction);
    i.style.valueScale = { min: 5, max: 5, ticks: [5] };
    engine(i, (c) => {
      const r = filled(c)[0].shape;
      const vertical = direction === "vertical";
      const valueIndex = vertical ? 1 : 0;
      const start = pixel(c, 0, 0, vertical)[valueIndex];
      const end = pixel(c, 0, 1, vertical)[valueIndex];
      expect(vertical ? r.y : r.x).toBe(Math.round((start + end) / 2));
      expect(vertical ? r.height : r.width).toBe(2);
      expect(c.renderToSVGString()).toContain("label:2");
      expect(c.renderToSVGString()).toContain("label:8");
    });
    i.snapshot.rows = [];
    i.style.valueScale = { min: 0, max: 20, ticks: [0, 3, 11, 20] };
    engine(i, (c) => {
      expect(filled(c)).toHaveLength(0);
      expect(c.renderToSVGString()).toContain("axis:11");
    });
    i.snapshot = rangeInput().snapshot;
    i.style.valueScale = null;
    engine(i, (c) => {
      expect(filled(c)).toHaveLength(0);
      expect(c.renderToSVGString()).not.toMatch(/axis:|label:/);
    });
  }
});

it("uses nondefault category inner/outer padding for ordinal starts and peer widths in both directions", () => {
  for (const direction of ["vertical", "horizontal"] as const)
    for (const singleton of [false, true]) {
      const i = rangeInput(direction);
      const vertical = direction === "vertical";
      i.style.band.paddingInner = 0.6;
      i.style.band.paddingOuter = 0.25;
      if (singleton) i.snapshot.rows = i.snapshot.rows.slice(0, 2);
      engine(i, (c) => {
        const span = vertical ? 480 : 400;
        const origin = vertical ? 60 : 40;
        // Source BandScale ignores inner padding for its sole category.
        const categoryStep = span / 2.9;
        const categoryWidth = singleton ? span * 0.5 : categoryStep * 0.4;
        const peerStep = Math.floor(categoryWidth / 1.8);
        const peerInset = Math.round((categoryWidth - peerStep * 1.8) / 2);
        const peerWidth = Math.round(peerStep * 0.8);
        for (const [fieldIndex, color] of ["#145da0", "#b33b32"].entries()) {
          const rects = filled(c, color);
          expect(rects).toHaveLength(singleton ? 1 : 2);
          for (const [index, slot] of (singleton ? [0] : [0, 2]).entries()) {
            const start = singleton
              ? origin + span * 0.25
              : origin + (0.25 + slot) * categoryStep;
            const r = rects[index].shape;
            expect(vertical ? r.x : r.y).toBe(
              Math.round(start) + peerInset + fieldIndex * peerStep,
            );
            expect(vertical ? r.width : r.height).toBe(peerWidth);
          }
        }
      });
    }
});

it("clips range and endpoint labels to actual plot without fabricating boundary values, including wholly offscale data", () => {
  const i = rangeInput();
  i.style.valueScale = { min: 4, max: 6, ticks: [4, 6] };
  engine(i, (c) => {
    const r = filled(c)[0];
    expect(r.shape.y).toBeLessThan(40);
    expect(r.shape.y + r.shape.height).toBeGreaterThan(440);
    expect((r as any).__clipPaths[0].shape).toMatchObject({
      x: 60,
      y: 40,
      width: 480,
      height: 400,
    });
    expect(c.renderToSVGString()).not.toContain("label:6");
  });
  i.style.valueScale = { min: 30, max: 40, ticks: [30, 40] };
  engine(i, (c) => {
    for (const r of filled(c)) expect(r.shape.y).toBeGreaterThan(440);
  });
});

it("regroups hidden fields then restores stable series IDs, preserving subpixel raw peer width", () => {
  const i = rangeInput();
  engine(i, (c) => {
    const width = filled(c)[0].shape.width;
    i.context.legendSelection = { other: false };
    c.setOption(rangeOptions(i), { notMerge: true });
    expect(filled(c, "#b33b32")).toHaveLength(0);
    expect(filled(c)[0].shape.width).toBeGreaterThan(width);
    i.context.legendSelection = { other: true };
    c.setOption(rangeOptions(i), { notMerge: true });
    expect(filled(c)[0].shape.width).toBe(width);
    expect(c.getOption().series).toMatchObject([
      { id: "amount", name: "amount" },
      { id: "other", name: "other" },
    ]);
  });
  i.context.plot.width = 1;
  engine(i, (c) => {
    const expected = (((1 / 3) * 0.7) / 1.8) * 0.8;
    expect(filled(c)[0].shape.width).toBeCloseTo(expected);
    expect(expected).toBeLessThan(1);
  });
});

it("propagates invalid actual engine coordinates from renderItem", () => {
  const i = rangeInput();
  const o = rangeOptions(i);
  const series = (o.series as CustomSeriesOption[])[0];
  const original = series.renderItem!;
  series.renderItem = (params, api) =>
    original(params, { ...api, coord: () => [Number.NaN, 1] });
  const c = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...i.context.viewport,
  });
  try {
    expect(() => c.setOption(o)).toThrow(/Range Bar.*geometry|Range Bar.*coordinate/);
  } finally {
    c.dispose();
  }
});

it("preserves unrounded peer bands, inside endpoint alignment and zero-width suppression", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = rangeInput(direction);
    const vertical = direction === "vertical";
    i.context.plot.width = 479;
    i.context.plot.height = 399;
    i.style.band.groupPaddingInner = 0;
    i.style.fields.amount.label.placement = "inside";
    engine(i, (c) => {
      const r = filled(c)[0].shape;
      const other = filled(c, "#b33b32")[0].shape;
      const width = (((vertical ? 479 : 399) / 3) * 0.7) / 2;
      expect(vertical ? r.width : r.height).toBeCloseTo(width);
      expect(vertical ? other.x - r.x : other.y - r.y).toBeCloseTo(width);
      const texts = c.getZr().storage.getDisplayList(true);
      const low = texts.find((t) => t.style.text === "label:2")!;
      const high = texts.find((t) => t.style.text === "label:8")!;
      expect(low.style.x).toBe(vertical ? r.x + r.width / 2 : r.x + 5);
      expect(high.style.x).toBe(vertical ? r.x + r.width / 2 : r.x + r.width - 5);
      expect(low.style.y).toBe(vertical ? r.y + r.height - 5 - 3 : r.y + r.height / 2);
      expect(high.style.y).toBe(vertical ? r.y + 5 + 3 : r.y + r.height / 2);
      expect(low.style.textAlign).toBe(vertical ? "center" : "left");
      expect(high.style.textAlign).toBe(vertical ? "center" : "right");
    });
    i.style.band.groupPaddingInner = 1;
    engine(i, (c) => {
      expect(filled(c)).toHaveLength(0);
      expect(c.renderToSVGString()).not.toContain("label:");
    });
  }
});
