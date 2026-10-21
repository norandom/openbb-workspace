import { beforeEach, expect, it, vi } from "vitest";
import { boxPlotAxisLayout } from "../../../src/components/General/Table/Chart/echarts/boxPlotAxisLayout";
import { planBoxCategoryLabels } from "../../../src/components/General/Table/Chart/echarts/boxPlotCategoryPlan";
import type {
  BoxPlotMappingInput,
  BoxPlotProjection,
} from "../../../src/components/General/Table/Chart/echarts/boxPlotTypes";
import { histogramInput } from "./histogram.fixtures";

function categoryInput(labels = {}) {
  const h = histogramInput();
  const input: BoxPlotMappingInput = {
    snapshot: h.snapshot,
    style: {
      common: h.style.common,
      application: h.style.application,
      direction: "vertical",
      axes: {
        category: {
          ...h.style.axes.x.appearance,
          labels: {
            ...h.style.axes.x.appearance.labels,
            rotation: undefined,
            autoRotate: true,
            ...labels,
          },
        },
        number: h.style.axes.y,
      },
      fields: {},
      band: { paddingInner: 0.3, paddingOuter: 0.15, groupPaddingInner: 0.2 },
    },
    context: {
      ...h.context,
      display: { ...h.context.display, category: String },
    },
  };
  return input;
}
function projection(labels: string[]): BoxPlotProjection {
  return {
    fields: [],
    groups: labels.map((category, slot) => ({
      category,
      slot,
      rowIds: [`r${slot}`],
    })),
  };
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as any),
);

it("wraps against the actual box band, preserves failed text, rotates then thins raw slots by powers of two", () => {
  const labels = Array.from({ length: 12 }, (_, i) => `FY ${2016 + i}`);
  labels[0] += " (partial: 1/4 quarters)";
  labels[11] += " (partial: 3/4 quarters)";
  const groups = projection(labels);
  const plan = planBoxCategoryLabels(categoryInput(), groups, 528);
  expect(plan.bandwidth).toBeCloseTo(30.8);
  expect(plan.labels[0]).toBe(labels[0]);
  expect(plan.labels[2]).toBe("FY\n2018");
  expect(plan.rotation).toBe(25);
  expect(plan.slots).toEqual([0, 2, 4, 6, 8, 10]);
  expect(plan.footprint).toBeGreaterThan(70);
  expect(groups.groups.map((g) => g.category)).toEqual(labels);
});
it.each([
  "never",
  "always",
  "hyphenate",
  "on-space",
] as const)("honors explicit %s wrapping", (wrapping) => {
  const plan = planBoxCategoryLabels(
    categoryInput({ wrapping, autoRotate: false }),
    projection(["abcdefghij", "FY 2020"]),
    100,
  );
  if (wrapping === "always") expect(plan.labels[0]).toBe("abcde\nfghij");
  else if (wrapping === "hyphenate") expect(plan.labels[0]).toBe("abcd-\nefgh-\nij");
  else expect(plan.labels[0]).toBe("abcdefghij");
  expect(plan.labels[1]).toBe(wrapping === "never" ? "FY 2020" : "FY\n2020");
});
it("preserves explicit rotation, disabled collision policy and disabled label space", () => {
  const groups = projection([
    "very long category",
    "another long category",
    "third category",
  ]);
  const explicit = planBoxCategoryLabels(categoryInput({ rotation: 40 }), groups, 60);
  expect(explicit.rotation).toBe(-40);
  const disabled = planBoxCategoryLabels(
    categoryInput({ avoidCollisions: false }),
    groups,
    60,
  );
  expect(disabled.rotation).toBe(0);
  expect(disabled.slots).toEqual([0, 1, 2]);
  expect(disabled.labels).toEqual(groups.groups.map((g) => g.category));
  const hidden = planBoxCategoryLabels(categoryInput({ enabled: false }), groups, 60);
  expect(hidden.footprint).toBe(0);
  expect(hidden.slots).toEqual([0, 1, 2]);
});
it("uses a ten pixel unrotated default gap and retains explicit minSpacing", () => {
  const groups = projection(["AB", "CD", "EF", "GH"]);
  expect(
    planBoxCategoryLabels(categoryInput({ autoRotate: false }), groups, 80).slots,
  ).toEqual([0, 2]);
  expect(
    planBoxCategoryLabels(
      categoryInput({ autoRotate: false, minSpacing: 0 }),
      groups,
      80,
    ).slots,
  ).toEqual([0, 1, 2, 3]);
  expect(
    planBoxCategoryLabels(
      categoryInput({ autoRotate: false, minSpacing: 40 }),
      groups,
      80,
    ).slots.length,
  ).toBe(1);
});
it("measures the navigation window band without changing domain or navigation membership", () => {
  const input = categoryInput();
  const groups = projection(Array.from({ length: 8 }, (_, i) => `FY ${2020 + i}`));
  const cropped = {
    ...input,
    context: {
      ...input.context,
      navigation: {
        enabled: true,
        mini: false,
        theme: {} as any,
        window: { start: 25, end: 75 },
      },
    },
  };
  const full = planBoxCategoryLabels(input, groups, 160);
  const plan = planBoxCategoryLabels(cropped, groups, 160);
  expect(plan.bandwidth).toBe(full.bandwidth * 2);
  expect(plan.slots.every((slot) => slot >= 2 && slot <= 5)).toBe(true);
  expect(groups.groups).toHaveLength(8);
});

it("wraps horizontal categories within the source 30% width budget and bounds failed-wrap reservation", () => {
  const source = categoryInput({ autoRotate: false, rotation: 0 });
  const input: BoxPlotMappingInput = {
    ...source,
    style: {
      ...source.style,
      direction: "horizontal",
      axes: {
        category: {
          ...source.style.axes.category,
          fields: { ...source.style.axes.category.fields, position: "left" },
        },
        number: {
          ...source.style.axes.number,
          appearance: {
            ...source.style.axes.number.appearance,
            fields: {
              ...source.style.axes.number.appearance.fields,
              position: "bottom",
            },
          },
        },
      },
    },
    context: { ...source.context, viewport: { width: 200, height: 500 } },
  };
  const groups = projection(["annual revenue", "unbreakablecategoryword"]);
  const plan = planBoxCategoryLabels(input, groups, 200);
  expect(plan.sizeLimit).toBe(60);
  expect(plan.labels).toEqual(["annual\nrevenue", "unbreakablecategoryword"]);
  expect(plan.footprint).toBe(60);
  const layout = boxPlotAxisLayout(
    input,
    groups,
    { value: [0, 100], empty: false },
    { left: 20, right: 20, top: 20, bottom: 20 },
  );
  expect(layout.grid.left).toBe(80);
  expect(layout.categoryPlan.labels).toEqual(plan.labels);
});

it("uses zero default collision gap after rotation and retains an explicit rotated gap", () => {
  const groups = projection(["AB", "CD", "EF", "GH"]);
  expect(
    planBoxCategoryLabels(categoryInput({ rotation: 45 }), groups, 80).slots,
  ).toEqual([0, 1, 2, 3]);
  expect(
    planBoxCategoryLabels(categoryInput({ rotation: 45, minSpacing: 10 }), groups, 80)
      .slots,
  ).toEqual([0, 2]);
});
