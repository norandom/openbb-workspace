import { init } from "echarts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RangeResolvedAxis } from "../../../src/components/General/Table/Chart/application/rangeAxisAppearance";
import { resolveWaterfallAppearance } from "../../../src/components/General/Table/Chart/application/waterfallAppearance";
import type { WaterfallAppearanceInput } from "../../../src/components/General/Table/Chart/application/waterfallTypes";
import {
  planWaterfallCategoryLabels,
  type WaterfallCategoryLabelInput,
} from "../../../src/components/General/Table/Chart/echarts/waterfallAxisLabels";
import { sessionFixture } from "../chart-application/applicationSessionFixture";
import { applicationStyle } from "./cartesian.application.fixtures";
import { bars, projected, waterfallInput } from "./waterfall.fixtures";

const categories = [
  "Revenue",
  "Cost of revenue",
  "Operating expenses",
  "Other income / expenses, net",
  "Income tax expense",
];
const expected = [
  "Revenue",
  "Cost of\nrevenue",
  "Operating\nexpenses",
  "Other income /\nexpenses, net",
  "Income tax\nexpense",
];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 5 }),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => vi.restoreAllMocks());

function fixture(labels = categories): WaterfallCategoryLabelInput {
  const base = applicationStyle().application.axes.category;
  const axis: RangeResolvedAxis = {
    ...base,
    fields: { ...base.fields, type: "category", position: "bottom" },
    labels: {
      ...base.labels,
      font: "Verdana, sans-serif",
      size: 11,
      fontWeight: 400,
      rotation: undefined,
      autoRotate: true,
      enabled: true,
      avoidCollisions: true,
      wrapping: "on-space",
    },
  };
  return {
    axis,
    snapshot: {
      rows: labels.map((category, index) => ({
        id: `source-${index}`,
        category,
        values: {},
      })),
    },
    display: { category: (value) => value },
    plotSpan: 521,
    crossSize: 285,
    direction: "vertical",
  };
}

function labels(
  input: WaterfallCategoryLabelInput,
  changes: Partial<RangeResolvedAxis["labels"]>,
) {
  return {
    ...input,
    axis: { ...input.axis, labels: { ...input.axis.labels, ...changes } },
  };
}

it("wraps all five source-ordered FMP categories before automatic rotation", () => {
  const input = fixture();
  const before = structuredClone(input.snapshot);
  expect(planWaterfallCategoryLabels(input)).toEqual({ labels: expected, rotation: 0 });
  expect(input.snapshot).toEqual(before);
});

function fmpInput() {
  const input = waterfallInput([
    109417000000, -54647000000, -19075000000, 572000000, -6478000000,
  ]);
  input.context.viewport = { width: 620, height: 285 };
  input.context.display.category = (value) => value;
  input.context.display.numericAxis = (value) =>
    typeof value === "number" && Math.abs(value) >= 1e9
      ? `${(value / 1e9).toFixed(2)} B`
      : value;
  input.snapshot.rows.forEach((row, index) => {
    row.category = categories[index];
  });
  input.appearance.application.padding = { top: 23, right: 23, bottom: 23, left: 23 };
  input.appearance.application.legend.enabled = true;
  for (const axis of Object.values(input.appearance.application.axes)) {
    axis.ticks.enabled = false;
    Object.assign(axis.labels, {
      font: "Verdana, sans-serif",
      size: 11,
      fontWeight: 400,
    });
  }
  Object.assign(input.appearance.application.axes.category.labels, {
    font: "Verdana, sans-serif",
    size: 11,
    fontWeight: 400,
    rotation: undefined,
    autoRotate: true,
    enabled: true,
    avoidCollisions: true,
    wrapping: "on-space",
  });
  return input;
}

