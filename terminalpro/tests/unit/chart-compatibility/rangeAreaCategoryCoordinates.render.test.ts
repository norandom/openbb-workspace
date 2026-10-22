import * as echarts from "echarts";
import { expect, it } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import { areaInput } from "./rangeArea.fixtures";

function continuousInput(kind: "number" | "time" = "number") {
  const input = areaInput();
  const start = kind === "time" ? Date.UTC(2024, 0, 1) : 0;
  const unit = kind === "time" ? 86400000 : 1;
  input.style.categoryAxis.fields.type = kind;
  input.style.categoryCoordinates = {
    kind,
    fullExtent: [start, start + 100 * unit],
    ticks: [
      { coordinate: start, label: "calendar-start" },
      { coordinate: start + 31 * unit, label: "calendar-month" },
      { coordinate: start + 100 * unit, label: "calendar-end" },
    ],
  };
  input.snapshot.rows = [0, 100, 1].flatMap((n, i) => [
    {
      id: `low-${i}`,
      category: start + n * unit,
      values: { amount: 2 + i, other: 4 + i },
    },
    {
      id: `high-${i}`,
      category: start + n * unit,
      values: { amount: 8 + i, other: 10 + i },
    },
  ]);
  return input;
}
function withChart(run: (chart: echarts.ECharts) => void) {
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    run(chart);
  } finally {
    chart.dispose();
  }
}
function render(chart: echarts.ECharts, input: ReturnType<typeof continuousInput>) {
  const result = translateRangeArea(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  chart.setOption(result.options, true);
  const svg = chart.renderToSVGString();
  expect(svg).not.toMatch(/NaN|Infinity/);
  return { result, dom: new DOMParser().parseFromString(svg, "image/svg+xml") };
}
function moves(path: string) {
  return [...path.matchAll(/[ML](-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

for (const kind of ["number", "time"] as const) {
  it(`renders actual irregular ${kind} geometry, supplied ticks and encounter-order paths`, () => {
    withChart((chart) => {
      const input = continuousInput(kind);
      const { dom } = render(chart, input);
      const path = dom.querySelector('path[stroke="#ae1234"]')?.getAttribute("d") ?? "";
      const actual = moves(path).slice(0, 3);
      const expected = input.snapshot.rows
        .filter((_, i) => i % 2 === 0)
        .map((row, i) => chart.convertToPixel({ gridIndex: 0 }, [row.category, i + 8]));
      expect(actual).toHaveLength(3);
      actual.forEach((point, i) => {
        expect(point[0]).toBeCloseTo(expected[i][0], 1);
        expect(point[1]).toBeCloseTo(expected[i][1], 1);
      });
      expect((actual[2][0] - actual[0][0]) / (actual[1][0] - actual[0][0])).toBeCloseTo(
        0.01,
        3,
      );
      const text = [...dom.querySelectorAll("text")].map((el) => el.textContent);
      expect(text).toEqual(
        expect.arrayContaining(["calendar-start", "calendar-month", "calendar-end"]),
      );
      const ticks = input.style.categoryCoordinates!.ticks;
      const monthText = [...dom.querySelectorAll("text")].find(
        (el) => el.textContent === "calendar-month",
      );
      const tickX = chart.convertToPixel(
        { xAxisIndex: 0 },
        ticks[1].coordinate,
      ) as number;
      expect(
        Number(
          monthText?.getAttribute("transform")?.match(/translate\(([-\d.]+)/)?.[1],
        ),
      ).toBeCloseTo(tickX, 1);
    });
  });
}

it("skips invalid x before run partition while valid missing y obeys connectMissingData", () => {
  withChart((chart) => {
    const input = continuousInput();
    input.snapshot.rows = [
      { id: "a", category: 0, values: { amount: 2, other: 4 } },
      { id: "bad", category: "50", values: { amount: null, other: null } },
      { id: "b", category: 100, values: { amount: 8, other: 10 } },
    ];
    expect(
      render(chart, input).dom.querySelectorAll('path[stroke="#ae1234"]'),
    ).toHaveLength(2);
    input.snapshot.rows[1].category = 50;
    expect(
      render(chart, input).dom.querySelectorAll('path[stroke="#ae1234"]'),
    ).toHaveLength(0);
    for (const style of Object.values(input.style.fields))
      style.connectMissingData = true;
    expect(
      render(chart, input).dom.querySelectorAll('path[stroke="#ae1234"]'),
    ).toHaveLength(2);
  });
});

it("uses nonnegative spatial target cells and explicit metadata after invalid-coordinate omission", () => {
  withChart((chart) => {
    const input = continuousInput();
    input.style.tooltip.mode = "single";
    for (const style of Object.values(input.style.fields)) style.marker.enabled = false;
    input.snapshot.rows.splice(2, 0, {
      id: "bad",
      category: "40",
      values: { amount: 3, other: 4 },
    });
    const { result } = render(chart, input);
    const targets = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((e) => e.type === "rect" && !e.silent);
    expect(targets).toHaveLength(6);
    const left = chart.convertToPixel({ xAxisIndex: 0 }, 0) as number;
    const right = chart.convertToPixel({ xAxisIndex: 0 }, 100) as number;
    const cells = [
      [0.5, 50.5],
      [50.5, 100],
      [0, 0.5],
    ];
    for (const [i, target] of targets.entries()) {
      const box = target.getBoundingRect();
      expect(box.width).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeGreaterThanOrEqual(0);
      expect(box.x).toBeGreaterThanOrEqual(left);
      expect(box.x + box.width).toBeLessThanOrEqual(right + 1e-8);
      const [a, b] = cells[i % 3].map(
        (value) => chart.convertToPixel({ xAxisIndex: 0 }, value) as number,
      );
      expect(box.x).toBeCloseTo(a);
      expect(box.width).toBeCloseTo(b - a);
    }
    const seen: unknown[] = [];
    chart.on("click", (event) => {
      seen.push(event.data);
    });
    for (const target of targets) {
      const box = target.getBoundingRect();
      chart.getZr().trigger("click", {
        target,
        topTarget: target,
        offsetX: box.x + box.width / 2,
        offsetY: box.y + box.height / 2,
        event: {},
      });
    }
    expect(seen).toMatchObject([
      { metadata: { fieldId: "amount", groupSlot: 3 } },
      { metadata: { fieldId: "amount", groupSlot: 2 } },
      { metadata: { fieldId: "amount", groupSlot: 0 } },
      { metadata: { fieldId: "other", groupSlot: 3 } },
      { metadata: { fieldId: "other", groupSlot: 2 } },
      { metadata: { fieldId: "other", groupSlot: 0 } },
    ]);
    const formatter = (result.options.tooltip as { formatter: (p: unknown) => string })
      .formatter;
    expect(formatter({ data: seen[0] })).toContain("period:1");
    expect(formatter({ data: seen[1] })).toContain("period:100");
  });
});

it("preserves finite smooth backtracking geometry and suppresses hidden peers", () => {
  withChart((chart) => {
    const input = continuousInput();
    for (const style of Object.values(input.style.fields))
      style.interpolation = { type: "smooth", tension: 1 };
    input.context.legendSelection = { other: false };
    const { dom } = render(chart, input);
    const outline =
      dom.querySelector('path[stroke="#ae1234"]')?.getAttribute("d") ?? "";
    expect(outline.match(/C/g)).toHaveLength(4);
    const circles = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((e) => e.type === "circle");
    expect(circles).toHaveLength(6);
    const xs = circles
      .filter((_, i) => i % 2 === 0)
      .map((e) => {
        const box = e.getBoundingRect();
        return box.x + box.width / 2;
      });
    expect(xs[1]).toBeGreaterThan(xs[2]);
    expect((xs[2] - xs[0]) / (xs[1] - xs[0])).toBeCloseTo(0.01);
    expect(
      chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((e) => e.type === "rect" && !e.silent),
    ).toHaveLength(3);
  });
});

it("clips partial windows and supplied bounds; singleton and empty domains stay finite", () => {
  withChart((chart) => {
    const input = continuousInput();
    input.style.categoryCoordinates = {
      kind: "number",
      fullExtent: [0, 100],
      visibleRange: [0, 0.5],
      ticks: [
        { coordinate: 0, label: "left" },
        { coordinate: 50, label: "right" },
      ],
    };
    render(chart, input);
    const hits = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((e) => e.type === "rect" && !e.silent);
    expect(hits).toHaveLength(4);
    const left = chart.convertToPixel({ xAxisIndex: 0 }, 0) as number;
    const right = chart.convertToPixel({ xAxisIndex: 0 }, 50) as number;
    for (const target of hits) {
      const box = target.getBoundingRect();
      expect(box.x).toBeGreaterThanOrEqual(left);
      expect(box.x + box.width).toBeLessThanOrEqual(right + 1e-8);
    }
    input.style.categoryCoordinates = {
      kind: "number",
      fullExtent: [1, 1],
      ticks: [{ coordinate: 1, label: "singleton" }],
    };
    expect(render(chart, input).dom.documentElement.textContent).toContain("singleton");
    expect(
      chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((e) => e.type === "rect" && !e.silent),
    ).toHaveLength(2);
    input.snapshot.rows = [];
    input.style.categoryCoordinates = { kind: "number", fullExtent: [], ticks: [] };
    render(chart, input);
    expect(
      chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((e) => e.type === "rect" && !e.silent),
    ).toHaveLength(0);
  });
});
