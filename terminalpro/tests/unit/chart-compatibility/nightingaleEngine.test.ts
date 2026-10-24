import { init, type EChartsType } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { input, options } from "./nightingale.fixtures";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);
function native(i: ReturnType<typeof input>, check: (chart: EChartsType) => void) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...i.context.viewport,
  });
  try {
    chart.setOption(options(i));
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    check(chart);
  } finally {
    chart.dispose();
  }
}
function shapes(chart: EChartsType, index: number): any[] {
  const data = (chart as any).getModel().getSeriesByIndex(index).getData();
  return Array.from(
    { length: data.count() },
    (_, i) => data.getItemGraphicEl(i)?.shape,
  );
}
it("native polar signed stacks survive omitted observations before and after negative values", () => {
  const i = input("normalized");

  native(i, (chart) => {
    const a = shapes(chart, 0);
    const b = shapes(chart, 1);
    expect(a).toHaveLength(5);
    expect(b).toHaveLength(6);
    for (const shape of [...a, ...b]) expect(shape).toBeDefined();
    expect(a[1].r).not.toBe(a[1].r0);
    expect(b[3].r).not.toBe(b[3].r0);
    expect(a[4].r).not.toBe(a[4].r0);
  });
});
it("native full bands are clockwise and centered on category rays; grouped bands divide the angle", () => {
  const i = input();
  native(i, (chart) => {
    const a = shapes(chart, 0);
    const b = shapes(chart, 1);
    expect(Math.abs(a[0].endAngle - a[0].startAngle)).toBeCloseTo(Math.PI / 3);
    expect((a[0].startAngle + a[0].endAngle) / 2).toBeCloseTo(-Math.PI / 2);
    expect((a[1].startAngle + a[1].endAngle) / 2).toBeGreaterThan(
      (a[0].startAngle + a[0].endAngle) / 2,
    );
    expect(b[0].r0).toBeCloseTo(a[0].r);
  });
  native(input("grouped"), (chart) => {
    const a = shapes(chart, 0);
    const b = shapes(chart, 1);
    expect(Math.abs(a[0].endAngle - a[0].startAngle)).toBeCloseTo(Math.PI / 6);
    expect(a[0].endAngle).toBeCloseTo(b[0].startAngle);
  });
});
it("native one-category full circle and all-zero/missing data stay finite", () => {
  const i = input();
  const one = { ...i, snapshot: { ...i.snapshot, rows: [i.snapshot.rows[0]] } };
  native(one, (chart) =>
    expect(
      Math.abs(shapes(chart, 0)[0].endAngle - shapes(chart, 0)[0].startAngle),
    ).toBeCloseTo(2 * Math.PI),
  );
  const zero = {
    ...i,
    snapshot: {
      ...i.snapshot,
      rows: i.snapshot.rows.map((r) => ({
        ...r,
        values: { primary: 0, secondary: null },
      })),
    },
  };
  native(zero, (chart) => {
    expect(shapes(chart, 1)).toEqual([]);
    expect(shapes(chart, 0)).toHaveLength(6);
  });
});
it("native sparse negative series keeps signed stacking aligned by explicit category IDs", () => {
  const i = input("normalized");
  const rows = [
    { id: "a", category: "A", values: { primary: null, secondary: -10 } },
    { id: "b", category: "B", values: { primary: -20, secondary: -10 } },
    { id: "c", category: "A", values: { primary: null, secondary: -5 } },
    { id: "d", category: "D", values: { primary: -10, secondary: -5 } },
  ];
  native({ ...i, snapshot: { ...i.snapshot, rows } }, (chart) => {
    const a = shapes(chart, 0);
    const b = shapes(chart, 1);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(4);
    expect(b[1].r0).toBeCloseTo(a[0].r);
    expect(b[3].r0).toBeCloseTo(a[1].r);
    expect(b[0].r).not.toBe(b[0].r0);
    expect(b[2].r).not.toBe(b[2].r0);
  });
});
