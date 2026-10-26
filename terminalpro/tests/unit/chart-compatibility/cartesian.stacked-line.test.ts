import { init } from "echarts";
import { expect, it } from "vitest";
import { applicationAxes } from "../../../src/components/General/Table/Chart/echarts/cartesianAxes";
import { projectLineStack } from "../../../src/components/General/Table/Chart/echarts/cartesianLineStack";
import { LineStackOverflowError } from "../../../src/components/General/Table/Chart/echarts/cartesianLineTypes";
import { cartesianSeries } from "../../../src/components/General/Table/Chart/echarts/cartesianSeries";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";

function input(
  vectors: (number | null)[][],
  categories: (string | number)[] = vectors.map(() => "A"),
) {
  const columns = vectors[0].map((_, i) => ({
    id: `s${i}`,
    label: "Amount",
    role: "number" as const,
    unit: "USD",
    scale: 1,
  }));
  const snapshot = {
    ...validSnapshotInput,
    columns: [validSnapshotInput.columns[0], ...columns],
    selectedColumnIds: ["period", ...columns.map((c) => c.id)],
    rows: vectors.map((values, i) => ({
      id: `r${i}`,
      category: categories[i],
      values: Object.fromEntries(values.map((v, j) => [`s${j}`, v])),
    })),
  };
  return { snapshot, columns, categoryAxisType: "category" as const };
}
const values = (result: ReturnType<typeof projectLineStack>) =>
  result.drawn.rows.map((row) => Object.values(row.values));
it.each([
  [
    [60, -80, 20],
    [60, -20, 0],
    [100, -100 / 3, 0],
  ],
  [
    [60, -20, 60],
    [60, 40, 100],
    [60, 40, 100],
  ],
  [
    [-20, -30],
    [-20, -50],
    [-40, -100],
  ],
])("uses signed prefixes and maximum cumulative excursion: %j", (raw, stacked, normalized) => {
  const source = input([raw]);
  expect(values(projectLineStack({ ...source, family: "stackedLine" }))).toEqual([
    stacked,
  ]);
  values(projectLineStack({ ...source, family: "normalizedLine" }))[0].forEach((v, i) =>
    expect(v).toBeCloseTo(normalized[i]),
  );
  expect(source.snapshot.rows[0].values).toEqual(
    Object.fromEntries(raw.map((v, i) => [`s${i}`, v])),
  );
});
it("recomputes order, stable-ID visibility and nonzero anchored extents", () => {
  const source = input([[60, -80, 20]]);
  const hidden = projectLineStack({
    ...source,
    family: "stackedLine",
    legendSelection: { s1: false },
  });
  expect(values(hidden)).toEqual([[60, null, 80]]);
  expect(hidden.extent).toEqual({ min: 60, max: 80 });
  const reordered = values(
    projectLineStack({
      ...source,
      columns: [...source.columns].reverse(),
      family: "normalizedLine",
    }),
  )[0];
  [0, -100, 100 / 3].forEach((v, i) => expect(reordered[i]).toBeCloseTo(v));
});
it("retains missing admission and real zero, with no normalized zero-denominator points", () => {
  const source = input([
    [null, 20, 0],
    [0, 0, null],
    [Number.NaN, 2, 0],
  ]);
  expect(values(projectLineStack({ ...source, family: "normalizedLine" }))).toEqual([
    [null, 100, 100],
    [null, null, null],
    [null, 100, 100],
  ]);
  const empty = projectLineStack({ ...input([[0, 0]]), family: "normalizedLine" });
  expect(empty.empty).toBe(true);
  expect(Object.values(empty.extent).every(Number.isFinite)).toBe(true);
});
it("groups continuous coordinates series first while duplicate ordinal labels remain independent", () => {
  const source = input(
    [
      [10, 1],
      [20, 2],
    ],
    [1, 1],
  );
  expect(values(projectLineStack({ ...source, family: "stackedLine" }))).toEqual([
    [10, 11],
    [20, 22],
  ]);
  expect(
    values(
      projectLineStack({
        ...source,
        family: "stackedLine",
        categoryAxisType: "number",
      }),
    ),
  ).toEqual([
    [10, 31],
    [30, 33],
  ]);
  const times = input(
    [
      [10, 1],
      [20, 2],
    ],
    ["2025-01-01", "2025-01-01T00:00:00Z"],
  );
  expect(
    values(
      projectLineStack({ ...times, family: "stackedLine", categoryAxisType: "time" }),
    ),
  ).toEqual([
    [10, 31],
    [30, 33],
  ]);
});
it("normalizes finite overflow safely and rejects unrepresentable amount prefixes", () => {
  const source = input([[Number.MAX_VALUE, Number.MAX_VALUE]]);
  expect(values(projectLineStack({ ...source, family: "normalizedLine" }))).toEqual([
    [50, 100],
  ]);
  expect(() => projectLineStack({ ...source, family: "stackedLine" })).toThrow(
    LineStackOverflowError,
  );
});
it("reconciles retained AAPL FY2025 additive components to independent revenue constants", () => {
  // Retained FMP raw hash 390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b;
  // independently reconciled in artifacts/reviewed/chart-stacked-line/doc-fixture-review.md.
  const source = input([
    [66025000000, 58275000000],
    [50492000000, 44867000000],
    [50318000000, 43718000000],
    [54125000000, 48341000000],
  ]);
  expect(
    values(projectLineStack({ ...source, family: "stackedLine" })).map((v) => v[1]),
  ).toEqual([124300000000, 95359000000, 94036000000, 102466000000]);
  expect(
    values(projectLineStack({ ...source, family: "normalizedLine" })).map((v) => v[1]),
  ).toEqual([100, 100, 100, 100]);
});
it.each([
  "stackedLine",
  "normalizedLine",
] as const)("renders %s as unfilled lines with raw labels", (family) => {
  const source = input([[60, -80, 20]]);
  const style = applicationStyle();
  const display = mappingContext().display;
  const drawn = projectLineStack({ ...source, family }).drawn;
  const series = cartesianSeries(
    source.snapshot,
    source.columns,
    family,
    style,
    display,
    drawn,
  );
  for (const item of series) {
    expect(item.type).toBe("line");
    expect(item).not.toHaveProperty("stack");
    expect(item).not.toHaveProperty("areaStyle");
  }
  expect((series[1].data as number[][])[0][1]).toBeCloseTo(
    family === "stackedLine" ? -20 : -100 / 3,
  );
});

