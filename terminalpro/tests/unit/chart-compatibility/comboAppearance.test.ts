import { describe, expect, it } from "vitest";
import type { ComboAppearanceInput } from "../../../src/components/General/Table/Chart/application/comboAppearance";
import { resolveComboAppearance } from "../../../src/components/General/Table/Chart/application/comboAppearance";
import { sessionFixture } from "../chart-application/applicationSessionFixture";

function input(): ComboAppearanceInput & {
  baseline: any;
  theme: any;
  assignments: any[];
} {
  const context = sessionFixture();
  return {
    baseline: context.local.baseline,
    generated: {},
    theme: context.inputs.theme,
    precision: 0,
    seriesIds: ["revenue", "income", "eps"],
    assignments: [
      { colId: "revenue", chartType: "groupedColumn" as const },
      { colId: "income", chartType: "area" as const },
      { colId: "eps", chartType: "line" as const, secondaryAxis: true },
    ],
  };
}
describe("combo effective appearance", () => {
  it("resolves independent geometry in global palette order without mutating saved layers", () => {
    const candidate = input();
    candidate.baseline.options = {
      bar: { series: { strokeWidth: 7 } },
      area: { series: { fillOpacity: 0.2 } },
      line: { series: { strokeWidth: 9 } },
      future: { retained: true },
    };
    const before = structuredClone(candidate);
    const result = resolveComboAppearance(candidate);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.style.geometry.bar?.series.strokeWidth).toBe(7);
    expect(result.value.style.geometry.area?.series.fillOpacity).toBe(0.2);
    expect(result.value.style.geometry.line?.series.strokeWidth).toBe(9);
    expect(result.value.style.geometry.line?.overrides.eps.fill).toBe(
      candidate.theme.palette.fills[0],
    );
    expect(result.value.style.geometry.area?.overrides.income.fill).toBe(
      candidate.theme.palette.fills[1],
    );
    expect(candidate).toEqual(before);
  });
  it("inherits numeric theme across all separate axes and targets only first numeric concrete state", () => {
    const candidate = input();
    candidate.assignments = candidate.assignments.map((a) => ({
      ...a,
      chartType: "line" as const,
      secondaryAxis: true,
    }));
    candidate.theme.overrides = {
      common: { axes: { number: { right: { label: { color: "#123456" } } } } },
    };
    const result = resolveComboAppearance(candidate);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.style.axes.primary).toBeUndefined();
    expect(Object.keys(result.value.style.axes.secondary)).toEqual(
      candidate.seriesIds,
    );
    expect(
      Object.values(result.value.style.axes.secondary).every(
        (a) => a.fields.position === "right" && a.labels.color === "#123456",
      ),
    ).toBe(true);
  });
  it("rejects mismatched concrete identities and missing active assignments", () => {
    const candidate = input();
    const valid = resolveComboAppearance(candidate);
    if (!valid.valid) throw new Error(valid.error);
    expect(
      resolveComboAppearance({
        ...candidate,
        concreteAxes: valid.value.axes.map((a) => ({ ...a, key: "invented" })),
      }).valid,
    ).toBe(false);
    expect(
      resolveComboAppearance({
        ...candidate,
        assignments: candidate.assignments.slice(1),
      }).valid,
    ).toBe(false);
  });
});
