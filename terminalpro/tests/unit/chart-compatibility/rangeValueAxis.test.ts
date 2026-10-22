import { type EChartsOption, graphic, init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import { projectRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBarProjection";
import {
  planRangeValueAxis,
  type RangeValueAxisInput,
} from "../../../src/components/General/Table/Chart/echarts/rangeValueAxis";
import { areaInput } from "./rangeArea.fixtures";
import { rangeInput, rangeOptions } from "./rangeBar.fixtures";

const plan = (
  dataExtent: RangeValueAxisInput["dataExtent"],
  input: Partial<RangeValueAxisInput> = {},
) => planRangeValueAxis({ dataExtent, bounds: {}, span: 300, ...input });

it.each([
  { data: [4.53, 6.47], span: 49, full: [4, 7], ticks: [4, 7] },
  { data: [-6.47, -4.53], span: 49, full: [-7, -4], ticks: [-7, -4] },
  { data: [-3.2, 8.7], span: 300, full: [-5, 10], ticks: [-5, 0, 5, 10] },
  { data: [4.53, 6.47], span: 300, full: [4.5, 6.5], ticks: [4.5, 5, 5.5, 6, 6.5] },
])("keeps source linear nicing for $data at $span pixels", ({
  data,
  span,
  full,
  ticks,
}) => {
  const result = plan(data as [number, number], { span });
  expect(result.semanticExtent).toEqual(data);
  expect(result.fullExtent).toEqual(full);
  expect(result.visibleExtent).toEqual(full);
  expect(result.rawTicks).toEqual(ticks);
  expect(result.valueScale).toEqual({ min: full[0], max: full[1], ticks });
});

it("applies each explicit endpoint without inserting a zero baseline", () => {
  expect(plan([4.53, 6.47], { bounds: { min: 5 } }).semanticExtent).toEqual([5, 6.47]);
  expect(plan([4.53, 6.47], { bounds: { max: 6 } }).semanticExtent).toEqual([4.53, 6]);
  expect(plan([4.53, 6.47], { bounds: { min: -2, max: 9 } }).semanticExtent).toEqual([
    -2, 9,
  ]);
  expect(plan([4.53, 6.47]).fullExtent[0]).toBeGreaterThan(0);
  expect(plan([-6.47, -4.53]).fullExtent[1]).toBeLessThan(0);
});

const emptyCases: readonly Pick<RangeValueAxisInput, "dataExtent" | "bounds">[] = [
  { dataExtent: [], bounds: {} },
  { dataExtent: [], bounds: { min: 4 } },
  { dataExtent: [], bounds: { max: 7 } },
  { dataExtent: [2, 8], bounds: { min: 10 } },
  { dataExtent: [2, 8], bounds: { max: 1 } },
  { dataExtent: [], bounds: { min: 7, max: 4 } },
];
it.each(
  emptyCases,
)("keeps an unresolved/reversed effective domain empty: $bounds", (input) => {
  const result = planRangeValueAxis({ ...input, span: 300 });
  expect(result).toMatchObject({
    semanticExtent: [],
    fullExtent: [],
    visibleExtent: [],
    rawTicks: [],
    valueScale: null,
  });
});

it("permits a fully explicit raw scale without observations", () => {
  const result = plan([], { bounds: { min: 4.53, max: 6.47 } });
  expect(result.semanticExtent).toEqual([4.53, 6.47]);
  expect(result.valueScale).toEqual({
    min: 4.5,
    max: 6.5,
    ticks: [4.5, 5, 5.5, 6, 6.5],
  });
});

it.each([
  0, 1, 49, 300,
])("keeps equal raw bounds distinct from engine transport at %s pixels", (span) => {
  const result = plan([5.5, 5.5], { span });
  expect(result.semanticExtent).toEqual([5.5, 5.5]);
  expect(result.fullExtent).toEqual([5.5, 5.5]);
  expect(result.visibleExtent).toEqual([5.5, 5.5]);
  expect(result.valueScale).toEqual({ min: 5.5, max: 5.5, ticks: span ? [5.5] : [] });
  expect(plan([], { span, bounds: { min: 5.5, max: 5.5 } })).toEqual(result);
});

it("crops the unchanged nice domain and reports the final zoom density", () => {
  const full = plan([-3.2, 8.7]);
  const crop = plan([-3.2, 8.7], { visibleRange: [0.25, 0.75] });
  expect(crop.semanticExtent).toEqual(full.semanticExtent);
  expect(crop.fullExtent).toEqual([-5, 10]);
  expect(crop.visibleExtent).toEqual([-1.25, 6.25]);
  expect(crop.density).toEqual({ minTickCount: 2, maxTickCount: 12, tickCount: 10 });
  expect(crop.rawTicks).toEqual([0, 2, 4, 6]);
  expect(crop.valueScale).toEqual({ min: -1.25, max: 6.25, ticks: [0, 2, 4, 6] });
  expect(plan([-3.2, 8.7], { span: 149, visibleRange: [0.45, 0.55] }).rawTicks).toEqual(
    [-1, 0, 1],
  );
});

it("retains only an exact existing tick in a zero-width crop and emits none at zero span", () => {
  expect(plan([0, 10], { visibleRange: [0.5, 0.5] }).valueScale).toEqual({
    min: 5,
    max: 5,
    ticks: [],
  });
  expect(plan([0, 10], { visibleRange: [0.4, 0.4] }).valueScale).toEqual({
    min: 4,
    max: 4,
    ticks: [4],
  });
  const density = { minTickCount: 1, maxTickCount: 3, tickCount: 3 };
  const chosen = plan([4.53, 6.47], { density });
  expect(chosen.fullExtent).toEqual([4, 7]);
  expect(chosen.rawTicks).toEqual([4, 5, 6, 7]);
  expect(chosen.density).toEqual(density);
  expect(plan([5.5, 5.5], { span: 0, density }).rawTicks).toEqual([]);
  expect(
    plan([0, 10], { span: 0, density, visibleRange: [0.25, 0.75] }).rawTicks,
  ).toEqual([]);
});

it.each([
  { span: Number.NaN },
  { span: Number.POSITIVE_INFINITY },
  { span: -1 },
  { dataExtent: [2, 1] },
  { dataExtent: [0, Number.NaN] },
  { dataExtent: [1] },
  { dataExtent: new Array(2) },
  { bounds: { min: Number.NEGATIVE_INFINITY } },
  { bounds: { max: Number.NaN } },
  { visibleRange: [-0.1, 1] },
  { visibleRange: [0, 1.1] },
  { visibleRange: [0.7, 0.2] },
  { visibleRange: [0, Number.NaN] },
  { visibleRange: [0] },
  { visibleRange: new Array(2) },
  { density: { minTickCount: 1, tickCount: Number.NaN, maxTickCount: 4 } },
  { density: { minTickCount: -1, tickCount: 2, maxTickCount: 4 } },
  { density: { minTickCount: 1, tickCount: 2.5, maxTickCount: 4 } },
  { density: { minTickCount: 3, tickCount: 2, maxTickCount: 4 } },
  { density: { minTickCount: 1, tickCount: 5, maxTickCount: 4 } },
  { density: { minTickCount: 1, tickCount: 2 } },
  { density: null },
  { bounds: null },
  { visibleRange: null },
])("rejects invalid planner input %j", (input) => {
  expect(() => plan([2, 8], input as Partial<RangeValueAxisInput>)).toThrow(
    /Range.*axis/i,
  );
});

it("rejects derived overflow while retaining representable finite extremes", () => {
  expect(() => plan([-1e308, 1e308])).toThrow(/Range.*axis/i);
  expect(() => plan([1e308, 1.7e308])).toThrow(/Range.*axis/i);
  expect(plan([1e300, 1e300]).valueScale).toEqual({
    min: 1e300,
    max: 1e300,
    ticks: [1e300],
  });
  const tiny = plan([1e-200, 2e-200]);
  expect(tiny.fullExtent.every(Number.isFinite)).toBe(true);
  expect(tiny.rawTicks.length).toBeGreaterThan(1);
  expect(tiny.rawTicks.every(Number.isFinite)).toBe(true);
});

it("does not mutate its inputs and uses the projected enabled-field extent", () => {
  const input = Object.freeze({
    dataExtent: Object.freeze([2, 14] as const),
    bounds: Object.freeze({ min: 3 }),
    span: 300,
    visibleRange: Object.freeze([0.25, 0.75] as const),
    density: Object.freeze({ minTickCount: 1, tickCount: 3, maxTickCount: 3 }),
  });
  expect(() => planRangeValueAxis(input)).not.toThrow();
  expect(input.dataExtent).toEqual([2, 14]);
  const fixture = rangeInput();
  const projected = projectRangeBar(fixture.snapshot, { other: false });
  if (projected.status !== "resolved") throw Error(JSON.stringify(projected));
  expect(plan(projected.projection.dataExtent).semanticExtent).toEqual([2, 10]);
  const hidden = projectRangeBar(fixture.snapshot, { amount: false, other: false });
  if (hidden.status !== "resolved") throw Error(JSON.stringify(hidden));
  expect(plan(hidden.projection.dataExtent).valueScale).toBeNull();
});

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function render(
  options: EChartsOption,
  check: (chart: ReturnType<typeof init>) => void,
) {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(options);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    check(chart);
  } finally {
    chart.dispose();
  }
}

it.each([
  "vertical",
  "horizontal",
] as const)("hands planned raw ticks to actual %s Bar axes at their numeric positions", (direction) => {
  const fixture = rangeInput(direction);
  const vertical = direction === "vertical";
  const input = {
    ...fixture,
    style: {
      ...fixture.style,
      valueScale: plan([2, 14], {
        bounds: { min: 0, max: 20 },
        span: vertical ? 400 : 480,
      }).valueScale,
    },
  };
  render(rangeOptions(input), (chart) => {
    const ticks = input.style.valueScale!.ticks;
    expect(ticks).toEqual([0, 5, 10, 15, 20]);
    expect(
      [...chart.renderToSVGString().matchAll(/>axis:([^<]*)</g)].map((m) =>
        Number(m[1]),
      ),
    ).toEqual(ticks);
    const coordinate = (value: number) =>
      (
        chart.convertToPixel(
          { gridIndex: 0 },
          vertical ? [0, value] : [value, 0],
        ) as number[]
      )[vertical ? 1 : 0];
    const start = coordinate(0);
    const end = coordinate(20);
    for (const tick of ticks) {
      const position = coordinate(tick);
      const label = chart
        .getZr()
        .storage.getDisplayList(true)
        .find((el) => el.style.text === `axis:${tick}`)!;
      const anchor = label.transformCoordToGlobal(
        Number(label.style.x),
        Number(label.style.y),
      );
      expect(anchor[vertical ? 1 : 0]).toBeCloseTo(position);
      expect((position - start) / (end - start)).toBeCloseTo(tick / 20);
    }
    expect(chart.renderToSVGString()).toContain("label:2");
    expect(chart.renderToSVGString()).toContain("label:8");
  });
});

it.each([
  "vertical",
  "horizontal",
] as const)("lets the %s Bar mapper transport raw constants and empty explicit ticks", (direction) => {
  const fixture = rangeInput(direction);
  const input = {
    ...fixture,
    style: { ...fixture.style, valueScale: plan([5.5, 5.5]).valueScale },
  };
  const numericAxis = vi.fn<typeof input.context.display.numericAxis>(
    (v) => `axis:${v}`,
  );
  input.context.display.numericAxis = numericAxis;
  render(rangeOptions(input), (chart) => {
    expect(chart.renderToSVGString().match(/>axis:5.5</g)).toHaveLength(1);
    expect(chart.renderToSVGString()).not.toContain("axis:0.5");
    expect(chart.renderToSVGString()).toContain("label:2");
    expect(
      chart
        .getZr()
        .storage.getDisplayList(true)
        .some((el) => el instanceof graphic.Rect && el.style.fill === "#145da0"),
    ).toBe(true);
  });
  expect(numericAxis.mock.calls.map(([value]) => value)).toEqual([5.5]);
  input.snapshot.rows = [];
  input.style.valueScale = plan([], {
    bounds: { min: 4, max: 7 },
    span: 49,
  }).valueScale;
  render(rangeOptions(input), (chart) => {
    expect(
      [...chart.renderToSVGString().matchAll(/>axis:([^<]*)</g)].map((m) =>
        Number(m[1]),
      ),
    ).toEqual([4, 7]);
    expect(chart.renderToSVGString()).not.toContain("label:");
  });
});

it("hands the same raw planner scale to the Area mapper", () => {
  const fixture = areaInput();
  const input = {
    ...fixture,
    style: {
      ...fixture.style,
      valueScale: plan([-3.2, 8.7], { visibleRange: [0.25, 0.75] }).valueScale,
    },
  };
  const result = translateRangeArea(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  render(result.options, (chart) => {
    expect(
      [...chart.renderToSVGString().matchAll(/>axis:([^<]*)</g)].map((m) =>
        Number(m[1]),
      ),
    ).toEqual([0, 2, 4, 6]);
    expect(chart.renderToSVGString()).toContain("label:8");
  });
});
