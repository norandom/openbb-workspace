import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { isAreaFamily } from "../../../src/components/General/Table/Chart/echarts/cartesianAreaTypes";
import { isCartesianFamily, isNormalizedFamily } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  measureText: (value: string) => ({ width: value.length * 6 }),
} as any));

it("identifies area contracts without activating ordinary Cartesian admission", () => {
  for (const family of ["area", "stackedArea", "normalizedArea"]) {
    expect(isAreaFamily(family)).toBe(true);
    expect(isCartesianFamily(family)).toBe(false);
  }
  for (const family of ["line", "stackedColumn", "normalizedColumn", "normalizedBar", "columnLineCombo", "unknown"])
    expect(isAreaFamily(family)).toBe(false);
  expect(isNormalizedFamily("normalizedArea")).toBe(false);
});

type Point = readonly [number, number | null];
const cases: { name: string; base: Point[]; delta: Point[]; ends: (number | null)[] }[] = [
  { name: "signed crossings and negative deltas", base: [[0,-2],[1,2],[2,-1]],
    delta: [[0,5],[1,-5],[2,-3]], ends: [3,-3,-4] },
  { name: "null boundary termination", base: [[0,1],[1,null],[2,2]],
    delta: [[0,2],[1,null],[2,3]], ends: [3,null,5] },
  { name: "duplicate X split endpoints", base: [[0,1],[1,2],[1,4],[2,3]],
    delta: [[0,2],[1,3],[1,-1],[2,2]], ends: [3,5,3,5] },
];

it.each(cases)("draws native area bands with $name", ({ base, delta, ends }) => {
  const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 800, height: 500 });
  const pair = (id: string, data: Point[]) => ({
    id, name: id, type: "line" as const, stack: "internal-band", stackStrategy: "all" as const,
    // ECharts stacks the first numeric dimension: explicit Y-first storage prevents stacking X.
    dimensions: ["y", "x"], encode: { x: "x", y: "y" },
    data: data.map(([x, y]) => [y, x]), showSymbol: false, silent: true,
    connectNulls: false, tooltip: { show: false }, lineStyle: { width: 0, opacity: 0 },
  });
  try {
    chart.setOption({ animation: false, legend: { data: ["main"] },
      xAxis: { type: "value", min: 0, max: 2 }, yAxis: { type: "value", min: -6, max: 8 },
      series: [
        { ...pair("openbb-area-base-main-0", base), areaStyle: { opacity: 0 } },
        { ...pair("openbb-area-fill-main-0", delta), areaStyle: { color: "#ff0000" } },
        { id: "main", name: "main", type: "line", data: base.map(([x], i) => [x, ends[i]]),
          showSymbol: true, connectNulls: false, lineStyle: { color: "#0000ff" } },
      ],
    });
    const model = (chart as any).getModel();
    const data = model.getSeriesByIndex(1).getData();
    const dimension = data.getCalculationInfo("stackResultDimension");
    const points = Array.from(data.getLayout("points")) as number[];
    const pixel = (point: Point) => chart.convertToPixel({ seriesIndex: 2 }, [...point] as number[]) as number[];
    ends.forEach((end, i) => {
      const actual = data.get(dimension, i);
      if (end === null) {
        expect(Number.isFinite(actual)).toBe(false);
        expect(Number.isFinite(points[i * 2 + 1])).toBe(false);
      } else {
        expect(actual).toBeCloseTo(end, 12);
        const expected = pixel([base[i][0], end]);
        expect(points[i * 2]).toBeCloseTo(expected[0], 3);
        expect(points[i * 2 + 1]).toBeCloseTo(expected[1], 3);
      }
    });
    const svg = chart.renderToSVGString();
    const fills = [...svg.matchAll(/<path\b[^>]*>/g)].map(match => match[0])
      .filter(path => path.includes('fill="#ff0000"'));
    expect(fills).toHaveLength(1);
    expect(fills[0]).not.toMatch(/NaN|Infinity/);
    const path = fills[0].match(/ d="([^"]*)"/)![1];
    if (ends.includes(null)) {
      expect(path.match(/M/g)).toHaveLength(2);
      expect(path.match(/Z/g)).toHaveLength(2);
    } else {
      const expected = [
        ...ends.flatMap((end, i) => pixel([base[i][0], end])),
        ...[...base].reverse().flatMap(pixel),
      ];
      const actual = path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)!.map(Number);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(0.051));
    }
    expect(model.getComponent("legend").getData().map((item: any) => item.get("name"))).toEqual(["main"]);
    expect(model.getSeriesByIndex(2).id).toBe("main");
    expect(model.getSeriesByIndex(2).getData().count()).toBe(base.length);
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
  } finally { chart.dispose(); }
});
