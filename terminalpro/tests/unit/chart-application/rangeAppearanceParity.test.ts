import { init, type LegendComponentOption } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeRangeApplication } from "../../../src/components/General/Table/Chart/echarts/rangeApplication";
import type { RangeApplicationInput } from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
import { rangeLabelsFit } from "../../../src/components/General/Table/Chart/echarts/rangeLabelLayout";
import { rangeInput } from "../chart-compatibility/rangeBar.fixtures";

const labels = [
  "FY 2016 (1/4 quarters)",
  ...Array.from({ length: 9 }, (_, n) => `FY ${2017 + n}`),
  "FY 2026 (3/4 quarters)",
];
function input(family: "rangeBar" | "rangeArea" = "rangeArea"): RangeApplicationInput {
  const core = rangeInput();
  return {
    family,
    snapshot: {
      ...core.snapshot,
      rangeCategory: {
        categoryColumnId: "period",
        columnChartDataType: null,
        firstCategoryIsDate: false,
        kind: "category",
      },
      rows: labels.flatMap((category, n) => [
        { id: `low${n}`, category, values: { amount: 20 + n, other: 10 + n } },
        { id: `high${n}`, category, values: { amount: 80 + n, other: 40 + n } },
      ]),
    },
    baseline: { stateAddress: "range", chartType: family, model: {}, options: {} },
    generated: {},
    precision: 2,
    display: { ...core.context.display, category: (value) => String(value) },
    viewport: { width: 619, height: 592 },
    axisRuntime: {
      categoryAxisType: "category",
      axes: [
        {
          id: "category",
          type: "category",
          direction: "x",
          position: "bottom",
          options: {},
        },
        { id: "number", type: "number", direction: "y", position: "left", options: {} },
      ],
    },
    theme: {
      name: "selected",
      mode: "light",
      overrides: {
        common: {
          axes: {
            category: { label: { fontSize: 11 } },
            number: { label: { fontSize: 11 } },
          },
          legend: {
            position: "top",
            item: { marker: { size: 11 }, label: { fontSize: 11 } },
          },
        },
        "range-area": { series: { marker: { shape: "square", strokeWidth: 1 } } },
      },
      palette: { fills: ["#112233", "#445566"], strokes: ["#778899", "#aabbcc"] },
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#fafafa",
      },
    },
  };
}
function composed(source: RangeApplicationInput) {
  const result = composeRangeApplication(source);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
function svg(source: RangeApplicationInput) {
  const result = composed(source);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...source.viewport,
  });
  chart.setOption(result.options);
  return { result, chart };
}
function iconSvg(icon: string) {
  return new DOMParser().parseFromString(
    decodeURIComponent(icon.slice(icon.indexOf(",") + 1)),
    "image/svg+xml",
  );
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);

