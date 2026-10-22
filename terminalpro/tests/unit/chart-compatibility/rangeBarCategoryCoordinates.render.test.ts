import { type EChartsType, graphic, init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { rangeInput, rangeOptions } from "./rangeBar.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);

function input(
  keys: (string | number)[],
  direction: "vertical" | "horizontal" = "vertical",
) {
  const i = rangeInput(direction);
  i.style.categoryAxis.fields.type = "number";
  i.style.categoryCoordinates = {
    kind: "number",
    fullExtent: [-49.5, 149.5],
    ticks: [],
  };
  i.snapshot.rows = keys.flatMap((category, n) => [
    { id: `low-${n}`, category, values: { amount: n + 2, other: n + 4 } },
    { id: `high-${n}`, category, values: { amount: n + 8, other: n + 12 } },
  ]);
  return i;
}
function boxes(c: EChartsType, color = "#145da0") {
  return c
    .getZr()
    .storage.getDisplayList(true)
    .filter(
      (e): e is InstanceType<typeof graphic.Rect> =>
        e instanceof graphic.Rect && e.style.fill === color,
    );
}
function engine(i: ReturnType<typeof input>, check: (c: EChartsType) => void) {
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
function position(c: EChartsType, coordinate: number, vertical: boolean) {
  const p = c.convertToPixel(
    { gridIndex: 0 },
    vertical ? [coordinate, 0] : [0, coordinate],
  ) as number[];
  return p[vertical ? 0 : 1];
}
function span(c: EChartsType, bounds: readonly [number, number], vertical: boolean) {
  return Math.abs(position(c, bounds[1], vertical) - position(c, bounds[0], vertical));
}
function assertBands(
  c: EChartsType,
  keys: number[],
  bounds: readonly [number, number],
  interval: number | null,
  fraction: number,
  vertical: boolean,
  peers: number,
  fullSpan = bounds[1] - bounds[0],
) {
  const r = span(c, bounds, vertical) / fraction;
  const n = interval === null ? 1 : fullSpan / interval + 1;
  const width = r / Math.max(1, Math.min(n, Math.floor(r))) / peers;
  const actual = boxes(c);
  expect(actual).toHaveLength(keys.length);
  keys.forEach((coordinate, index) => {
    const rect = actual[index].shape;
    expect(vertical ? rect.width : rect.height).toBeCloseTo(width);
    expect(vertical ? rect.x : rect.y).toBe(
      Math.round(position(c, coordinate, vertical) - width / 2),
    );
  });
  return width;
}

it("renders [0,100,1] at actual numeric positions with encounter-order bandwidth and half-peer centering", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = input([0, 100, 1], direction);
    const vertical = direction === "vertical";
    engine(i, (c) => {
      const width = assertBands(c, [0, 100, 1], [-49.5, 149.5], 99, 1, vertical, 2);
      const first = boxes(c)[0].shape;
      const other = boxes(c, "#b33b32")[0].shape;
      expect(vertical ? other.x - first.x : other.y - first.y).toBeCloseTo(width);
      const p = [0, 100, 1].map((v) => position(c, v, vertical));
      expect((p[1] - p[0]) / (p[2] - p[0])).toBeCloseTo(100);
    });
    i.context.legendSelection = { other: false };
    engine(i, (c) => {
      assertBands(c, [0, 100, 1], [-49.5, 149.5], 99, 1, vertical, 1);
      expect(boxes(c, "#b33b32")).toHaveLength(0);
    });
  }
});

it("sizes cropped windows from full domain and expanded range, without re-padding supplied bounds", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = input([0, 100, 1], direction);
    i.style.categoryCoordinates = {
      kind: "number",
      fullExtent: [-100, 200],
      visibleRange: [0.25, 0.75],
      ticks: [],
    };
    engine(i, (c) => {
      const axis = (
        direction === "vertical" ? c.getOption().xAxis : c.getOption().yAxis
      ) as any[];
      expect([axis[0].min, axis[0].max]).toEqual([-25, 125]);
      assertBands(
        c,
        [0, 100, 1],
        [-25, 125],
        99,
        0.5,
        direction === "vertical",
        2,
        300,
      );
    });
  }
});

