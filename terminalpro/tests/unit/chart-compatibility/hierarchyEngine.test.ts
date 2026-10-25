import { init } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveHierarchyAppearance } from "../../../src/components/General/Table/Chart/application/hierarchyAppearance";
import { projectHierarchySetup } from "../../../src/components/General/Table/Chart/application/hierarchySetupProjection";
import type { HierarchySnapshot } from "../../../src/components/General/Table/Chart/compatibility/hierarchyContracts";
import { fallbackDisplay } from "../../../src/components/General/Table/Chart/echarts/cartesianDisplay";
import { translateHierarchy } from "../../../src/components/General/Table/Chart/echarts/hierarchy";
import {
  hierarchyChrome,
  projectHierarchyHover,
} from "../../../src/components/General/Table/Chart/echarts/hierarchyChrome";
import {
  hierarchyColorScale,
  interpolateHierarchyOklch,
} from "../../../src/components/General/Table/Chart/echarts/hierarchyColor";
import { prepareHierarchyData } from "../../../src/components/General/Table/Chart/echarts/hierarchyData";
import type { HierarchyMappingInput } from "../../../src/components/General/Table/Chart/echarts/hierarchyModel";
import { hierarchyTooltip } from "../../../src/components/General/Table/Chart/echarts/hierarchyTooltip";

function input(
  family: "treemap" | "sunburst" = "treemap",
  colors = true,
): HierarchyMappingInput {
  const font = {
    font: "Arial",
    weight: "normal",
    size: 12,
    color: "#222",
    fontWeight: "normal",
    fontStyle: "normal",
  };
  const label = {
    ...font,
    enabled: true,
    spacing: 2,
    minimumFontSize: 8,
    wrapping: "on-space" as const,
    overflowStrategy: "ellipsis" as const,
  };
  const paint = {
    fillOpacity: 1,
    strokeWidth: 0,
    strokeOpacity: 1,
    cornerRadius: 0,
    textAlign: "left" as const,
  };
  const source: HierarchySnapshot = {
    kind: "hierarchy",
    sourceMode: "flat",
    stateAddress: "s",
    dataRevision: 1,
    categoryColumnIds: ["group", "leaf"],
    selectedColumnIds: ["group", "leaf", "size", "color"],
    columns: [
      { id: "group", label: "Group", role: "category" },
      { id: "leaf", label: "Leaf", role: "category" },
      { id: "size", label: "Amount", role: "number", unit: "USD", scale: 1 },
      { id: "color", label: "Rate", role: "number" },
    ],
    originalModel: {},
    selectedRange: {},
    rows: [
      {
        id: "zero",
        rawCategoryValues: ["Zero", "Zero"],
        categoryPath: ["Zero", "Zero"],
        values: { size: 0, color: -100 },
      },
      {
        id: "a",
        rawCategoryValues: ["A", "<Alpha>"],
        categoryPath: ["A", "<Alpha>"],
        values: { size: 4, color: 50 },
      },
      {
        id: "b",
        rawCategoryValues: ["B", "Beta"],
        categoryPath: ["B", "Beta"],
        values: { size: 8, color: null },
      },
      {
        id: "c",
        rawCategoryValues: ["C", "Gamma"],
        categoryPath: ["C", "Gamma"],
        values: { size: 8, color: 100 },
      },
    ],
  };
  const p = projectHierarchySetup(source, {
    categoryIds: source.categoryColumnIds,
    seriesIds: colors ? ["size", "color"] : ["size"],
  });
  if (p.status !== "ready") throw Error("Invalid fixture");
  const base = {
    common: { textColor: "#222", fontFamily: "Arial", fontSize: 12, precision: 2 },
    application: {
      title: { ...font, enabled: true, text: "Accounts", spacing: 5 },
      subtitle: { ...font, enabled: false, text: "", spacing: 3 },
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      background: { visible: true, fill: "#fff" },
    },
    tooltip: { enabled: true, mode: "single" as const },
    palette: {
      fills: ["#111111", "#222222", "#333333", "#444444"],
      strokes: ["#aaa"],
      hierarchyColors: ["#eee", "#ddd"],
      secondHierarchyColors: ["#ccc", "#bbb"],
      colorRange: ["#ff0000", "#0000ff"],
    },
    gradientLegend: {
      enabled: true,
      position: "right" as const,
      reverseOrder: false,
      spacing: 20,
      gradient: { thickness: 16, preferredLength: 200 },
      label: font,
    },
  };
  return {
    family,
    projection: p.value,
    context: { viewport: { width: 640, height: 480 }, display: fallbackDisplay(2) },
    style:
      family === "treemap"
        ? {
            ...base,
            family,
            group: { ...paint, padding: 4, gap: 2, interactive: true, label },
            tile: { ...paint, padding: 3, gap: 1, verticalAlign: "top", label },
          }
        : {
            ...base,
            family,
            series: {
              label,
              fillOpacity: 1,
              strokeWidth: 0,
              strokeOpacity: 1,
              cornerRadius: 0,
              sectorSpacing: 2,
              padding: 3,
            },
          },
  };
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);