describe("Range original presentation", () => {
  it("renders all fiscal-year Area labels as single rotated lines and reaches both plot edges", () => {
    const { result, chart } = svg(input());
    try {
      expect(result.category.ticks.map((t) => t.label)).toEqual(labels);
      expect(result.mapping.style.categoryAxis.labels.rotation).toBe(-25);
      expect(result.category.fullExtent[0]).toBeCloseTo(0);
      expect(result.category.fullExtent[1]).toBe(10);
      const x = (slot: number) =>
        (chart.convertToPixel({ gridIndex: 0 }, [slot, 20]) as number[])[0];
      expect(x(0)).toBeCloseTo(result.plot.left);
      expect(x(10)).toBeCloseTo(result.plot.left + result.plot.width);
      const markup = chart.renderToSVGString();
      for (const label of labels) expect(markup).toContain(label);
      expect(markup).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  });

  it("uses Bar band width for wrapping without changing grouped spacing", () => {
    const result = composed(input("rangeBar"));
    expect(result.category.fullExtent).toEqual([-0.5, 10.5]);
    expect(result.mapping.style.band).toEqual({
      paddingInner: 0.3,
      paddingOuter: 0.15,
      groupPaddingInner: 0.2,
    });
    expect(result.category.ticks.find((t) => t.coordinate === 0)?.label).toBe(
      labels[0],
    );
    expect(result.category.ticks.find((t) => t.coordinate === 2)?.label).toBe(
      "FY\n2018",
    );
    const base = input("rangeBar");
    expect(
      composeRangeApplication({
        ...base,
        baseline: {
          ...base.baseline,
          options: { "range-bar": { axes: { category: { paddingInner: 1 } } } },
        },
      }).status,
    ).toBe("invalid");
  });

  it("retains explicit padding, reverse, rotation, wrapping and collision policies", () => {
    const base = input();
    const result = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-area": {
            axes: {
              category: {
                paddingInner: 0.3,
                paddingOuter: 0.2,
                reverse: true,
                label: { rotation: 17, wrapping: "never", avoidCollisions: false },
              },
            },
          },
        },
      },
    });
    expect(result.category.fullExtent).toEqual([-0.55, 10.55]);
    expect(result.category.reverse).toBe(true);
    expect(result.category.ticks.map((t) => t.label)).toEqual(labels);
    expect(result.mapping.style.categoryAxis.labels.rotation).toBe(17);
    expect(result.appearance.axes.category.labels).toMatchObject({
      wrapping: "never",
      avoidCollisions: false,
    });
    const wrapped = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-area": {
            axes: {
              category: {
                paddingInner: 0.3,
                label: { rotation: 17, wrapping: "always", minSpacing: 0 },
              },
            },
          },
        },
      },
    });
    expect(wrapped.mapping.style.categoryAxis.labels.rotation).toBe(17);
    expect(wrapped.appearance.axes.category.labels).toMatchObject({
      wrapping: "always",
      minSpacing: 0,
    });
    expect(wrapped.category.ticks[0].label).toContain("\n");
  });

  it("wraps against full BandScale width for deep windows and singleton categories", () => {
    const base = input("rangeBar");
    const category = "long ".repeat(20).trim();
    const cropped = composed({
      ...base,
      visibleRange: [0.04, 0.06],
      snapshot: {
        ...base.snapshot,
        rows: base.snapshot.rows.map((row, index) =>
          index < 2 ? { ...row, category } : row,
        ),
      },
    });
    expect(cropped.category.ticks).toEqual([{ coordinate: 0, label: category }]);
    const singleton = composed({
      ...base,
      snapshot: { ...base.snapshot, rows: base.snapshot.rows.slice(0, 2) },
      baseline: {
        ...base.baseline,
        options: {
          "range-bar": { axes: { category: { paddingInner: 0.9, paddingOuter: 0.2 } } },
        },
      },
    });
    expect(singleton.category.ticks[0].label).toBe(labels[0]);
  });

  it("keeps singleton and cropped/reversed Area geometry finite with point bands", () => {
    const base = input();
    const singleton = composed({
      ...base,
      snapshot: { ...base.snapshot, rows: base.snapshot.rows.slice(0, 2) },
    });
    expect(singleton.category.fullExtent).toEqual([-0.5, 0.5]);
    const { chart, result } = svg({
      ...base,
      visibleRange: [0.2, 0.8],
      baseline: {
        ...base.baseline,
        options: { "range-area": { axes: { category: { reverse: true } } } },
      },
    });
    try {
      expect(result.category.visibleExtent).toEqual([2, 8]);
      const left = chart.convertToPixel({ gridIndex: 0 }, [8, 20]) as number[];
      const right = chart.convertToPixel({ gridIndex: 0 }, [2, 20]) as number[];
      expect(left[0]).toBeCloseTo(result.plot.left);
      expect(right[0]).toBeCloseTo(result.plot.left + result.plot.width);
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  });

  it("compares rotated label boxes in two dimensions and respects spacing on both axes", () => {
    const source = composed(input()).appearance.axes.category;
    const axis = {
      ...source,
      labels: {
        ...source.labels,
        enabled: true,
        avoidCollisions: true,
        wrapping: "on-space" as const,
      },
    };
    const ticks = [
      { coordinate: 0, label: labels[0] },
      { coordinate: 1, label: labels[10] },
    ];
    expect(rangeLabelsFit(ticks, [0, 1], 60, axis, true, -25)).toBe(true);
    expect(rangeLabelsFit([...ticks].reverse(), [0, 1], 60, axis, true, -25)).toBe(
      true,
    );
    expect(rangeLabelsFit(ticks, [0, 1], 60, axis, true, -25, true)).toBe(true);
    expect(
      rangeLabelsFit(
        ticks,
        [0, 1],
        60,
        { ...axis, labels: { ...axis.labels, minSpacing: 30 } },
        true,
        -25,
      ),
    ).toBe(false);
    expect(rangeLabelsFit(ticks, [0, 1], 60, axis, false, 65)).toBe(true);
  });

  it("retains the source label-anchor matrix for unequal widths on both axis directions", () => {
    const source = composed(input()).appearance.axes.category;
    const axis = {
      ...source,
      labels: {
        ...source.labels,
        enabled: true,
        avoidCollisions: true,
        wrapping: "never" as const,
        minSpacing: 0,
      },
    };
    const ticks = [
      { coordinate: 0, label: "a".repeat(20) },
      { coordinate: 1, label: "a" },
    ];
    expect(rangeLabelsFit(ticks, [0, 1], 30, axis, true, 0)).toBe(true);
    expect(rangeLabelsFit(ticks, [0, 1], 30, axis, true, 0, true)).toBe(false);
    expect(rangeLabelsFit(ticks, [0, 1], 30, axis, false, 90)).toBe(true);
    expect(rangeLabelsFit(ticks, [0, 1], 30, axis, false, 90, true)).toBe(false);
    const numeric = { ...axis, fields: { ...axis.fields, type: "number" } };
    expect(rangeLabelsFit(ticks, [0, 1], 30, numeric, false, 90)).toBe(false);
    expect(rangeLabelsFit(ticks, [0, 1], 30, numeric, false, 90, true)).toBe(true);
    const time = { ...axis, fields: { ...axis.fields, type: "time" } };
    expect(rangeLabelsFit(ticks, [0, 1], 30, time, false, 90)).toBe(true);
    expect(
      rangeLabelsFit(
        [
          { coordinate: 0.519, label: "a" },
          { coordinate: 0.571, label: "a" },
        ],
        [0, 1],
        100,
        axis,
        false,
        0,
      ),
    ).toBe(true);
  });

  it("paints an outlined Area legend marker with a line sample and reserves its full width", () => {
    const base = input();
    const { chart, result } = svg(base);
    try {
      expect(result.options.legend).toMatchObject({ itemWidth: 25, itemHeight: 12 });
      const doc = new DOMParser().parseFromString(
        chart.renderToSVGString(),
        "image/svg+xml",
      );
      const image = doc.querySelector("image");
      expect(image).not.toBeNull();
      const embedded = iconSvg(
        image?.getAttribute("xlink:href") ?? image?.getAttribute("href") ?? "",
      );
      expect(embedded.querySelector('path[fill="none"]')?.getAttribute("d")).toBe(
        "M0 6H25",
      );
      expect(embedded.querySelector('path[fill="#112233"]')).not.toBeNull();
      expect(
        embedded.querySelector('path[fill="#112233"]')?.getAttribute("stroke-width"),
      ).toBe("1");
      expect(embedded.querySelector("svg svg")?.getAttribute("width")).toBe("11");
      expect(embedded.documentElement.getAttribute("height")).toBe("12");
    } finally {
      chart.dispose();
    }
    const left = (family: "rangeBar" | "rangeArea") => {
      const source = input(family);
      return composed({
        ...source,
        theme: {
          ...source.theme,
          overrides: {
            common: { legend: { position: "left", item: { marker: { size: 11 } } } },
          },
        },
      });
    };
    expect(left("rangeArea").plot.left - left("rangeBar").plot.left).toBeCloseTo(14);
  });

  it("retains explicit legend marker size and zero outline with id-keyed selection", () => {
    const base = input();
    const result = composed({
      ...base,
      legendSelection: { amount: false, other: true },
      baseline: {
        ...base.baseline,
        options: {
          "range-area": {
            legend: {
              item: {
                marker: { size: 30, strokeWidth: 0, shape: "diamond", fill: "#abcdef" },
                line: { length: 55, strokeWidth: 7 },
              },
            },
          },
        },
      },
    });
    const legend = result.options.legend as LegendComponentOption;
    expect(legend).toMatchObject({
      itemWidth: 55,
      itemHeight: 30,
      selected: { amount: false, other: true },
    });
    const item = legend.data?.find(
      (entry) => typeof entry !== "string" && entry.name === "amount",
    );
    if (!item || typeof item === "string") throw Error("Expected amount legend");
    const embedded = iconSvg(String(item.icon));
    expect(
      embedded.querySelector('path[fill="#abcdef"]')?.getAttribute("stroke-width"),
    ).toBe("0");
    expect(embedded.querySelector('path[fill="#abcdef"]')?.getAttribute("d")).toBe(
      "M.5 0L1 .5L.5 1L0 .5Z",
    );
    expect(embedded.querySelector('path[fill="none"]')?.getAttribute("d")).toBe(
      "M0 15H55",
    );
    expect(
      embedded.querySelector('path[fill="none"]')?.getAttribute("stroke-width"),
    ).toBe("7");
    const defaultLeft = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: { "range-area": { legend: { position: "left" } } },
      },
    });
    const extendedLeft = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-area": {
            legend: { position: "left", item: { line: { length: 55 } } },
          },
        },
      },
    });
    expect(extendedLeft.plot.left - defaultLeft.plot.left).toBeCloseTo(30);
    const capped = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-area": { series: { strokeWidth: 6, marker: { strokeWidth: 6 } } },
        },
      },
    });
    const cappedLegend = capped.options.legend as LegendComponentOption;
    const cappedItem = cappedLegend.data?.[0];
    if (!cappedItem || typeof cappedItem === "string")
      throw Error("Expected capped legend");
    const cappedSvg = iconSvg(String(cappedItem.icon));
    expect(cappedLegend.itemHeight).toBe(13);
    expect(
      [...cappedSvg.querySelectorAll("path")].map((path) =>
        path.getAttribute("stroke-width"),
      ),
    ).toEqual(["2", "2"]);
  });

  it.each([
    "diamond",
    "triangle",
  ])("retains nominal %s size without clipping its painted miter tips", (shape) => {
    const base = input();
    const result = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-area": {
            legend: { item: { marker: { shape, size: 20, strokeWidth: 4 } } },
          },
        },
      },
    });
    const legend = result.options.legend as LegendComponentOption;
    const entry = legend.data?.[0];
    if (!entry || typeof entry === "string") throw Error("Expected marker legend");
    const embedded = iconSvg(String(entry.icon));
    const marker = embedded.querySelector("svg svg");
    expect(marker).not.toBeNull();
    const x = Number(marker?.getAttribute("x"));
    const y = Number(marker?.getAttribute("y"));
    const width = Number(marker?.getAttribute("width"));
    const height = Number(marker?.getAttribute("height"));
    expect(width).toBe(20);
    expect(height).toBe(shape === "triangle" ? 17.4 : 20);
    expect(marker?.querySelector("path")?.getAttribute("stroke-width")).toBe("4");
    const rootWidth = Number(embedded.documentElement.getAttribute("width"));
    const rootHeight = Number(embedded.documentElement.getAttribute("height"));
    const diagonal = Math.hypot(width / 2, height);
    const side = (2 * (diagonal + width / 2)) / height;
    const tips =
      shape === "diamond"
        ? [
            [x + width / 2, y - 2 * Math.SQRT2],
            [x + width + 2 * Math.SQRT2, y + height / 2],
            [x + width / 2, y + height + 2 * Math.SQRT2],
            [x - 2 * Math.SQRT2, y + height / 2],
          ]
        : [
            [x + width / 2, y - (2 * diagonal) / (width / 2)],
            [x - side, y + height + 2],
            [x + width + side, y + height + 2],
          ];
    for (const [tipX, tipY] of tips) {
      expect(tipX).toBeGreaterThanOrEqual(-1e-8);
      expect(tipX).toBeLessThanOrEqual(rootWidth + 1e-8);
      expect(tipY).toBeGreaterThanOrEqual(-1e-8);
      expect(tipY).toBeLessThanOrEqual(rootHeight + 1e-8);
    }
    expect(legend.itemWidth).toBe(rootWidth);
    expect(legend.itemHeight).toBe(rootHeight);
  });
});