it("resets interval adjacency at numeric strings and retains full-width singleton sentinel", () => {
  for (const keys of [[0, "1", 1], [5]] as (string | number)[][]) {
    for (const direction of ["vertical", "horizontal"] as const) {
      const i = input(keys, direction);
      i.style.categoryCoordinates = {
        kind: "number",
        fullExtent: [-10, 10],
        ticks: [],
      };
      engine(i, (c) =>
        assertBands(
          c,
          keys.filter((k): k is number => typeof k === "number"),
          [-10, 10],
          null,
          1,
          direction === "vertical",
          2,
        ),
      );
    }
  }
});

it("renders irregular epoch spacing and the caller's calendar labels", () => {
  const day = 86_400_000;
  const start = Date.UTC(2024, 0, 1);
  for (const direction of ["vertical", "horizontal"] as const) {
    const keys = [start, start + 31 * day, start + 32 * day];
    const i = input(keys, direction);
    i.style.categoryAxis.fields.type = "time";
    const bounds: [number, number] = [start - day / 2, start + day * 32.5];
    i.style.categoryCoordinates = {
      kind: "time",
      fullExtent: bounds,
      ticks: [
        { coordinate: start, label: "Jan 2024" },
        { coordinate: start + day * 31, label: "Feb 2024" },
      ],
    };
    engine(i, (c) => {
      assertBands(c, keys, bounds, day, 1, direction === "vertical", 2);
      const svg = c.renderToSVGString();
      expect(svg).toContain("Jan 2024");
      expect(svg).toContain("Feb 2024");
    });
  }
});

it("suppresses outside-singleton and empty-domain glyphs with finite axes", () => {
  const i = input([5, "5", 6]);
  i.style.categoryCoordinates = {
    kind: "number",
    fullExtent: [5, 5],
    ticks: [{ coordinate: 5, label: "five" }],
  };
  engine(i, (c) => {
    expect(boxes(c)).toHaveLength(1);
    expect(c.renderToSVGString()).toContain("five");
  });
  i.style.categoryCoordinates = { kind: "number", fullExtent: [], ticks: [] };
  engine(i, (c) => expect(boxes(c)).toHaveLength(0));
});

it("keeps item identity for clipped edge bars whose center is outside the window", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = input([0, 126, 1], direction);
    const vertical = direction === "vertical";
    i.style.categoryCoordinates = {
      kind: "number",
      fullExtent: [-100, 200],
      visibleRange: [0.25, 0.75],
      ticks: [],
    };
    engine(i, (c) => {
      const boundary = position(c, 125, vertical);
      const rect = boxes(c)[1].shape;
      const start = vertical ? rect.x : rect.y;
      const width = vertical ? rect.width : rect.height;
      expect(position(c, 126, vertical)).toBeGreaterThan(boundary);
      expect(start).toBeLessThan(boundary);
      expect(start + width).toBeGreaterThan(boundary);
      const tooltip = (c.getOption().tooltip as any[])[0].formatter;
      expect(tooltip({ axisValue: 126 })).toBe("");
      expect(
        tooltip({ data: { metadata: { fieldId: "amount", groupSlot: 1 } } }),
      ).toContain("period:126<br/>");
    });
  }
});

it("expands ordinal bands with an explicitly supplied partial window in both directions", () => {
  for (const direction of ["vertical", "horizontal"] as const) {
    const i = input([0, 1, 2], direction);
    const vertical = direction === "vertical";
    i.style.categoryAxis.fields.type = "category";
    i.style.categoryCoordinates = {
      kind: "category",
      fullExtent: [-0.5, 2.5],
      visibleRange: [0.25, 0.75],
      ticks: [{ coordinate: 1, label: "middle" }],
    };
    engine(i, (c) => {
      const expanded = span(c, [0.25, 1.75], vertical) / 0.5;
      const categoryWidth = (expanded / 3) * 0.7;
      const step = Math.floor(categoryWidth / 1.8);
      const inset = Math.round((categoryWidth - step * 1.8) / 2);
      const width = Math.round(step * 0.8);
      const actual = boxes(c);
      expect(actual).toHaveLength(3);
      for (const [slot, box] of actual.entries()) {
        expect(vertical ? box.shape.width : box.shape.height).toBe(width);
        expect(vertical ? box.shape.x : box.shape.y).toBe(
          Math.round(position(c, slot, vertical) - categoryWidth / 2) + inset,
        );
      }
    });
  }
});