describe("inactive native hierarchy adapter", () => {
  it("keeps original palette identity and zero-weight color extent before stable Treemap sorting", () => {
    const i = input();
    const before = JSON.stringify(i);
    const m = prepareHierarchyData(i);
    expect(m.extent).toEqual([-100, 100]);
    expect(m.data.map((n) => n.name)).toEqual(["B", "C", "A"]);
    expect(m.data[0].children?.[0].itemStyle?.color).toBe("#333333");
    expect(m.data[2].id).toBe(i.projection.root.children[1].id);
    m.data[0].name = "native mutation";
    expect(JSON.stringify(i)).toBe(before);
  });
  it("retains Sunburst source order and native geometry defaults without synthetic root", () => {
    const i = input("sunburst");
    const r = translateHierarchy(i);
    expect(r.status).toBe("supported");
    if (r.status !== "supported") return;
    const s = (r.options.series as any[])[0];
    expect(s).toMatchObject({
      type: "sunburst",
      sort: null,
      nodeClick: false,
      startAngle: 90,
      stillShowZeroSum: false,
    });
    expect(s.data.map((n: any) => n.name)).toEqual(["A", "B", "C"]);
    expect(s.radius[0]).toBe(0);
    expect(s.radius[1]).toBeGreaterThan(100);
  });
  it("separates equal/missing measured domains from paint fallback and hover", () => {
    let i = input();
    const nodes = i.projection.root.children;
    const equal = nodes.map((n) => ({
      ...n,
      children: n.children.map((c) => ({
        ...c,
        datum: { ...c.datum!, values: { size: c.ownWeight, color: 50 } },
      })),
    }));
    i = {
      ...i,
      projection: { ...i.projection, root: { ...i.projection.root, children: equal } },
    };
    const m = prepareHierarchyData(i);
    expect(m.extent).toEqual([50, 50]);
    expect(m.paintDomain).toEqual([0, 1]);
    const chrome = hierarchyChrome(i, m);
    const plan = projectHierarchyHover(i)!;
    const marker = plan.project(equal[1].children[0].id)!;
    expect(marker.y).toBeCloseTo(chrome.legend!.y + chrome.legend!.length / 2);
    expect(plan.project(equal[1].id)).toBeUndefined();
    const missing = equal.map((n) => ({
      ...n,
      children: n.children.map((c) => ({
        ...c,
        datum: { ...c.datum!, values: { size: c.ownWeight, color: null } },
      })),
    }));
    const missingInput = {
      ...i,
      projection: {
        ...i.projection,
        root: { ...i.projection.root, children: missing },
      },
    };
    const mm = prepareHierarchyData(missingInput);
    expect(mm.extent).toBeUndefined();
    expect(hierarchyChrome(missingInput, mm).legend).toBeDefined();
    expect(
      projectHierarchyHover(missingInput)!.project(missing[1].children[0].id),
    ).toBeUndefined();
    expect(
      hierarchyChrome(
        input("treemap", false),
        prepareHierarchyData(input("treemap", false)),
      ).legend,
    ).toBeUndefined();
  });
  it("escapes raw financial tooltip observations and applies family modes/false", () => {
    const i = input();
    const m = prepareHierarchyData(i);
    const parent = m.data.find((n) => n.name === "A")!;
    const leaf = parent.children![0];
    const tooltip = hierarchyTooltip(i, m);
    expect(tooltip.formatter({ data: leaf })).toContain("&lt;Alpha&gt;");
    expect(tooltip.formatter({ data: leaf })).toContain("4.00");
    expect(tooltip.formatter({ data: parent })).toBe("A");
    expect(tooltip.formatter({ data: { id: "unknown" } })).toBe("");
    const compact = {
      ...i,
      family: "sunburst" as const,
      style: {
        ...input("sunburst").style,
        tooltip: { enabled: false, mode: "compact" as const },
      },
    };
    const t = hierarchyTooltip(compact, m);
    expect(t.show).toBe(false);
    expect(t.formatter({ data: leaf })).not.toContain("4.00");
    expect(t.formatter({ data: parent })).toBe("A<br/>A");
  });
  it.each([
    "treemap",
    "sunburst",
  ] as const)("renders real %s native paths with finite bounds", (family) => {
    const i = input(family);
    const r = translateHierarchy(i);
    expect(r.status).toBe("supported");
    if (r.status !== "supported") return;
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 480,
    });
    try {
      chart.setOption(r.options);
      const svg = chart.renderToSVGString();
      expect(svg).not.toMatch(/NaN|Infinity/);
      expect(svg).toContain("Accounts");
      expect(
        chart
          .getZr()
          .storage.getDisplayList()
          .filter((el) => el.type === (family === "treemap" ? "rect" : "sector"))
          .length,
      ).toBeGreaterThan(3);
    } finally {
      chart.dispose();
    }
  });
  it("returns blank zero geometry and a safe invalid-input envelope", () => {
    const i = input();
    const zero = {
      ...i,
      projection: {
        ...i.projection,
        root: { ...i.projection.root, subtreeWeight: 0, children: [] },
      },
    };
    expect(prepareHierarchyData(zero).data).toEqual([]);
    expect(
      translateHierarchy({
        ...i,
        context: { ...i.context, viewport: { width: Number.NaN, height: 20 } },
      }).status,
    ).toBe("invalid");
    expect(
      translateHierarchy({
        ...i,
        context: { ...i.context, viewport: { width: -1, height: 20 } },
      }).status,
    ).toBe("invalid");
    expect(
      translateHierarchy({
        ...i,
        context: { ...i.context, viewport: { width: 0, height: 0 } },
      }).status,
    ).toBe("supported");
  });
});