it("renders the default FMP chart with native two-line categories and no automatic rotation", () => {
  const input = fmpInput();
  const options = projected(input).options;
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 620,
    height: 285,
  });
  try {
    chart.setOption(options);
    expect(
      (chart.getOption().xAxis as { axisLabel: { rotate: number } }[])[0].axisLabel
        .rotate,
    ).toBe(0);
    const svg = chart.renderToSVGString();
    for (const line of expected.flatMap((label) => label.split("\n")))
      expect(svg).toContain(`>${line}</text>`);
    expect(bars(chart)).toHaveLength(5);
    const balances = [109417000000, 54770000000, 35695000000, 36267000000, 29789000000];
    for (const [index, bar] of bars(chart).entries()) {
      const a = chart.convertToPixel({ gridIndex: 0 }, [
        index,
        index ? balances[index - 1] : 0,
      ]) as number[];
      const b = chart.convertToPixel({ gridIndex: 0 }, [
        index,
        balances[index],
      ]) as number[];
      expect(bar.shape.y).toBeCloseTo(Math.min(a[1], b[1]), 6);
      expect(bar.shape.height).toBeCloseTo(Math.abs(a[1] - b[1]), 6);
    }
    expect(svg).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
});

it.each([
  { rotation: 0, autoRotate: true, expected: 0 },
  { rotation: 45, autoRotate: true, expected: -45 },
  { rotation: undefined, autoRotate: false, expected: 0 },
])("applies configured rotation controls in native FMP rendering: %j", (control) => {
  const input = fmpInput();
  Object.assign(input.appearance.application.axes.category.labels, control);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 620,
    height: 285,
  });
  try {
    chart.setOption(projected(input).options);
    expect(
      (chart.getOption().xAxis as { axisLabel: { rotate: number } }[])[0].axisLabel
        .rotate,
    ).toBe(control.expected);
    const svg = chart.renderToSVGString();
    expect(svg).toContain(">Cost of</text>");
    expect(svg).toContain(">revenue</text>");
    if (control.rotation) expect(svg).toMatch(/matrix\(0\.707,0\.707,-0\.707,0\.707/);
    expect(bars(chart)).toHaveLength(5);
  } finally {
    chart.dispose();
  }
});

it("applies category label policy to the native vertical axis in horizontal Waterfall", () => {
  const input = fmpInput();
  input.appearance.series.direction = "horizontal";
  input.appearance.application.axes.category.fields.position = "left";
  input.appearance.application.axes.number.fields.position = "bottom";
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 620,
    height: 285,
  });
  try {
    chart.setOption(projected(input).options);
    const options = chart.getOption();
    expect(
      (options.yAxis as { axisLabel: { rotate: number } }[])[0].axisLabel.rotate,
    ).toBe(0);
    const svg = chart.renderToSVGString();
    for (const category of categories) expect(svg).toContain(`>${category}</text>`);
    const rects = bars(chart);
    expect(rects).toHaveLength(5);
    expect(rects.map((bar) => bar.shape.y)).toEqual(
      rects.map((bar) => bar.shape.y).sort((a, b) => a - b),
    );
    expect(svg).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
});

it("uses numeric label and title footprint before deciding how category labels wrap", () => {
  const input = fmpInput();
  const initial = projected(input).options.xAxis as {
    axisLabel: { formatter: (value: string) => string };
  }[];
  expect(initial[0].axisLabel.formatter("3")).toBe(expected[3]);
  input.context.display.numericAxis = (value) => `US dollars ${value} reported`;
  input.appearance.application.axes.number.title.enabled = true;
  input.appearance.application.axes.number.title.text = "Reported movement, USD";
  const constrained = projected(input).options.xAxis as typeof initial;
  expect(constrained[0].axisLabel.formatter("3").split("\n").length).toBeGreaterThan(2);
});

it("replans cropped main labels while the miniature retains every source label and full prefix", () => {
  const input = fmpInput();
  input.miniChartEnabled = true;
  const result = projected(input);
  const options = result.projectNavigationWindow!(result.options, {
    dataZoom: [{ id: "openbb-navigator", start: 40, end: 100 }],
  });
  const axes = options.xAxis as {
    axisLabel: { formatter: (value: string) => string };
  }[];
  expect(axes[0].axisLabel.formatter("0")).toBe("Operating expenses");
  expect(axes[1].axisLabel.formatter("1")).toBe(expected[1]);
  const series = options.series as { data: { value: number[] }[] }[];
  expect(series[0].data.map((row) => row.value.slice(1, 3))).toEqual([
    [54770000000, 35695000000],
    [35695000000, 36267000000],
    [36267000000, 29789000000],
  ]);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 620,
    height: 285,
  });
  try {
    chart.setOption(options);
    expect(bars(chart)).toHaveLength(8);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
});

