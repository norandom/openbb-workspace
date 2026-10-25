import { type ECElementEvent, init, setPlatformAPI } from "echarts";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveHierarchyAppearance } from "../../../src/components/General/Table/Chart/application/hierarchyAppearance";
import { projectHierarchySetup } from "../../../src/components/General/Table/Chart/application/hierarchySetupProjection";
import type { HierarchySnapshot } from "../../../src/components/General/Table/Chart/compatibility/hierarchyContracts";
import { fallbackDisplay } from "../../../src/components/General/Table/Chart/echarts/cartesianDisplay";
import { translateHierarchy } from "../../../src/components/General/Table/Chart/echarts/hierarchy";
import { projectHierarchyHover } from "../../../src/components/General/Table/Chart/echarts/hierarchyChrome";
import { createHierarchyHoverBinding } from "../../../src/components/General/Table/Chart/echarts/hierarchyHoverBinding";
import type { HierarchyMappingInput } from "../../../src/components/General/Table/Chart/echarts/hierarchyModel";

function input(family: "treemap" | "sunburst", tooltip = true): HierarchyMappingInput {
  const source: HierarchySnapshot = {
    kind: "hierarchy",
    sourceMode: "flat",
    stateAddress: "hover",
    dataRevision: 1,
    categoryColumnIds: ["group", "leaf"],
    selectedColumnIds: ["group", "leaf", "size", "color"],
    columns: [
      { id: "group", label: "Group", role: "category" },
      { id: "leaf", label: "Leaf", role: "category" },
      { id: "size", label: "Amount", role: "number" },
      { id: "color", label: "Rate", role: "number" },
    ],
    originalModel: {},
    selectedRange: {},
    rows: [
      {
        id: "a",
        rawCategoryValues: ["Group", "Measured"],
        categoryPath: ["Group", "Measured"],
        values: { size: 4, color: 50 },
      },
      {
        id: "b",
        rawCategoryValues: ["Group", "Missing"],
        categoryPath: ["Group", "Missing"],
        values: { size: 8, color: null },
      },
    ],
  };
  const projection = projectHierarchySetup(source, {
    categoryIds: source.categoryColumnIds,
    seriesIds: ["size", "color"],
  });
  const style = resolveHierarchyAppearance({
    family,
    baseline: {
      stateAddress: "hover",
      chartType: family,
      model: {},
      options: {
        [family]: {
          tooltip: { enabled: tooltip },
        },
      },
    },
    generated: {},
    precision: 2,
    assignments: { sizeId: "size", colorId: "color" },
    theme: {
      name: "ag-default",
      mode: "light",
      overrides: {},
      colors: {
        base: "ag-default",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#111111",
        chartBackgroundColor: "#ffffff",
      },
      palette: { fills: ["#ff0000"], strokes: ["#0000ff"] },
    },
    themePalette: {
      fills: ["#ff0000"],
      strokes: ["#0000ff"],
      hierarchyColors: ["#dddddd"],
      secondHierarchyColors: ["#cccccc"],
      colorRange: ["#ff0000", "#0000ff"],
    },
  });
  if (projection.status !== "ready" || !style.valid)
    throw Error("Invalid hover fixture");
  return {
    family,
    projection: projection.value,
    style: style.value,
    context: { viewport: { width: 640, height: 480 }, display: fallbackDisplay(2) },
  };
}
function options(value: HierarchyMappingInput) {
  const result = translateHierarchy(value);
  if (result.status !== "supported") throw Error("Unsupported hover fixture");
  return result.options;
}
function paintedMarkers(chart: ReturnType<typeof init>) {
  const svg = new DOMParser().parseFromString(
    chart.renderToSVGString(),
    "image/svg+xml",
  );
  return svg.querySelectorAll("polygon").length;
}
function event(id: string): ECElementEvent {
  return { seriesId: "qopenbb-hierarchy", data: { id } } as ECElementEvent;
}

beforeEach(() =>
  setPlatformAPI({ measureText: (text) => ({ width: String(text).length * 6 }) }),
);

describe.each([
  "treemap",
  "sunburst",
] as const)("native %s gradient hover", (family) => {
  it.each([
    "initial",
    "tooltip-off replacement",
  ])("paints the first %s hover before any mouseout", (stage) => {
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 480,
    });
    const failures: unknown[] = [];
    const binding = createHierarchyHoverBinding(
      chart,
      () => true,
      (error) => failures.push(error),
    );
    let value = input(family);
    try {
      chart.setOption(options(value), { notMerge: true });
      binding.setPlan(projectHierarchyHover(value));
      if (stage === "tooltip-off replacement") {
        const initial = value.projection.root.children[0].children[0];
        chart.trigger("mouseover", event(initial.id));
        binding.setPlan(undefined);
        value = input(family, false);
        chart.setOption(options(value), { notMerge: true });
        binding.setPlan(projectHierarchyHover(value));
        expect(chart.getOption().tooltip).toMatchObject([{ show: false }]);
      }
      expect(paintedMarkers(chart)).toBe(0);
      const parent = value.projection.root.children[0];
      const [measured, missing] = parent.children;
      const hover = (id: string) => chart.trigger("mouseover", event(id));
      hover(measured.id);
      expect(
        paintedMarkers(chart),
        "the first leaf hover must repaint the hidden placeholder",
      ).toBe(1);
      expect(chart.getOption().tooltip).toMatchObject([
        { show: value.style.tooltip.enabled },
      ]);
      hover(missing.id);
      expect(paintedMarkers(chart)).toBe(0);
      hover(measured.id);
      expect(paintedMarkers(chart)).toBe(1);
      hover(parent.id);
      expect(paintedMarkers(chart)).toBe(0);
      hover(measured.id);
      chart.trigger("mouseout", event(measured.id));
      expect(paintedMarkers(chart)).toBe(0);
      hover(measured.id);
      expect(paintedMarkers(chart)).toBe(1);
      chart.trigger("globalout", event(measured.id));
      expect(paintedMarkers(chart)).toBe(0);
      expect(failures).toEqual([]);
    } finally {
      binding.dispose();
      chart.dispose();
    }
  });
});
