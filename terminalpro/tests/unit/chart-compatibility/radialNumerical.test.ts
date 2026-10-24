// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RadialMappingInput } from "../../../src/components/General/Table/Chart/compatibility/radialContracts";
import { prepareRadialModel } from "../../../src/components/General/Table/Chart/echarts/radialLayout";
import {
  bands,
  columnTickDensity,
  columnWidth,
  connected,
} from "../../../src/components/General/Table/Chart/echarts/radialScale";
import { radialEdgeRows } from "./fixtures/radialContract";
import { radialInput } from "./radial.fixtures";
function mixed(input: RadialMappingInput): RadialMappingInput {
  return {
    ...input,
    snapshot: {
      ...input.snapshot,
      rows: radialEdgeRows.map((r) => ({
        id: r.id,
        category: r.category,
        values: { primary: r.primary, secondary: r.secondary },
      })),
    },
  };
}
describe("frozen original radial numerical contract", () => {
  it.each([
    ["grouped", [0, 20], [-10, 30]],
    ["stacked", [0, 40], [-10, 70]],
    ["normalized", [0, 160], [-50, 150]],
  ] as const)(
    "preserves original Bar %s domains independently from ticks",
    (mode, positive, signed) => {
      expect(prepareRadialModel(radialInput("radialBar", mode)).domain).toEqual(
        positive,
      );
      expect(
        prepareRadialModel(mixed(radialInput("radialBar", mode))).domain,
      ).toEqual(signed);
    },
  );
  it("retains later valid normalized Column values and raw duplicate identities", () => {
    const model = prepareRadialModel(
      mixed(radialInput("radialColumn", "normalized")),
    );
    expect(model.series[0].marks.map((m) => m.rowId)).toEqual([
      "r1",
      "r2",
      "r4",
      "r6",
    ]);
    expect(model.series[0].marks.at(-1)).toMatchObject({
      rawValue: 30,
      startValue: 0,
    });
    expect(model.series[0].marks.at(-1)?.endValue).toBeCloseTo(250 / 3);
    const last = model.series[1].marks.find((m) => m.rowId === "r6");
    expect(last?.rawValue).toBe(6);
    expect(last?.startValue).toBeCloseTo(250 / 3);
    expect(last?.endValue).toBeCloseTo(100);
  });
  it("keeps normalized positive 100 at 225 degrees and removes duplicate endpoint label only", () => {
    const m = prepareRadialModel(radialInput("radialBar", "normalized"));
    const mark = m.series[1].marks[0];
    expect(mark.kind).toBe("bar");
    if (mark.kind === "bar")
      expect(mark.endAngle + Math.PI / 2).toBeCloseTo(Math.PI * 1.25);
    expect(m.ticks.at(-1)).toBe(160);
    expect(m.numericalLabels.at(-1)?.value).toBe(140);
  });
  it("retains singleton overlap, default width R and top rotation", () => {
    const input = radialInput();
    const m = prepareRadialModel({
      ...input,
      snapshot: { ...input.snapshot, rows: input.snapshot.rows.slice(0, 1) },
    });
    for (const series of m.series) {
      const mark = series.marks[0];
      expect(mark.kind).toBe("column");
      if (mark.kind === "column") {
        expect(mark.width).toBe(m.outerRadius);
        expect(mark.rotation).toBe(0);
      }
    }
  });
  it("recomputes hidden series without losing palette or legend identity", () => {
    const input = radialInput("radialBar", "normalized");
    const m = prepareRadialModel({
      ...input,
      context: { ...input.context, legendSelection: { primary: false } },
    });
    expect(m.series[0]).toMatchObject({
      id: "primary",
      visible: false,
      paletteIndex: 0,
      marks: [],
    });
    expect(m.series[1].marks[0]).toMatchObject({
      rawValue: 2,
      startValue: 0,
      endValue: 100,
    });
  });
});