function appearanceInput(): WaterfallAppearanceInput {
  const fixture = sessionFixture();
  return {
    baseline: fixture.local.baseline,
    generated: {},
    seriesIds: ["revenue"],
    precision: 2,
    theme: fixture.inputs.theme,
    axisRuntime: fixture.local.axes,
    paint: {
      positive: { fill: "#145da0", stroke: "#145da0" },
      negative: { fill: "#b33b32", stroke: "#b33b32" },
      total: { fill: "#888888", stroke: "#888888" },
      connectorStroke: "#919191",
    },
  };
}

it("resolves source wrapping defaults separately for categorical and numeric native axes", () => {
  const result = resolveWaterfallAppearance(appearanceInput());
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") return;
  expect(result.value.application.axes.category.labels).toMatchObject({
    enabled: true,
    avoidCollisions: true,
    wrapping: "on-space",
    autoRotate: true,
  });
  expect(result.value.application.axes.number.labels.wrapping).toBe("never");
});

it("renders saved manual zero and never-wrap options without replacing either control", () => {
  const result = resolveWaterfallAppearance({
    ...appearanceInput(),
    generated: {
      waterfall: {
        axes: {
          category: {
            bottom: { label: { rotation: 0, autoRotate: true, wrapping: "never" } },
          },
        },
      },
    },
  });
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") return;
  expect(result.value.application.axes.category.labels).toMatchObject({
    rotation: 0,
    autoRotate: true,
    wrapping: "never",
  });
  const options = projected({ ...fmpInput(), appearance: result.value }).options;
  const axis = (
    options.xAxis as {
      axisLabel: { rotate: number; formatter: (value: string) => string };
    }[]
  )[0];
  expect(axis.axisLabel.rotate).toBe(0);
  expect(categories.map((_, index) => axis.axisLabel.formatter(String(index)))).toEqual(
    categories,
  );
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 620,
    height: 285,
  });
  try {
    chart.setOption(options);
    expect(
      (chart.getOption().xAxis as { axisLabel: { rotate: number } }[])[0].axisLabel
        .rotate,
    ).toBe(0);
    expect(bars(chart)).toHaveLength(5);
    expect(chart.renderToSVGString()).toContain(">Revenue</text>");
  } finally {
    chart.dispose();
  }
});

it("retains saved position policy and higher-priority actual native option bags after direction changes", () => {
  const input = appearanceInput();
  const result = resolveWaterfallAppearance({
    ...input,
    generated: {
      common: { axes: { category: { label: { minSpacing: 19, wrapping: "never" } } } },
      waterfall: {
        series: { direction: "horizontal" },
        axes: {
          category: {
            left: {
              label: {
                minSpacing: 5,
                wrapping: "hyphenate",
                autoRotate: false,
                rotation: 30,
              },
            },
          },
        },
      },
    },
    axisRuntime: {
      ...input.axisRuntime,
      axes: input.axisRuntime.axes.map((axis) =>
        axis.id === "category"
          ? {
              ...axis,
              options: {
                future: { keep: true },
                label: {
                  enabled: false,
                  avoidCollisions: false,
                  wrapping: "always",
                  minSpacing: 7,
                },
              },
            }
          : axis,
      ),
    },
  });
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") return;
  expect(result.value.application.axes.category.fields.position).toBe("left");
  expect(result.value.application.axes.category.labels).toMatchObject({
    enabled: false,
    avoidCollisions: false,
    wrapping: "always",
    minSpacing: 7,
    autoRotate: false,
    rotation: 30,
  });
  expect(result.value.axisRuntime.axes[0].options.future).toEqual({ keep: true });
});

