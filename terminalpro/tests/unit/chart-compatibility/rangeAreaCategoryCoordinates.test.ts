import { expect, it } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import { boundary } from "../../../src/components/General/Table/Chart/echarts/rangeAreaPaths";
import { areaInput } from "./rangeArea.fixtures";

function numericInput() {
  const input = areaInput();
  input.style.categoryAxis.fields.type = "number";
  input.style.categoryCoordinates = {
    kind: "number",
    fullExtent: [0, 100],
    ticks: [
      { coordinate: 0, label: "zero" },
      { coordinate: 50, label: "midpoint" },
      { coordinate: 100, label: "hundred" },
    ],
  };
  input.snapshot.rows = [0, 100, 1].map((category, i) => ({
    id: String(i),
    category,
    values: { amount: i + 2, other: i + 4 },
  }));
  return input;
}
function supported(input = numericInput()) {
  const result = translateRangeArea(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
type Axis = {
  min: number;
  max: number;
  axisLabel: { customValues: number[]; formatter: (n: number) => string };
  axisPointer: { label: { formatter: (p: { value: number }) => string } };
};
type Target = {
  data: { value: number[]; metadata: { fieldId: string; groupSlot: number } }[];
};

it("uses supplied number ticks while retaining encounter identity and immutable input", () => {
  const input = numericInput();
  const before = JSON.stringify(input);
  const result = supported(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(result.projection.groups.map((g) => g.category)).toEqual([0, 100, 1]);
  const axis = result.options.xAxis as Axis;
  expect([axis.min, axis.max]).toEqual([0, 100]);
  expect(axis.axisLabel.customValues).toEqual([0, 50, 100]);
  expect([0, 50, 100].map(axis.axisLabel.formatter)).toEqual([
    "zero",
    "midpoint",
    "hundred",
  ]);
  expect(axis.axisLabel.formatter(1)).toBe("");
  expect(axis.axisPointer.label.formatter({ value: 100 })).toBe("cross:100");
  expect(axis.axisPointer.label.formatter({ value: 50 })).toBe("");
  const targets = (result.options.series as Target[])[1].data;
  expect(targets.map((d) => d.value[0])).toEqual([1, 100, 0]);
  expect(targets.map((d) => d.metadata.groupSlot)).toEqual([2, 1, 0]);
});

it("resolves axis callbacks by exact raw coordinate and item callbacks by explicit metadata", () => {
  const input = numericInput();
  const shared = supported(input);
  const formatter = (shared.options.tooltip as { formatter: (p: unknown) => string })
    .formatter;
  expect(formatter([{ axisValue: 100 }])).toContain("period:100");
  expect(formatter([{ axisValue: 1 }])).toContain("number:4 - number:4");
  expect(formatter([{ axisValue: 2 }])).toBe("");
  expect(formatter([{ axisValue: 50 }])).toBe("");
  input.style.tooltip.mode = "single";
  const single = supported(input);
  const item = (single.options.tooltip as { formatter: (p: unknown) => string })
    .formatter;
  expect(
    item({ axisValue: 100, data: { metadata: { fieldId: "amount", groupSlot: 2 } } }),
  ).toBe("period:1<br/>Revenue &lt;USD&gt;: number:4 - number:4");
});

it("rejects continuous string keys before category, pointer and endpoint formatting", () => {
  const input = numericInput();
  input.snapshot.rows.splice(1, 0, {
    id: "invalid",
    category: "50",
    values: { amount: 999, other: 999 },
  });
  const calls: unknown[] = [];
  input.context.display.category = (v) => {
    calls.push(v);
    return `period:${v}`;
  };
  input.context.display.crosshair = (v) => {
    calls.push(v);
    return `pointer:${v}`;
  };
  input.context.display.tooltipNumber = (v) => {
    if (v === 999) throw Error("inadmissible endpoint callback");
    return `number:${v}`;
  };
  for (const style of Object.values(input.style.fields)) style.label.enabled = true;
  input.context.display.seriesLabel = (v) => {
    if (v === 999) throw Error("inadmissible label callback");
    return `label:${v}`;
  };
  const result = supported(input);
  expect(calls).not.toContain("50");
  expect(result.projection.groups.map((g) => g.category)).toEqual([0, "50", 100, 1]);
  const targets = (result.options.series as Target[])[1].data;
  expect(targets.map((d) => d.metadata.groupSlot)).toEqual([3, 2, 0]);
  expect(targets.map((d) => d.value[0])).toEqual([1, 100, 0]);
});

it("groups equal numeric categories through the real projection before rendering", () => {
  const input = numericInput();
  input.snapshot.rows.push({
    id: "duplicate",
    category: 100,
    values: { amount: 15, other: 17 },
  });
  const result = supported(input);
  expect(result.projection.groups.map((g) => g.category)).toEqual([0, 100, 1]);
  expect(result.projection.fields[0].data[1].summary).toMatchObject({
    min: 3,
    max: 15,
  });
  expect((result.options.series as Target[])[1].data).toHaveLength(3);
});

it("requires matching explicit continuous plans and rejects malformed or overflowing plans atomically", () => {
  const invalidPlans: unknown[] = [
    undefined,
    { kind: "time", fullExtent: [0, 100], ticks: [] },
    { kind: "number", fullExtent: [100, 0], ticks: [] },
    { kind: "number", fullExtent: [-Number.MAX_VALUE, Number.MAX_VALUE], ticks: [] },
    { kind: "number", fullExtent: [0, 100], visibleRange: [0.5, 0.5], ticks: [] },
    {
      kind: "number",
      fullExtent: [0, 100],
      ticks: [{ coordinate: 101, label: "outside" }],
    },
  ];
  for (const plan of invalidPlans) {
    const input = numericInput();
    input.style.categoryCoordinates = plan as typeof input.style.categoryCoordinates;
    const result = translateRangeArea(input);
    expect(result.status).not.toBe("supported");
    expect(result).not.toHaveProperty("options");
  }
});

it("preserves source sign predicate, finite backtracking controls and explicit nonfinite rejection", () => {
  const smooth = { type: "smooth", tension: 1 } as const;
  expect(
    boundary(
      [
        [0, 0],
        [0, 0],
      ],
      smooth,
    ),
  ).toBe("M0 0C0 0 0 0 0 0");
  const backtracking = boundary(
    [
      [0, 0],
      [2, 1],
      [1, 2],
    ],
    smooth,
  );
  const controls = [...backtracking.matchAll(/C([^C]+)/g)].map((match) =>
    match[1].split(/\s+/).map(Number),
  );
  expect(controls).toHaveLength(2);
  const expected = [
    [2 / 3, 1 / 3, 4 / 3, -1 / 3, 2, 1],
    [5 / 3, 1 / 3, 4 / 3, 5 / 3, 1, 2],
  ];
  controls.forEach((segment, i) =>
    segment.forEach((value, j) => expect(value).toBeCloseTo(expected[i][j])),
  );
  expect(() =>
    boundary(
      [
        [0, 0],
        [0, 1],
      ],
      smooth,
    ),
  ).toThrow();
  expect(() =>
    boundary(
      [
        [0, 0],
        [1, 1],
        [0, 2],
      ],
      smooth,
    ),
  ).toThrow();
  expect(
    boundary(
      [
        [0, 0],
        [1, 1],
        [0, 2],
      ],
      { type: "linear" },
    ),
  ).toBe("M0 0L1 1L0 2");
});