it("preserves raw labels and suppresses null projected hits", () => {
  const source = input([
    [null, 20, 0],
    [0, 0, 0],
  ]);
  const style = applicationStyle();
  const drawn = projectLineStack({ ...source, family: "normalizedLine" }).drawn;
  const series = cartesianSeries(
    source.snapshot,
    source.columns,
    "normalizedLine",
    style,
    mappingContext().display,
    drawn,
  );
  const label = (index: number, row: number) =>
    (
      series[index].label as { formatter: (p: { dataIndex: number }) => string }
    ).formatter({ dataIndex: row });
  expect(label(0, 0)).toBe("");
  expect(label(1, 0)).toBe("label:20");
  expect(label(2, 0)).toBe("label:0");
  expect(label(2, 1)).toBe("");
  const hidden = projectLineStack({
    ...source,
    family: "normalizedLine",
    legendSelection: { s1: false },
  }).drawn;
  const hiddenSeries = cartesianSeries(
    source.snapshot,
    source.columns,
    "normalizedLine",
    style,
    mappingContext().display,
    hidden,
  );
  const hiddenLabel = hiddenSeries[1].label as {
    formatter: (p: { dataIndex: number }) => string;
  };
  expect(hiddenLabel.formatter({ dataIndex: 0 })).toBe("");
  expect(series[1]).toHaveProperty("connectNulls", true);
  style.application.series.connectMissingData = false;
  expect(
    cartesianSeries(
      source.snapshot,
      source.columns,
      "normalizedLine",
      style,
      mappingContext().display,
      drawn,
    )[1],
  ).toHaveProperty("connectNulls", false);
});
it("distinguishes a raw epoch from a transformed Date time group", () => {
  const source = input(
    [
      [10, 1],
      [20, 2],
    ],
    ["2025-01-01", Date.UTC(2025, 0, 1)],
  );
  expect(
    values(
      projectLineStack({ ...source, family: "stackedLine", categoryAxisType: "time" }),
    ),
  ).toEqual([
    [10, 11],
    [20, 22],
  ]);
});
it("returns finite empty geometry without adding raw observations", () => {
  const source = input([[null, null]]);
  const before = structuredClone(source.snapshot);
  const result = projectLineStack({ ...source, family: "stackedLine" });
  expect(result.empty).toBe(true);
  expect(values(result)).toEqual([[null, null]]);
  expect(source.snapshot).toEqual(before);
  expect(
    projectLineStack({
      ...source,
      snapshot: { ...source.snapshot, rows: [] },
      family: "normalizedLine",
    }).empty,
  ).toBe(true);
});
it.each([
  "stackedLine",
  "normalizedLine",
] as const)("draws finite SVG geometry for %s with missing and zero rows", (family) => {
  const source = input([
    [60, -80, 20],
    [null, 20, 0],
    [0, 0, 0],
  ]);
  const style = applicationStyle();
  const context = mappingContext();
  const projection = projectLineStack({ ...source, family });
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({
      animation: false,
      ...applicationAxes(
        style.application.axes.category,
        style.application.axes.number,
        source.snapshot,
        context.display,
        context.viewport!,
        family,
        projection.extent,
      ),
      series: cartesianSeries(
        source.snapshot,
        source.columns,
        family,
        style,
        context.display,
        projection.drawn,
      ),
    });
    const svg = chart.renderToSVGString();
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).toContain("label:20");
    expect(svg).not.toContain("label:null");
  } finally {
    chart.dispose();
  }
});
it("keeps amount axes finite when the admitted endpoint span overflows", () => {
  const source = input([[Number.MAX_VALUE], [-Number.MAX_VALUE]]);
  const projection = projectLineStack({ ...source, family: "stackedLine" });
  const style = applicationStyle();
  const context = mappingContext();
  const axes = applicationAxes(
    style.application.axes.category,
    style.application.axes.number,
    source.snapshot,
    context.display,
    context.viewport!,
    "stackedLine",
    projection.extent,
  );
  expect(axes.yAxis.min).toBe(-Number.MAX_VALUE);
  expect(axes.yAxis.max).toBe(Number.MAX_VALUE);
  expect(axes.yAxis.interval).toBeUndefined();
});