it("preserves color endpoints and original sampled OKLCH ramp", () => {
  const scale = hierarchyColorScale(["#ff0000", "#0000ff"], [0, 100]);
  expect(scale.color(-1)).toBe("#ff0000");
  expect(scale.color(101)).toBe("#0000ff");
  expect(scale.stops).toHaveLength(21);
  expect(scale.stops[10].offset).toBeCloseTo(0.5);
  expect(scale.color(50)).toBe(scale.stops[10].color);
});

it.each([
  ["#ff0000", "#0000ff", "rgb(186, 0, 194)"],
  ["rgba(255, 0, 0, 0)", "rgba(0, 0, 255, 0.8)", "rgba(186, 0, 194, 0.4)"],
  ["#000000", "#ffffff", "rgb(99, 99, 99)"],
  ["#808080", "#ff00ff", "rgb(195, 103, 192)"],
  ["#ff0080", "#ff8000", "rgb(255, 79, 69)"],
  ["#ff0000", "#00ffff", "rgb(184, 190, 0)"],
  ["#00ff00", "#0000ff", "rgb(0, 187, 227)"],
])("matches pinned original Community ColorScale midpoint %s/%s", (a, b, expected) => {
  // Literal reference samples: Community12.1.1 SHA256 e9b1b8be8d27ffc1f2c66e715b863b36d5f3aecef0c79e18cc0101a440956df4.
  expect(hierarchyColorScale([a, b], [0, 1]).color(0.5)).toBe(expected);
});

