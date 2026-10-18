import { init } from "echarts";
import { expect, it } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput as snapshot } from "./snapshot.fixtures";

it("draws alternating grid strokes and dash arrays through native ticks across resize, zoom and replacement", () => {
  const style = applicationStyle();
  style.application.axes.number.gridStyles = [
    { stroke: "#123abc", lineDash: [2, 1] },
    { stroke: "#def456", lineDash: [8, 3] },
  ];
  const result = translateCartesian(snapshot, "line", style, mappingContext());
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({
      ...result.options,
      animation: false,
      dataZoom: [{ type: "inside", xAxisIndex: 0 }],
    });
    const original = chart.renderToSVGString();
    for (const required of [
      'stroke="#123abc"',
      'stroke="#def456"',
      'stroke-dasharray="2,1"',
      'stroke-dasharray="8,3"',
    ])
      expect(original).toContain(required);
    chart.resize({ width: 600, height: 400 });
    const resized = chart.renderToSVGString();
    expect(resized).not.toBe(original);
    expect(resized).toContain('stroke-dasharray="8,3"');
    chart.dispatchAction({ type: "dataZoom", start: 0, end: 50 });
    expect(chart.renderToSVGString()).toContain('stroke-dasharray="2,1"');
    const plain = translateCartesian(
      snapshot,
      "line",
      applicationStyle(),
      mappingContext(),
    );
    if (plain.status !== "supported") throw new Error(JSON.stringify(plain));
    chart.setOption({ ...plain.options, animation: false }, { notMerge: true });
    expect(chart.renderToSVGString()).not.toContain('stroke="#def456"');
  } finally {
    chart.dispose();
  }
});

function gridLines(
  style: ReturnType<typeof applicationStyle>,
  axis: "xAxis" | "yAxis",
  hideEnds: boolean,
) {
  const mapped = translateCartesian(snapshot, "line", style, mappingContext());
  if (mapped.status !== "supported") throw new Error(JSON.stringify(mapped));
  const options = mapped.options;
  const target = options[axis] as { splitLine: object };
  target.splitLine = {
    ...target.splitLine,
    showMinLine: !hideEnds,
    showMaxLine: !hideEnds,
  };
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({ ...options, animation: false });
    const svg = new DOMParser().parseFromString(
      chart.renderToSVGString(),
      "image/svg+xml",
    );
    return Array.from(
      svg.querySelectorAll('path[stroke="#123abc"],path[stroke="#def456"]'),
    ).map((line) => ({
      color: line.getAttribute("stroke"),
      dash: line.getAttribute("stroke-dasharray"),
      coordinates: line
        .getAttribute("d")!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number),
    }));
  } finally {
    chart.dispose();
  }
}
it.each([
  "category",
  "number",
  "time",
] as const)("matches native %s grid coordinates, endpoint filtering and style cycling", (type) => {
  const axis = type === "number" ? "number" : "category";
  const native = applicationStyle();
  native.application.axes[axis].fields.type = type;
  native.application.axes[axis].grid.enabled = true;
  native.application.axes[axis].gridStyles = [
    { stroke: "#123abc", lineDash: [2, 1] },
    { stroke: "#def456", lineDash: [2, 1] },
  ];
  const custom = structuredClone(native);
  custom.application.axes[axis].gridStyles[1].lineDash = [8, 3];
  const key = axis === "number" ? "yAxis" : "xAxis";
  for (const hideEnds of [false, true]) {
    const expected = gridLines(native, key, hideEnds);
    const actual = gridLines(custom, key, hideEnds);
    expect(actual.length).toBeGreaterThan(0);
    expect(actual).toHaveLength(expected.length);
    if (type === "category") expect(actual).toHaveLength(hideEnds ? 2 : 4);
    actual.forEach((line, index) => {
      expect(line.color).toBe(expected[index].color);
      expect(line.dash).toBe(index % 2 === 0 ? "2,1" : "8,3");
      line.coordinates.forEach((coordinate, i) =>
        expect(coordinate).toBeCloseTo(expected[index].coordinates[i], 3),
      );
    });
  }
});