it.each([
  "stackedLine",
  "normalizedLine",
] as const)("paints %s missing-data topology with the saved connection override", (family) => {
  const source = input(
    [
      [10, 5],
      [null, 5],
      [20, 5],
    ],
    ["A", "B", "C"],
  );
  const style = applicationStyle();
  const context = mappingContext();
  const projection = projectLineStack({ ...source, family });
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    for (const connect of [true, false]) {
      style.application.series.connectMissingData = connect;
      chart.setOption({
        animation: false,
        ...applicationAxes(
          style.application.axes.category,
          style.application.axes.number,
          source.snapshot,
          context.display,
          context.viewport!,
          family,
          projection.extent,
        ),
        series: cartesianSeries(
          source.snapshot,
          source.columns,
          family,
          style,
          context.display,
          projection.drawn,
        ),
      });
      const svg = chart.renderToSVGString();
      expect(svg).not.toMatch(/NaN|Infinity/);
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      const stroke = document.querySelectorAll(
        'path[fill="none"][stroke="#123456"][stroke-width="3"]',
      );
      expect(stroke).toHaveLength(1);
      const path = stroke[0].getAttribute("d")!;
      // Public SVG commands distinguish an actual bridge from two isolated moves.
      expect(path.match(/[ML]/g)).toEqual(connect ? ["M", "L"] : ["M", "M"]);
      const coordinates = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
      expect(coordinates).toHaveLength(4);
      const endpoints = [
        [0, family === "stackedLine" ? 10 : (100 * 10) / 15],
        [2, family === "stackedLine" ? 20 : 80],
      ];
      endpoints.forEach((endpoint, index) => {
        const pixel = chart.convertToPixel({ gridIndex: 0 }, endpoint) as number[];
        // ECharts serializes SVG path coordinates to one decimal place.
        expect(coordinates[index * 2]).toBe(Number(pixel[0].toFixed(1)));
        expect(coordinates[index * 2 + 1]).toBe(Number(pixel[1].toFixed(1)));
      });
      const markers = document.querySelectorAll(
        'path[ecmeta_series_index="0"][ecmeta_data_index]',
      );
      expect(
        [...markers].map((marker) => marker.getAttribute("ecmeta_data_index")),
      ).toEqual(["0", "2"]);
      const labels = [...document.querySelectorAll("text")]
        .map((text) => text.textContent)
        .filter((text) => text?.startsWith("label:"));
      expect(labels.filter((text) => text === "label:10")).toHaveLength(1);
      expect(labels.filter((text) => text === "label:20")).toHaveLength(1);
      expect(labels).toHaveLength(5);
      expect(svg).not.toContain("label:null");
    }
  } finally {
    chart.dispose();
  }
});