function values(
  input: RadialMappingInput,
  pairs: readonly (readonly [number | null, number | null])[],
): RadialMappingInput {
  return {
    ...input,
    snapshot: {
      ...input.snapshot,
      rows: pairs.map(([primary, secondary], i) => ({
        id: `r${i}`,
        category: "duplicate",
        values: { primary, secondary },
      })),
    },
  };
}
describe("signed, absent and bounded radial geometry", () => {
  it.each(["radialColumn", "radialBar"] as const)(
    "%s keeps zero but omits normalized zero-denominator and missing",
    (family) => {
      const ordinary = prepareRadialModel(
        values(radialInput(family), [
          [0, -0],
          [null, Number.NaN],
        ]),
      );
      expect(ordinary.domain).toEqual([0, 0]);
      expect(ordinary.series.map((s) => s.marks.length)).toEqual([1, 1]);
      expect(Object.is(ordinary.series[1].marks[0].rawValue, -0)).toBe(true);
      const normalized = prepareRadialModel(
        values(radialInput(family, "normalized"), [
          [0, -0],
          [null, Number.NaN],
        ]),
      );
      expect(normalized.series.flatMap((s) => s.marks)).toEqual([]);
    },
  );
  it("keeps original negative-only Bar extent and ordered full-turn endpoints", () => {
    const m = prepareRadialModel(values(radialInput("radialBar"), [[-18, -2]]));
    expect(m.domain).toEqual([-20, 0]);
    const mark = m.series[0].marks[0];
    if (mark.kind === "bar") {
      expect(mark.endAngle).toBeCloseTo((3 * Math.PI) / 2);
      expect(mark.startAngle).toBeCloseTo(-Math.PI / 2 + Math.PI / 5);
    }
    const full = prepareRadialModel(
      values(radialInput("radialBar"), [[20, null]]),
    ).series[0].marks[0];
    if (full.kind === "bar")
      expect(full.endAngle - full.startAngle).toBeCloseTo(2 * Math.PI);
  });
  it("retains signed stacking starts independently", () => {
    const m = prepareRadialModel(
      values(radialInput("radialColumn", "stacked"), [
        [-2, -3],
        [2, 3],
        [2, -3],
      ]),
    );
    expect(m.series[1].marks.map((v) => [v.startValue, v.endValue])).toEqual([
      [-2, -5],
      [2, 5],
      [0, -3],
    ]);
  });
  it("preserves empty and all-hidden domains and native legend identities", () => {
    const input = radialInput();
    expect(prepareRadialModel(values(input, [])).domain).toEqual([0, 0]);
    const m = prepareRadialModel({
      ...input,
      context: {
        ...input.context,
        legendSelection: { primary: false, secondary: false },
      },
    });
    expect(m.domain).toEqual([0, 0]);
    expect(m.series.map((s) => [s.id, s.paletteIndex, s.marks.length])).toEqual(
      [
        ["primary", 0, 0],
        ["secondary", 1, 0],
      ],
    );
  });
  it("uses first input row as innermost ring and the category hole", () => {
    const input = radialInput("radialBar", "stacked");
    const model = prepareRadialModel(input);
    expect(model.holeRadius / model.outerRadius).toBeCloseTo(0.2);
    const marks = model.series[0].marks;
    if (marks[0].kind === "bar" && marks[2].kind === "bar") {
      expect(marks[0].innerRadius).toBeLessThan(marks[2].innerRadius);
      expect(marks[0].innerRadius).toBeGreaterThan(model.holeRadius);
      expect(marks[2].outerRadius).toBeLessThan(model.outerRadius);
    }
    expect(model.axisStrokes).toEqual([
      { axis: "numerical", kind: "circle", radius: model.outerRadius },
      {
        axis: "category",
        kind: "line",
        x1: 0,
        y1: -model.holeRadius,
        x2: 0,
        y2: -model.outerRadius,
      },
    ]);
  });
  it("rejects duplicate row IDs, unknown assignments, malformed observations and overflow", () => {
    const input = radialInput();
    expect(() =>
      prepareRadialModel({
        ...input,
        snapshot: {
          ...input.snapshot,
          rows: [input.snapshot.rows[0], input.snapshot.rows[0]],
        },
      }),
    ).toThrow(/row ID/);
    expect(() =>
      prepareRadialModel({ ...input, assignments: [{ colId: "unknown" }] }),
    ).toThrow(/assignment/);
    expect(() =>
      prepareRadialModel(values(input, [["bad" as unknown as number, 1]])),
    ).toThrow(/observation/);
    expect(() =>
      prepareRadialModel(values(input, [[Number.MAX_VALUE, Number.MAX_VALUE]])),
    ).toThrow(/arithmetic/);
    expect(() =>
      prepareRadialModel({
        ...input,
        context: { ...input.context, viewport: { width: 4e6, height: 4e6 } },
      }),
    ).toThrow(/pixel/);
  });
  it("omits marks for zero drawable spans", () => {
    const input = radialInput();
    const m = prepareRadialModel({
      ...input,
      context: { ...input.context, viewport: { width: 0, height: 0 } },
    });
    expect(m.series.flatMap((s) => s.marks)).toEqual([]);
  });
});