it("uses retained eight-leaf AAPL FY2025 USD observations without adding reconciliation revenue", () => {
  const i = input("treemap", false);
  const amounts = [
    [66025000000, 58275000000],
    [50492000000, 44867000000],
    [50318000000, 43718000000],
    [54125000000, 48341000000],
  ];
  const source = {
    ...i.projection.source,
    rows: amounts.flatMap((values, quarter) =>
      values.map((size, component) => ({
        id: `${quarter}-${component}`,
        rawCategoryValues: [
          `Q${quarter + 1}`,
          component ? "Gross profit" : "Cost of revenue",
        ],
        categoryPath: [
          `Q${quarter + 1}`,
          component ? "Gross profit" : "Cost of revenue",
        ],
        values: { size },
      })),
    ),
  };
  const p = projectHierarchySetup(source, i.projection.selection);
  expect(p.status).toBe("ready");
  if (p.status !== "ready") return;
  const m = prepareHierarchyData({ ...i, projection: p.value });
  expect(m.data.map((n) => n.value)).toEqual([
    124300000000, 102466000000, 95359000000, 94036000000,
  ]);
  expect(m.data.flatMap((n) => n.children ?? [])).toHaveLength(8);
  expect(m.data.reduce((sum, n) => sum + n.value, 0)).toBe(416161000000);
  expect(m.extent).toBeUndefined();
});