it.each([
  "number",
  "time",
] as const)("reads %s category policy from its actual saved axis namespace", (type) => {
  const input = appearanceInput();
  const result = resolveWaterfallAppearance({
    ...input,
    generated: {
      waterfall: {
        axes: { [type]: { bottom: { label: { wrapping: "never", minSpacing: 13 } } } },
      },
    },
    axisRuntime: {
      categoryAxisType: type,
      axes: input.axisRuntime.axes.map((axis) =>
        axis.id === "category" ? { ...axis, type } : axis,
      ),
    },
  });
  expect(result.status).toBe("resolved");
  if (result.status !== "resolved") return;
  expect(result.value.application.axes.category.fields.type).toBe(type);
  expect(result.value.application.axes.category.labels).toMatchObject({
    wrapping: "never",
    minSpacing: 13,
  });
});

it.each([
  0, 45, -30,
])("preserves explicit manual rotation %s even when Auto Rotate is true", (rotation) => {
  const plan = planWaterfallCategoryLabels(labels(fixture(), { rotation }));
  expect(plan.labels).toEqual(expected);
  expect(plan.rotation).toBe(rotation === 0 ? 0 : -rotation);
});

it("uses automatic rotation only when wrapped labels still collide", () => {
  const input = {
    ...fixture(["UnbreakableLongLabel", "AnotherUnbreakableLabel"]),
    plotSpan: 80,
  };
  expect(planWaterfallCategoryLabels(input).rotation).toBe(25);
  expect(
    planWaterfallCategoryLabels(labels(input, { autoRotate: false })).rotation,
  ).toBe(0);
  expect(planWaterfallCategoryLabels(labels(input, { rotation: 0 })).rotation).toBe(0);
});

it("retains a saved never-wrap override without disabling Auto Rotate", () => {
  const plan = planWaterfallCategoryLabels(labels(fixture(), { wrapping: "never" }));
  expect(plan.labels).toEqual(categories);
  expect(plan.rotation).toBe(25);
});

it.each([
  "always",
  "hyphenate",
] as const)("honors saved %s wrapping for an unbroken category", (wrapping) => {
  const input = {
    ...fixture(["UnbreakableLongLabel", "AnotherUnbreakableLabel"]),
    plotSpan: 100,
  };
  const plan = planWaterfallCategoryLabels(labels(input, { wrapping }));
  expect(plan.labels.every((label) => label.includes("\n"))).toBe(true);
  expect(plan.labels.join("")).toContain(wrapping === "hyphenate" ? "-\n" : "\n");
});

it.each([
  { enabled: false },
  { avoidCollisions: false },
])("preserves disabled source label behavior %j", (changes) => {
  expect(planWaterfallCategoryLabels(labels(fixture(), changes))).toEqual({
    labels: categories,
    rotation: 0,
  });
});

it("uses the vertical category-axis band and cross-size limit for horizontal Waterfall", () => {
  const input = fixture();
  const plan = planWaterfallCategoryLabels({
    ...input,
    direction: "horizontal",
    plotSpan: 300,
    crossSize: 250,
  });
  expect(plan).toEqual({
    labels: [expected[0], categories[1], ...expected.slice(2)],
    rotation: 0,
  });
});

it.each([
  "number",
  "time",
])("does not apply categorical wrapping/automatic rotation to %s coordinates", (type) => {
  const input = fixture();
  const plan = planWaterfallCategoryLabels({
    ...input,
    axis: { ...input.axis, fields: { ...input.axis.fields, type } },
  });
  expect(plan).toEqual({ labels: categories, rotation: 0 });
});

it("uses supplied display formatting and keeps repeated source rows separate", () => {
  const input = fixture(["same", "same"]);
  expect(
    planWaterfallCategoryLabels({
      ...input,
      display: { category: (value) => `FY ${value}` },
    }).labels,
  ).toEqual(["FY same", "FY same"]);
});

it("admits empty and zero-sized scenes without inventing category labels", () => {
  expect(
    planWaterfallCategoryLabels({ ...fixture([]), plotSpan: 0, crossSize: 0 }),
  ).toEqual({ labels: [], rotation: 0 });
});

it.each([
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -1,
])("rejects an invalid plot span %s", (plotSpan) => {
  expect(() => planWaterfallCategoryLabels({ ...fixture(), plotSpan })).toThrow(
    "finite nonnegative plot sizes",
  );
});
