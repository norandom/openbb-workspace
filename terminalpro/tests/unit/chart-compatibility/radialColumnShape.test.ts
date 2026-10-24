// @vitest-environment node
import { graphic } from "echarts";
import { describe, expect, it } from "vitest";
import {
  buildRadialColumnPath,
  type RadialColumnPathInput,
} from "../../../src/components/General/Table/Chart/echarts/radialColumnShape";

const base: RadialColumnPathInput = {
  startRadius: 55,
  endRadius: 85,
  holeRadius: 55,
  outerRadius: 110,
  width: 48,
  connectBaseline: true,
};

function parsed(input: RadialColumnPathInput) {
  const result = buildRadialColumnPath(input);
  const Shape = graphic.extendPath(result.pathData, {});
  return new Shape({
    style: { fill: result.zero ? "none" : "#000", stroke: "none" },
  });
}

// Expected hits use strip/disk inequalities, independently of path commands or arc parsing.
function expectedFill(
  input: RadialColumnPathInput,
  x: number,
  y: number,
): boolean {
  const low = Math.min(input.startRadius, input.endRadius);
  const high = Math.max(input.startRadius, input.endRadius);
  if (low === high || Math.abs(x) > input.width / 2 || y > 0) return false;
  if (x * x + y * y > input.outerRadius ** 2 || -y > high) return false;
  return input.connectBaseline && input.startRadius <= input.endRadius
    ? x * x + y * y >= low ** 2
    : -y >= low;
}

const cases: [string, Partial<RadialColumnPathInput>][] = [
  ["connected baseline", {}],
  ["outer shoulders", { endRadius: 110 }],
  [
    "flat stack seam",
    { startRadius: 85, endRadius: 110, connectBaseline: false },
  ],
  [
    "inward signed movement",
    { startRadius: 80, endRadius: 55, connectBaseline: false },
  ],
  ["inward stack", { startRadius: 95, endRadius: 80, connectBaseline: false }],
  [
    "zero hole",
    { startRadius: 0, holeRadius: 0, endRadius: 110, connectBaseline: false },
  ],
  [
    "wide flat baseline",
    { width: 110, endRadius: 110, connectBaseline: false },
  ],
  ["thin connected segment", { endRadius: 56 }],
  ["explicit connectivity above caller threshold", { width: 100 }],
];

describe("inactive radial column pixel geometry", () => {
  it.each(cases)("matches analytic fill boundaries for %s", (_, changes) => {
    const input = { ...base, ...changes };
    const path = parsed(input);
    for (let x = -60.173; x < 61; x += 3.7) {
      for (let y = -112.193; y < 3; y += 2.9) {
        expect(path.contain(x, y), `point ${x},${y}`).toBe(
          expectedFill(input, x, y),
        );
      }
    }
  });

  it("keeps split baseline arcs pickable on both sides of the vertical extremum", () => {
    const path = parsed(base);
    for (const x of [-0.193, 0.193, -23.193, 23.193]) {
      const boundary = -Math.sqrt(55 ** 2 - x ** 2);
      expect(path.contain(x, boundary - 0.2)).toBe(true);
      expect(path.contain(x, boundary + 0.2)).toBe(false);
    }
    // A single equivalent arc has failed ECharts containment near this extremum.
    expect(buildRadialColumnPath(base).pathData).toContain(
      "A 55 55 0 0 0 0 -55 A 55 55",
    );
  });

  it("preserves the same flat interval when a signed segment reverses direction", () => {
    const forward = {
      ...base,
      startRadius: 55,
      endRadius: 80,
      connectBaseline: false,
    };
    expect(buildRadialColumnPath(forward)).toEqual(
      buildRadialColumnPath({ ...forward, startRadius: 80, endRadius: 55 }),
    );
  });

  it.each([55, 80, 110])(
    "returns an open, unfilled zero path at radius %s",
    (radius) => {
      const input = {
        ...base,
        startRadius: radius,
        endRadius: radius,
        connectBaseline: radius === 55,
      };
      const result = buildRadialColumnPath(input);
      expect(result.zero).toBe(true);
      expect(result.pathData).not.toContain("Z");
      const path = parsed(input);
      expect(path.style.fill).toBe("none");
      expect(path.contain(0, -radius)).toBe(false);
    },
  );

  it("retains the curved zero stroke through the baseline extremum", () => {
    const result = buildRadialColumnPath({ ...base, endRadius: 55 });
    const Shape = graphic.extendPath(result.pathData, {});
    const path = new Shape({
      style: { fill: "none", stroke: "#000", lineWidth: 1 },
    });
    for (const x of [-23, -0.193, 0.193, 23]) {
      expect(path.contain(x, -Math.sqrt(55 ** 2 - x ** 2))).toBe(true);
      expect(path.contain(x, -Math.sqrt(55 ** 2 - x ** 2) + 10)).toBe(false);
    }
  });

  it.each([
    "startRadius",
    "endRadius",
    "holeRadius",
    "outerRadius",
    "width",
  ] as const)(
    "rejects overflow and values beyond the supported bound in %s",
    (field) => {
      for (const value of [
        1e200,
        1_000_000.001,
        Number.POSITIVE_INFINITY,
        Number.NaN,
      ]) {
        expect(() =>
          buildRadialColumnPath({ ...base, [field]: value }),
        ).toThrow(RangeError);
      }
    },
  );

  it.each<Partial<RadialColumnPathInput>>([
    { holeRadius: -1 },
    { outerRadius: 54 },
    { width: 0 },
    { width: -1 },
    { startRadius: 54 },
    { endRadius: 111 },
    { startRadius: 80 },
    { width: 110 },
    { connectBaseline: "true" as unknown as boolean },
  ])("rejects invalid programmer geometry %j", (changes) => {
    expect(() => buildRadialColumnPath({ ...base, ...changes })).toThrow(
      RangeError,
    );
  });

  it("accepts exact numeric bounds without clamping", () => {
    const input = {
      startRadius: 600_000,
      endRadius: 1_000_000,
      holeRadius: 600_000,
      outerRadius: 1_000_000,
      width: 1_000_000,
      connectBaseline: true,
    };
    const result = buildRadialColumnPath(input);
    expect(result.zero).toBe(false);
    expect(result.pathData).not.toMatch(/NaN|Infinity/);
    expect(parsed(input).contain(0, -900_000)).toBe(true);
    expect(parsed(input).contain(0, -500_000)).toBe(false);
  });
});