function nativeText(chart: ReturnType<typeof init>) {
  return chart
    .getZr()
    .storage.getDisplayList()
    .filter((el) => el.type === "tspan")
    .map((el) => ({ text: String(el.style.text ?? ""), size: el.style.fontSize }));
}
function paintNative(chart: ReturnType<typeof init>, i: HierarchyMappingInput) {
  const result = translateHierarchy(i);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw Error("Invalid native input");
  chart.setOption(result.options, { notMerge: true });
  expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
}
function composedTilePadding(padding: number): HierarchyMappingInput {
  const base = input("treemap", false);
  const appearance = resolveHierarchyAppearance({
    family: "treemap",
    baseline: {
      stateAddress: "s",
      chartType: "treemap",
      model: {},
      options: {
        treemap: {
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          series: { tile: { padding } },
        },
      },
    },
    generated: {},
    precision: 2,
    assignments: { sizeId: "size" },
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
      palette: { fills: ["#123456"], strokes: ["#654321"] },
    },
    themePalette: {
      fills: ["#123456"],
      strokes: ["#654321"],
      hierarchyColors: ["#dddddd"],
      secondHierarchyColors: ["#cccccc"],
      colorRange: ["#ff0000", "#0000ff"],
    },
  });
  if (!appearance.valid) throw Error(appearance.error);
  const leaf = {
    ...base.projection.root.children[1].children[0],
    label: "Financial Instrument",
  };
  return {
    ...base,
    style: appearance.value,
    context: { ...base.context, viewport: { width: 126, height: 72 } },
    projection: {
      ...base.projection,
      root: {
        ...base.projection.root,
        subtreeWeight: leaf.subtreeWeight,
        children: [leaf],
      },
    },
  };
}
function nativeRectangles(chart: ReturnType<typeof init>) {
  return chart
    .getZr()
    .storage.getDisplayList()
    .filter((element) => element.type === "rect")
    .map((element) => ({
      ...element.getBoundingRect(),
      transform: Array.from(element.getComputedTransform() ?? []),
    }));
}
it("applies composed Tile Padding independently of default label boxing to painted text", () => {
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 126,
    height: 72,
  });
  try {
    const samples = [0, 3, 10].map((padding) => {
      const i = composedTilePadding(padding);
      expect(i.style.family === "treemap" && i.style.tile.label.padding).toBe(8);
      paintNative(chart, i);
      return {
        padding,
        text: nativeText(chart),
        geometry: nativeRectangles(chart),
        weight: prepareHierarchyData(i).data[0].value,
      };
    });
    expect(samples.map((sample) => sample.geometry)).toEqual(
      samples.map(() => samples[0].geometry),
    );
    expect(samples.map((sample) => sample.weight)).toEqual([4, 4, 4]);
    expect(samples.map((sample) => sample.text.map((span) => span.text))).toEqual([
      ["Financial Instrument"],
      ["Financial", "Instrument"],
      ["Financial", "Instrument"],
    ]);
    expect(Number(samples[2].text[0].size)).toBeLessThan(
      Number(samples[1].text[0].size),
    );
    for (const padding of [3, 0]) {
      paintNative(chart, composedTilePadding(padding));
      expect(nativeText(chart)).toEqual(
        samples.find((sample) => sample.padding === padding)!.text,
      );
    }
    chart.resize({ width: 20, height: 20 });
    const tiny = composedTilePadding(10);
    paintNative(chart, {
      ...tiny,
      context: { ...tiny.context, viewport: { width: 20, height: 20 } },
    });
    expect(nativeText(chart)).toEqual([]);
    chart.resize({ width: 126, height: 72 });
    paintNative(chart, composedTilePadding(0));
    expect(nativeText(chart)).toEqual(samples[0].text);
  } finally {
    chart.dispose();
  }
});
it("fits native labels after layout, restores hidden labels on resize and isolates two chart instances", () => {
  const base = input("treemap", false);
  if (base.style.family !== "treemap") throw Error("Fixture");
  const nodes = base.projection.root.children.map((n) => ({
    ...n,
    children: n.children.map((c) => ({
      ...c,
      label: "ExtraordinaryFinancialInstrument",
    })),
  }));
  const style = {
    ...base.style,
    group: {
      ...base.style.group,
      label: { ...base.style.group.label, enabled: false },
    },
    tile: {
      ...base.style.tile,
      label: {
        ...base.style.tile.label,
        wrapping: "hyphenate" as const,
        overflowStrategy: "hide" as const,
      },
    },
    application: {
      ...base.style.application,
      title: { ...base.style.application.title, enabled: false },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  };
  const large = {
    ...base,
    style,
    projection: {
      ...base.projection,
      root: { ...base.projection.root, children: nodes },
    },
  };
  const tiny = {
    ...large,
    context: { ...large.context, viewport: { width: 20, height: 20 } },
  };
  const first = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 20,
    height: 20,
  });
  const second = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 640,
    height: 480,
  });
  try {
    paintNative(first, tiny);
    expect(nativeText(first).some((t) => t.text.includes("Extraordinary"))).toBe(false);
    paintNative(second, large);
    const independent = nativeText(second);
    expect(independent.some((t) => t.text.includes("Extraordinary"))).toBe(true);
    first.resize({ width: 640, height: 480 });
    paintNative(first, large);
    expect(nativeText(first).some((t) => t.text.includes("Extraordinary"))).toBe(true);
    expect(nativeText(second)).toEqual(independent);
    const narrow = {
      ...large,
      context: { ...large.context, viewport: { width: 140, height: 480 } },
    };
    first.resize({ width: 140, height: 480 });
    paintNative(first, narrow);
    expect(nativeText(first).some((t) => t.text.endsWith("-"))).toBe(true);
  } finally {
    first.dispose();
    second.dispose();
  }
});

it("keeps no-size unlabeled row identity and count weighting", () => {
  const base = input();
  const source = {
    ...base.projection.source,
    categoryColumnIds: [],
    columns: base.projection.source.columns.filter((c) => c.role === "number"),
    selectedColumnIds: ["size", "color"],
    rows: base.projection.source.rows.map((r) => ({
      ...r,
      rawCategoryValues: [],
      categoryPath: [],
    })),
  };
  const p = projectHierarchySetup(source, { categoryIds: [], seriesIds: [] });
  expect(p.status).toBe("ready");
  if (p.status !== "ready") return;
  const m = prepareHierarchyData({ ...base, projection: p.value });
  expect(m.data).toHaveLength(4);
  expect(m.data.map((n) => [n.name, n.value])).toEqual([
    ["", 1],
    ["", 1],
    ["", 1],
    ["", 1],
  ]);
  expect(new Set(m.data.map((n) => n.id)).size).toBe(4);
});

