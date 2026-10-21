import { expect, it } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import {
  areaPaths,
  boundary,
  partition,
} from "../../../src/components/General/Table/Chart/echarts/rangeAreaPaths";
import { areaInput, fmpRows } from "./rangeArea.fixtures";

it("preserves independent raw FMP extrema and immutable caller data", () => {
  const input = areaInput();
  input.snapshot.rows = structuredClone(fmpRows);
  input.style.valueScale = { min: 0, max: 80000000000, ticks: [0, 80000000000] };
  const before = JSON.stringify(input.snapshot);
  const r = translateRangeArea(input);
  expect(r.status).toBe("supported");
  if (r.status !== "supported") return;
  expect(
    r.projection.fields.map((f) =>
      f.data.map((d) => d.summary && [d.summary.min, d.summary.max]),
    ),
  ).toEqual([
    [
      [46852000000, 46852000000],
      [45408000000, 78351000000],
    ],
    [
      [9014000000, 9014000000],
      [8717000000, 17891000000],
    ],
  ]);
  expect(JSON.stringify(input.snapshot)).toBe(before);
});
it("partitions missing slots without inventing observations", () => {
  expect(partition([1, null, 3], false)).toEqual([[1], [3]]);
  expect(partition([1, null, 3], true)).toEqual([[1, 3]]);
});
it("uses independently derived pixel linear, step and smooth controls", () => {
  expect(
    boundary(
      [
        [0, 0],
        [12, 12],
      ],
      { type: "linear" },
    ),
  ).toBe("M0 0L12 12");
  for (const [position, x] of [
    ["start", 0],
    ["middle", 6],
    ["end", 12],
  ] as const)
    expect(
      boundary(
        [
          [0, 0],
          [12, 12],
        ],
        { type: "step", position },
      ),
    ).toBe(`M0 0L${x} 0L${x} 12L12 12`);
  expect(
    boundary(
      [
        [0, 0],
        [12, 12],
      ],
      { type: "smooth", tension: 1 },
    ),
  ).toBe("M0 0C4 4 8 8 12 12");
});
it("rejects accessor input atomically", () => {
  const i = areaInput();
  Object.defineProperty(i.style, "fields", {
    get() {
      throw Error("getter");
    },
  });
  expect(translateRangeArea(i).status).toBe("invalid");
});
it("does not round arbitrary tooltip input into an observation", () => {
  const r = translateRangeArea(areaInput());
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  const f = (r.options.tooltip as { formatter: (v: unknown) => string }).formatter;
  expect(f([{ axisValue: 1.2 }])).toBe("");
  expect(f([{ axisValue: 1 }])).toBe("");
  expect(f([{ axisValue: 0 }])).toContain("number:2 - number:8");
});
it("suppresses null scale and keeps equal domains at midpoint with raw labels", () => {
  const i = areaInput();
  i.style.valueScale = null;
  const r = translateRangeArea(i);
  expect(r.status).toBe("supported");
  if (r.status !== "supported") return;
  expect((r.options.tooltip as { show: boolean }).show).toBe(false);
  i.snapshot.rows = [{ id: "equal", category: "one", values: { amount: 9, other: 9 } }];
  i.style.valueScale = { min: 9, max: 9, ticks: [9] };
  const equal = translateRangeArea(i);
  expect(equal.status).toBe("supported");
  if (equal.status !== "supported") return;
  expect(equal.projection.dataExtent).toEqual([9, 9]);
  const axis = equal.options.yAxis as {
    min: number;
    max: number;
    axisLabel: { formatter: (n: number) => string };
  };
  expect([axis.min, axis.max]).toEqual([0, 1]);
  expect(axis.axisLabel.formatter(0.5)).toContain("9");
});
it("retains empty explicit axes and does not invoke disabled endpoint callbacks", () => {
  const i = areaInput();
  i.snapshot.rows = [];
  i.context.display.seriesLabel = () => {
    throw Error("disabled");
  };
  i.context.display.tooltipNumber = () => {
    throw Error("disabled");
  };
  expect(translateRangeArea(i).status).toBe("supported");
  i.snapshot.rows = [
    { id: "n", category: "null", values: { amount: null, other: null } },
  ];
  expect(translateRangeArea(i).status).toBe("supported");
  i.snapshot.rows = [{ id: "h", category: "hidden", values: { amount: 1, other: 2 } }];
  i.context.legendSelection = { amount: false, other: false };
  expect(translateRangeArea(i).status).toBe("supported");
});
it("keeps source flat extrema and terminal gradient doubling", () => {
  expect(
    boundary(
      [
        [0, 0],
        [12, 12],
        [24, 0],
      ],
      { type: "smooth", tension: 1 },
    ),
  ).toBe("M0 0C4 8 8 12 12 12C16 12 20 8 24 0");
  expect(
    boundary(
      [
        [0, 5],
        [12, 5],
      ],
      { type: "smooth", tension: 1 },
    ),
  ).toBe("M0 5C4 5 8 5 12 5");
});
it("uses source overshoot shortening and reversed low cubic controls", () => {
  const mode = { type: "smooth", tension: 1 } as const;
  // The 100px interval has gradient 100/101 and dy=10; shortening preserves the gradient at x=11.1.
  const low = [
    [0, 0],
    [1, 90],
    [101, 100],
    [102, 90],
  ] as const;
  expect(boundary(low, mode)).toContain("C11.1 100 67.66666666666666 100 101 100");
  const paths = areaPaths(
    low,
    low.map(([x, y]) => [x, y + 20] as const),
    mode,
  );
  expect(paths.fill).toContain("C67.66666666666666 100 11.1 100 1 90");
  expect(paths.outline).not.toContain("Z");
});

it("rejects malformed data before callbacks and returns no partial options on callback failure", () => {
  const input = areaInput();
  let calls = 0;
  input.context.display.category = () => {
    calls++;
    return "category";
  };
  input.style.fields.amount.marker.size = -1;
  const invalid = translateRangeArea(input);
  expect(invalid.status).toBe("invalid");
  expect(invalid).not.toHaveProperty("options");
  expect(calls).toBe(0);
  input.style.fields.amount.marker.size = 6;
  input.context.display.seriesLabel = () => {
    throw Error("format failed");
  };
  input.style.fields.amount.label.enabled = true;
  const throwing = translateRangeArea(input);
  expect(throwing.status).toBe("invalid");
  expect(throwing).not.toHaveProperty("options");
  input.style.fields.amount.label.enabled = false;
  input.style.fields.other.label.enabled = false;
  input.style.tooltip.enabled = false;
  input.context.display.tooltipNumber = () => {
    throw Error("disabled");
  };
  expect(translateRangeArea(input).status).toBe("supported");
});
