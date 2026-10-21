import { beforeEach, expect, it, vi } from "vitest";
import { translatePie } from "../../../src/components/General/Table/Chart/echarts/pie";
import { pieData } from "../../../src/components/General/Table/Chart/echarts/pieData";
import { pieLayout } from "../../../src/components/General/Table/Chart/echarts/pieLayout";
import {
  calloutPositions,
  pieTitles,
  surroundingRadius,
  withinCircle,
} from "../../../src/components/General/Table/Chart/echarts/pieLabels";
import { pieInput, mains } from "./pie.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 5 }),
  } as CanvasRenderingContext2D),
);
function originalInput() {
  const input = pieInput();
  input.context.viewport = { width: 619, height: 284 };
  input.style.application.title.enabled = false;
  input.style.application.subtitle.enabled = false;
  input.style.application.padding = { top: 20, right: 20, bottom: 20, left: 20 };
  Object.assign(input.style.application.legend, {
    size: 10,
    markerSize: 11,
    itemSpacing: 5,
    horizontalSpacing: 32,
    verticalSpacing: 8,
    spacing: 20,
  });
  input.context.display.legend = String;
  input.context.display.seriesLabel = String;
  input.snapshot.columns[2].label = "Gross Profit";
  input.snapshot.rows = [0, 1, 2, 3].map((i) => ({
    id: `r${i}`,
    category: `FY2025 Q${i + 1}`,
    values: { revenue: [95, 90, 85, 146][i], profit: [40, 42, 39, 74][i] },
  }));
  return input;
}
function translated(input = originalInput()) {
  const result = translatePie(input);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw Error("Expected supported pie");
  return result as any;
}
it("packs the original 619x284 donut as six items on two rows and two reachable pages", () => {
  const result = translated();
  const plan = result.legendPagination;
  expect(plan.pages.map((p: any) => p.items.length)).toEqual([6, 2]);
  const all = plan.pages.flatMap((p: any) => p.items);
  expect(new Set(all.map((i: any) => i.key)).size).toBe(8);
  expect(plan.pages.every((p: any) => p.anchorKey === p.items[0].key)).toBe(true);
  expect(new Set(plan.pages[0].items.map((i: any) => i.bounds.y)).size).toBe(2);
  expect(result.options.legend[0]).toMatchObject({
    id: plan.canonicalLegendId,
    show: false,
    selectedMode: true,
  });
  expect(result.options.legend[0].data).toHaveLength(8);
  expect(result.options.legend.slice(1).filter((l: any) => l.show)).toHaveLength(6);
  expect(result.options.legend[1]).toMatchObject({ itemWidth: 11, itemHeight: 11 });
  expect(result.options.legend[1].data[0].icon).toContain("path://");
  expect(
    result.options.graphic.find((g: any) => g.id === plan.pager.counterId).style.text,
  ).toBe("1 / 2");
});
it("reserves the maximum visible page height and keeps selection-independent legend packing", () => {
  const input = originalInput();
  const first = translated(input);
  input.context.legendSelection = Object.fromEntries(
    first.legendPagination.pages.flatMap((p: any) =>
      p.items.map((i: any) => [i.key, false]),
    ),
  );
  const second = translated(input);
  expect(second.legendPagination).toEqual(first.legendPagination);
  expect(mains(second.options)[0].center).toEqual(mains(first.options)[0].center);
  const rows = first.legendPagination.pages[0].items;
  expect(rows[3].bounds.y - rows[0].bounds.y).toBe(19);
  expect(mains(first.options)[0].center).toEqual([309.5, 167]);
});
it("derives donut titles from descriptors even with no observations and suppresses surrounded titles/callouts", () => {
  const input = originalInput();
  let result = translated(input);
  const titles = () =>
    result.options.graphic.filter(
      (g: any) => g.type === "text" && g.id.endsWith(":title"),
    );
  expect(titles().map((g: any) => g.style.text)).toContain("Revenue");
  expect(mains(result.options)[1].data.every((d: any) => !d.label.show)).toBe(true);
  input.snapshot.rows = [];
  result = translated(input);
  expect(pieData(input).map((ring) => ring.title)).toEqual(["Revenue", "Gross Profit"]);
  expect(titles().map((g: any) => g.style.text)).toContain("Revenue");
  expect(result.legendPagination).toBeUndefined();
  const pie = pieInput("pie");
  pie.snapshot.rows = [];
  expect(
    translated(pie).options.graphic.some((g: any) => g.id.endsWith(":title")),
  ).toBe(false);
});
it("handles constrained dimensions, vertical placement and disabled legends without losing keys", () => {
  for (const position of ["top", "bottom", "left", "right"] as const) {
    const input = originalInput();
    input.style.application.legend.position = position;
    input.style.legendLayout.maxHeight = 30;
    input.style.legendLayout.maxWidth = 180;
    const result = translated(input);
    const items = result.legendPagination.pages.flatMap((p: any) => p.items);
    expect(items).toHaveLength(8);
    expect(
      items.every((i: any) => Object.values(i.bounds).every(Number.isFinite)),
    ).toBe(true);
    expect(
      result.options.legend
        .slice(1)
        .every((l: any) => Object.keys(l.selected).length === 8),
    ).toBe(true);
  }
  const input = originalInput();
  input.style.application.legend.enabled = false;
  const layout = pieLayout(input, pieData(input));
  expect(layout.legendPagination).toBeUndefined();
  expect(translated(input).legendPagination).toBeUndefined();
  expect(mains(translated(input).options)[0].radius[1]).toBeGreaterThan(
    mains(translated().options)[0].radius[1],
  );
});
it("uses all four surrounding-circle corners and geometric ring order while retaining fitting inner text", () => {
  expect(withinCircle({ x: 6, y: 6, width: 2, height: 2 }, 10)).toBe(false);
  expect(withinCircle({ x: -3, y: -4, width: 6, height: 8 }, 5)).toBe(true);
  const input = originalInput();
  const rings = pieData(input);
  const geometry = {
    center: [100, 100] as [number, number],
    radius: 90,
    rings: [
      { inner: 80, outer: 90, drawable: true },
      { inner: 10, outer: 20, drawable: true },
    ],
  };
  expect(surroundingRadius(geometry, 1)).toBe(80);
  expect(surroundingRadius(geometry, 0)).toBeUndefined();
  input.context.display.seriesLabel = () => "Q";
  const small = pieData(input);
  const fitting = calloutPositions(input, small[1], geometry, 1);
  expect(fitting.every((p) => p.show && p.constrained)).toBe(true);
  expect(pieTitles(input, rings, geometry).map((g) => g.style.text)).toEqual([
    "Revenue",
    "Gross Profit",
  ]);
  input.style.series.rotation = 173;
  input.style.series.title.enabled = false;
  const rotated = calloutPositions(input, small[1], geometry, 1);
  expect(rotated[0].x).not.toBe(fitting[0].x);
  expect(rotated.every((p) => p.show)).toBe(true);
  input.context.display.seriesLabel = () => "Long financial category".repeat(20);
  expect(
    calloutPositions(input, pieData(input)[1], geometry, 1).every((p) => !p.show),
  ).toBe(true);
});
it("keeps long legend entries reachable within configured width with their complete accessible labels", () => {
  const input = originalInput();
  input.context.display.legend = (value) => `${value}: ${"long caption ".repeat(30)}`;
  input.style.legendLayout.maxWidth = 240;
  const result = translated(input);
  const items = result.legendPagination.pages.flatMap((p: any) => p.items);
  expect(items).toHaveLength(8);
  expect(
    items.every((i: any) => i.bounds.width <= 240 && i.label.includes("long caption")),
  ).toBe(true);
  expect(
    result.options.legend
      .slice(1)
      .every((l: any) => l.textStyle.overflow === "truncate"),
  ).toBe(true);
});
it("hides a legend that cannot fit unless both layout dimensions explicitly authorize forced cells", () => {
  const input = originalInput();
  input.style.legendLayout.maxHeight = 1;
  const result = translated(input);
  expect(result.legendPagination).toBeUndefined();
  expect(result.options.legend).toHaveLength(1);
  expect(result.options.legend[0]).toMatchObject({ show: false });
  expect(result.options.legend[0].data).toHaveLength(8);
  const withoutLegend = originalInput();
  withoutLegend.style.application.legend.enabled = false;
  expect(mains(result.options)[0].radius).toEqual(
    mains(translated(withoutLegend).options)[0].radius,
  );
  const widthOnly = originalInput();
  delete widthOnly.style.legendLayout.maxHeight;
  widthOnly.style.legendLayout.maxWidth = 1;
  expect(translated(widthOnly).legendPagination).toBeUndefined();
  input.style.legendLayout.maxHeight = 50;
  expect(
    translated(input).legendPagination.pages.map((page: any) => page.items.length),
  ).toEqual([6, 2]);
  input.style.legendLayout.maxHeight = 1;
  input.style.legendLayout.maxWidth = 1;
  const forced = translated(input);
  expect(forced.legendPagination.pages).toHaveLength(8);
  expect(
    forced.legendPagination.pages.every((page: any) => page.items.length === 1),
  ).toBe(true);
});
