import { init } from "echarts";
import { expect, it } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput as snapshot } from "./snapshot.fixtures";

function drawn(style = applicationStyle(), width = 800, input = snapshot) {
  const result = translateCartesian(input, "line", style, {
    ...mappingContext(),
    viewport: { width, height: 500 },
  });
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width,
    height: 500,
  });
  try {
    chart.setOption({ ...result.options, animation: false });
    return new DOMParser().parseFromString(chart.renderToSVGString(), "image/svg+xml");
  } finally {
    chart.dispose();
  }
}
it("draws one original category tick for a single line observation", () => {
  const svg = drawn(applicationStyle(), 800, { ...snapshot, rows: [snapshot.rows[0]] });
  const labels = Array.from(svg.querySelectorAll("text")).filter((node) =>
    node.textContent?.startsWith("period:"),
  );
  expect(labels.map((node) => node.textContent)).toEqual(["period:2026-03-31"]);
  expect(svg.documentElement.outerHTML).not.toMatch(/NaN|Infinity/);
});
it("spaces daily category ticks without dropping line observations", () => {
  const input = {
    ...snapshot,
    rows: Array.from({ length: 76 }, (_, index) => ({
      id: `daily-${index}`,
      category: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      values: { revenue: index + 100, costs: -index },
    })),
    selectedRange: { ...snapshot.selectedRange, endRow: 75 },
  };
  const style = applicationStyle();
  const result = translateCartesian(input, "line", style, mappingContext());
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  const series = result.options.series as { data: unknown[] }[];
  expect(series.map((item) => item.data.length)).toEqual([76, 76]);
  const labels = Array.from(drawn(style, 800, input).querySelectorAll("text"))
    .map((node) => node.textContent ?? "")
    .filter((label) => label.startsWith("period:"));
  expect(labels.length).toBeGreaterThan(1);
  expect(labels.length).toBeLessThanOrEqual(8);
  expect(labels.every((label) => input.rows.some(
    (row) => label === `period:${row.category}`,
  ))).toBe(true);
});
it("retains all three category ticks for a short line series", () => {
  const labels = Array.from(drawn().querySelectorAll("text"))
    .map((node) => node.textContent)
    .filter((label) => label?.startsWith("period:"));
  expect(labels).toEqual(snapshot.rows.map((row) => `period:${row.category}`));
});
function text(svg: Document, value: string): Element {
  const node = Array.from(svg.querySelectorAll("text")).find(
    (element) => element.textContent === value,
  );
  if (!node) throw new Error(`Missing drawn text ${value}`);
  return node;
}
function origin(node: Element): [number, number] {
  const numbers = (node.getAttribute("transform") ?? "")
    .match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g)
    ?.map(Number);
  if (!numbers || numbers.length < 2) throw new Error("Missing SVG text transform");
  return [numbers[numbers.length - 2], numbers[numbers.length - 1]];
}
it.each([
  "bottom",
  "top",
])("contains axis captions and draws the %s baseline next to its labels", (position) => {
  const style = applicationStyle();
  style.application.axes.category.fields.position = position;
  const svg = drawn(style);
  const [captionX] = origin(text(svg, "Amount"));
  expect(captionX).toBeGreaterThanOrEqual(style.application.axes.number.title.size / 2);
  expect(captionX).toBeLessThan(800);
  const categoryY = origin(text(svg, "period:2026-03-31"))[1];
  const lines = Array.from(svg.querySelectorAll('path[stroke="#123456"]')).flatMap(
    (line) => {
      const values = line
        .getAttribute("d")
        ?.match(/-?\d+(?:\.\d+)?/g)
        ?.map(Number);
      return values?.length === 4 &&
        values[1] === values[3] &&
        Math.abs(values[2] - values[0]) > 100
        ? [values[1]]
        : [];
    },
  );
  expect(lines).toHaveLength(1);
  expect(
    position === "bottom" ? categoryY - lines[0] : lines[0] - categoryY,
  ).toBeGreaterThan(0);
  expect(Math.abs(categoryY - lines[0])).toBeLessThan(40);
});
it("changes drawn horizontal and vertical legend item gaps independently", () => {
  for (const [position, field, dimension] of [
    ["top", "horizontalSpacing", 0],
    ["left", "verticalSpacing", 1],
  ] as const) {
    const style = applicationStyle();
    style.application.legend.position = position;
    const before = drawn(style);
    const beforeFirst = origin(text(before, "legend:Amount"));
    const beforeItems = Array.from(before.querySelectorAll("text")).filter(
      (node) => node.textContent === "legend:Amount",
    );
    const beforeGap = origin(beforeItems[1])[dimension] - beforeFirst[dimension];
    style.application.legend[field] += 20;
    const after = drawn(style);
    const afterItems = Array.from(after.querySelectorAll("text")).filter(
      (node) => node.textContent === "legend:Amount",
    );
    const afterGap =
      origin(afterItems[1])[dimension] - origin(afterItems[0])[dimension];
    expect(afterGap - beforeGap).toBeCloseTo(20, 3);
  }
});
it("retains numerical series labels when line markers are disabled", () => {
  const style = applicationStyle();
  style.application.legend.enabled = false;
  const circles = (svg: Document) =>
    Array.from(svg.querySelectorAll("path,circle,ellipse")).filter((node) => {
      if (node.localName === "path" && !node.getAttribute("d")?.includes("A"))
        return false;
      const matrix = node
        .getAttribute("transform")
        ?.match(/-?\d+(?:\.\d+)?/g)
        ?.map(Number);
      return (
        !matrix ||
        matrix.length !== 6 ||
        matrix[0] * matrix[3] - matrix[1] * matrix[2] !== 0
      );
    }).length;
  const visible = circles(drawn(style));
  style.application.series.markers.enabled = false;
  const svg = drawn(style);
  expect(visible - circles(svg)).toBe(4);
  for (const value of ["label:123.456789", "label:0", "label:-5.25", "label:-40.125"])
    expect(text(svg, value)).toBeTruthy();
});
it("wraps native legend items when the measured host narrows", () => {
  const style = applicationStyle();
  const rows = (svg: Document) =>
    Array.from(svg.querySelectorAll("text"))
      .filter((node) => node.textContent === "legend:Amount")
      .map((node) => origin(node)[1]);
  const wide = rows(drawn(style));
  const narrow = rows(drawn(style, 220));
  expect(wide).toHaveLength(2);
  expect(wide[0]).toBe(wide[1]);
  expect(narrow[1]).toBeGreaterThan(narrow[0]);
});