it("preserves the original strict 180-degree hue tie and finite extreme signed color interpolation", () => {
  expect(
    interpolateHierarchyOklch(
      { mode: "oklch", l: 0.6, c: 0.1, h: 10 },
      { mode: "oklch", l: 0.6, c: 0.1, h: 190 },
      0.5,
    ),
  ).toBe("rgb(142, 129, 51)");
  expect(hierarchyColorScale(["#ff0000", "#0000ff"], [-1e308, 1e308]).color(0)).toBe(
    "rgb(186, 0, 194)",
  );
});

it.each([
  "left",
  "right",
  "top",
  "bottom",
] as const)("uses the same %s legend domain for labels, gradient direction and hover", (position) => {
  const base = input();
  const i = {
    ...base,
    style: {
      ...base.style,
      tooltip: { ...base.style.tooltip, enabled: false },
      gradientLegend: { ...base.style.gradientLegend, position },
    },
  };
  const model = prepareHierarchyData(i);
  const legend = hierarchyChrome(i, model).legend!;
  const leaf = i.projection.root.children[1].children[0];
  const marker = projectHierarchyHover(i)!.project(leaf.id)!;
  const reversed = {
    ...i,
    style: {
      ...i.style,
      gradientLegend: { ...i.style.gradientLegend, reverseOrder: true },
    },
  };
  const opposite = projectHierarchyHover(reversed)!.project(leaf.id)!;
  expect(
    [marker.x, marker.y, marker.rotation, marker.size].every(Number.isFinite),
  ).toBe(true);
  expect(legend.vertical ? marker.y + opposite.y : marker.x + opposite.x).toBeCloseTo(
    (legend.vertical ? legend.y : legend.x) * 2 + legend.length,
  );
  expect(marker.rotation).toBe(legend.vertical ? Math.PI / 2 : Math.PI);
  expect(projectHierarchyHover(i)!.project("unknown")).toBeUndefined();
});

it("distinguishes retained unused advanced paint from an active adapter obligation", () => {
  const base = input();
  const saved = { type: "image" as const, url: "https://example.invalid/fill.png" };
  if (base.style.family !== "treemap") throw Error("Fixture");
  const unused = {
    ...base,
    style: {
      ...base.style,
      group: {
        ...base.style.group,
        label: { ...base.style.group.label, enabled: false, fill: saved },
      },
    },
  };
  expect(translateHierarchy(unused).status).toBe("supported");
  const active = {
    ...base,
    style: { ...base.style, group: { ...base.style.group, fill: saved } },
  };
  expect(translateHierarchy(active).status).toBe("unsupported");
  const invalid = {
    ...base,
    style: { ...base.style, tile: { ...base.style.tile, gap: -1 } },
  };
  expect(translateHierarchy(invalid).status).toBe("invalid");
});

it.each([
  ["treemap", { top: 2, right: 7, bottom: 3, left: 11 }, [2, 7, 3, 11]],
  ["sunburst", { top: 2, right: 7, bottom: 3, left: 11 }, [2, 7, 3, 11]],
  ["treemap", 0, 0],
  ["sunburst", 0, 0],
] as const)("renders %s explicit label padding %j as native boxing", (family, padding, expected) => {
  const base = input(family, false);
  const style =
    base.style.family === "treemap"
      ? {
          ...base.style,
          tile: {
            ...base.style.tile,
            label: { ...base.style.tile.label, padding, fill: "#ffff00" },
          },
        }
      : {
          ...base.style,
          series: {
            ...base.style.series,
            label: { ...base.style.series.label, padding, fill: "#ffff00" },
          },
        };
  const i = { ...base, style };
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 640,
    height: 480,
  });
  try {
    paintNative(chart, i);
    expect(prepareHierarchyData(i).data[0].children![0].label.padding).toEqual(
      expected,
    );
    expect(chart.renderToSVGString()).toContain("#ffff00");
    expect(
      nativeText(chart).some(
        (t) => t.text.includes("Alpha") || t.text.includes("Beta"),
      ),
    ).toBe(true);
    for (const element of chart.getZr().storage.getDisplayList()) {
      const rect = element.getBoundingRect();
      expect([rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)).toBe(
        true,
      );
    }
  } finally {
    chart.dispose();
  }
});