describe("frozen source band and baseline rules", () => {
  it("uses unrounded singleton band padding and original connection predicate", () => {
    const singleton = bands(100, 20, 1, 0.8, 0.1);
    expect(singleton.width).toBe(-64);
    expect(singleton.origin(0)).toBe(92);
    const ordinary = bands(-1, 1, 2, 0.2);
    expect(ordinary.width).toBeCloseTo(8 / 9);
    expect(ordinary.origin(1)).toBeCloseTo(1 / 9);
    expect(connected(50, 50, 49)).toBe(true);
    expect(connected(50, 50, 50)).toBe(false);
    expect(connected(60, 50, 10)).toBe(false);
    expect(connected(0, 0, 10)).toBe(false);
  });
  it("uses modulo full-circle width and independent label midpoint", () => {
    expect(columnWidth(-Math.PI / 2, (3 * Math.PI) / 2, 100)).toBe(100);
    expect(columnWidth(0, Math.PI / 2, 100)).toBe(76);
    const input = radialInput();
    const m = prepareRadialModel(values(input, [[1, 2]]));
    const mark = m.series[0].marks[0];
    expect(mark.labelY).toBeCloseTo(0);
    expect(mark.labelX).toBeGreaterThan(0);
    if (mark.kind === "column") {
      expect(mark.rotation).toBe(0);
      expect(mark.connectBaseline).toBe(false);
    }
  });
});

it.each(["radialColumn", "radialBar"] as const)(
  "preserves %s display labels independently from stable IDs",
  (family) => {
    const input = radialInput(family);
    const labeled: RadialMappingInput = {
      ...input,
      snapshot: {
        ...input.snapshot,
        columns: input.snapshot.columns.map((column) => ({
          ...column,
          label:
            column.id === "primary"
              ? "Cost of revenue (USD)"
              : column.id === "secondary"
                ? "Gross profit (USD)"
                : column.label,
        })),
      },
      context: { ...input.context, legendSelection: { primary: false } },
    };
    const model = prepareRadialModel(labeled);
    expect(
      model.series.map(({ id, label, visible, paletteIndex }) => ({
        id,
        label,
        visible,
        paletteIndex,
      })),
    ).toEqual([
      {
        id: "primary",
        label: "Cost of revenue (USD)",
        visible: false,
        paletteIndex: 0,
      },
      {
        id: "secondary",
        label: "Gross profit (USD)",
        visible: true,
        paletteIndex: 1,
      },
    ]);
    expect(model.series[0].marks).toEqual([]);
    expect(model.series[1].marks.map((mark) => mark.rawValue)).toEqual([
      2, 8, 18,
    ]);
  },
);

it("retains exact AAPL FY2025 USD observations on the original polar 80B scale", () => {
  const input = radialInput();
  const values = [
    [66025000000, 58275000000],
    [50492000000, 44867000000],
    [50318000000, 43718000000],
    [54125000000, 48341000000],
  ];
  const next = {
    ...input,
    context: { ...input.context, viewport: { width: 619, height: 593 } },
    snapshot: {
      ...input.snapshot,
      rows: values.map(([primary, secondary], i) => ({
        id: `q${i}`,
        category: `Q${i + 1}`,
        values: { primary, secondary },
      })),
    },
  };
  const model = prepareRadialModel(next);
  expect(model.domain).toEqual([0, 80000000000]);
  expect(model.ticks).toEqual([
    0, 20000000000, 40000000000, 60000000000, 80000000000,
  ]);
  expect(model.series.map((s) => s.marks.map((m) => m.rawValue))).toEqual([
    values.map((v) => v[0]),
    values.map((v) => v[1]),
  ]);
  expect(model.numericalGridRadii).toEqual(
    model.ticks
      .slice(0, -1)
      .reverse()
      .map(
        (v) =>
          model.holeRadius +
          ((model.outerRadius - model.holeRadius) * v) / 80000000000,
      ),
  );
  const hidden = prepareRadialModel({
    ...next,
    context: { ...next.context, legendSelection: { primary: false } },
  });
  expect(hidden.series[0].marks).toEqual([]);
  expect(hidden.series[1].marks.map((m) => m.rawValue)).toEqual(
    values.map((v) => v[1]),
  );
  expect(
    prepareRadialModel(radialInput("radialBar")).numericalGridRadii,
  ).toEqual([]);
});

it("uses polar density at small and zero spans independently of font size", () => {
  expect(columnTickDensity(110)).toEqual({
    tickCount: 5,
    minTickCount: 1,
    maxTickCount: 5,
  });
  expect(columnTickDensity(10)).toEqual({
    tickCount: 1,
    minTickCount: 1,
    maxTickCount: 1,
  });
  expect(columnTickDensity(0)).toEqual({
    tickCount: 0,
    minTickCount: 0,
    maxTickCount: 0,
  });
  const input = radialInput();
  for (const ratio of [0.99, 1]) {
    const model = prepareRadialModel({
      ...input,
      style: {
        ...input.style,
        axes: {
          ...input.style.axes,
          numerical: { ...input.style.axes.numerical, innerRadiusRatio: ratio },
        },
      },
    });
    expect(model.ticks.length).toBe(ratio === 1 ? 0 : 2);
    expect(model.numericalGridRadii.every(Number.isFinite)).toBe(true);
  }
});
