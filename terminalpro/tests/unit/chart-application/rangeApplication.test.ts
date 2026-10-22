import { AllCommunityModule, createGrid, ModuleRegistry } from "ag-grid-community";
import { init } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import {
  projectOrdinarySetup,
  retainOrdinarySetupCapture,
} from "../../../src/components/General/Table/Chart/application/setupProjection";
import { composeRangeApplication } from "../../../src/components/General/Table/Chart/echarts/rangeApplication";
import type { RangeApplicationInput } from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
import { rangeInput } from "../chart-compatibility/rangeBar.fixtures";

function input(family: "rangeBar" | "rangeArea" = "rangeBar"): RangeApplicationInput {
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
    },
    baseline: { stateAddress: "range", chartType: family, model: {}, options: {} },
    generated: {},
    precision: 2,
    display: core.context.display,
    viewport: core.context.viewport,
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
      overrides: {},
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
function composed(i: RangeApplicationInput) {
  const result = composeRangeApplication(i);
  expect(result.status, JSON.stringify(result)).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);

describe("Range application composition", () => {
  it("applies saved interval spacing to both final axis spans and retains retry bounds", () => {
    const base = input();
    const result = composed({
      ...base,
      snapshot: {
        ...base.snapshot,
        rows: [0, 50, 100].map((category, n) => ({
          id: String(n),
          category,
          values: { amount: n * 50, other: n * 40 },
        })),
      },
      baseline: {
        ...base.baseline,
        model: { categoryAxisType: "number" },
        options: {
          "range-bar": {
            axes: {
              number: {
                bottom: {
                  min: 0,
                  max: 100,
                  nice: false,
                  interval: { minSpacing: 200, maxSpacing: 400 },
                },
                left: {
                  min: 0,
                  max: 100,
                  nice: false,
                  interval: { minSpacing: 180, maxSpacing: 400 },
                },
              },
            },
          },
        },
      },
    });
    const category = result.category.ticks;
    expect(category.length).toBeLessThanOrEqual(
      Math.floor(result.plot.width / 200) + 1,
    );
    expect(result.valueAxis.density.maxTickCount).toBe(
      Math.max(1, Math.floor(result.plot.height / 180)),
    );
    expect(result.valueAxis.density.minTickCount).toBe(
      Math.min(
        result.valueAxis.density.maxTickCount,
        Math.ceil(result.plot.height / 400),
      ),
    );
    expect(result.valueAxis.density.tickCount).toBeGreaterThanOrEqual(
      result.valueAxis.density.minTickCount,
    );
  });
  it("joins native-Date Grid capture and setup to irregular calendar SVG geometry", async () => {
    ModuleRegistry.registerModules([AllCommunityModule]);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const host = document.createElement("div");
    document.body.append(host);
    const epochs = [Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2), Date.UTC(2024, 0, 10)];
    const api = createGrid<Record<string, unknown>>(host, {
      theme: "legacy",
      rowData: epochs.flatMap((epoch, n) => [
        { id: `a${n}`, period: new Date(epoch), amount: 2 },
        { id: `b${n}`, period: new Date(epoch), amount: 8 },
      ]),
      getRowId: ({ data }) => String(data.id),
      columnDefs: [
        { field: "period", cellDataType: false },
        { field: "amount", cellDataType: false },
      ],
    });
    try {
      await vi.waitFor(() => expect(api.getDisplayedRowCount()).toBe(6));
      const captured = captureDisplayedChart({
        api,
        snapshotPolicy: "statistical-observations",
        stamp: {
          address: { widgetId: "w", stateKey: "r", stateAddress: '["w","r"]' },
          generation: 1,
          dataRevision: 1,
          renderRevision: 1,
        },
        range: { columnIds: ["period", "amount"], originalRange: {} },
        categoryColumnId: "period",
        columns: [
          { id: "period", label: "Period", role: "category" },
          { id: "amount", label: "Revenue", role: "number", unit: "USD" },
        ],
        originalModel: {},
      });
      if (captured.status !== "ready") throw Error(JSON.stringify(captured));
      const retained = retainOrdinarySetupCapture(
        captured.value,
        "statistical-observations",
      );
      if (retained.status !== "ready") throw Error(JSON.stringify(retained));
      const setup = projectOrdinarySetup(
        retained.value,
        { categoryId: "period", seriesIds: ["amount"], switchCategorySeries: false },
        "statistical-observations",
      );
      if (setup.status !== "ready") throw Error(JSON.stringify(setup));
      const base = input("rangeArea");
      const result = composed({
        ...base,
        snapshot: setup.value.snapshot,
        baseline: {
          ...base.baseline,
          options: {
            "range-area": {
              axes: {
                time: {
                  min: epochs[0],
                  max: epochs[2],
                  nice: false,
                  interval: { values: epochs },
                  label: { format: "%Y-%m-%d" },
                },
              },
            },
          },
        },
      });
      expect(result.category.kind).toBe("time");
      expect(result.category.coordinates).toEqual(epochs);
      expect(result.category.ticks.map((tick) => tick.label)).toEqual([
        "2024-01-01",
        "2024-01-02",
        "2024-01-10",
      ]);
      const chart = init(null, undefined, {
        renderer: "svg",
        ssr: true,
        ...base.viewport,
      });
      try {
        chart.setOption(result.options);
        const x = (epoch: number) =>
          (chart.convertToPixel({ gridIndex: 0 }, [epoch, 2]) as number[])[0];
        expect(x(epochs[0])).toBeCloseTo(result.plot.left);
        expect(x(epochs[1])).toBeCloseTo(result.plot.left + result.plot.width / 9);
        expect(x(epochs[2])).toBeCloseTo(result.plot.left + result.plot.width);
        expect(chart.renderToSVGString()).toContain("2024-01-10");
        expect(chart.renderToSVGString()).toContain("#112233");
      } finally {
        chart.dispose();
      }
    } finally {
      api.destroy();
      host.remove();
      vi.unstubAllGlobals();
    }
  });
  it.each([
    "rangeBar",
    "rangeArea",
  ] as const)("renders measured chrome and real %s core geometry", (family) => {
    const base = input(family);
    const plain = composed(base);
    const key = family === "rangeBar" ? "range-bar" : "range-area";
    const rich = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          [key]: {
            ...(family === "rangeArea"
              ? { series: { marker: { enabled: true } } }
              : {}),
            title: { enabled: true, text: "Range revenue" },
            subtitle: { enabled: true, text: "USD, raw observations" },
            axes: {
              number: {
                title: { enabled: true, text: "USD" },
                interval: { values: [20, 0, 10, 10] },
                min: 0,
                max: 20,
                nice: false,
                gridLine: {
                  enabled: true,
                  style: [{ stroke: "#c01234", lineDash: [2, 1] }],
                },
              },
            },
          },
        },
      },
    });
    expect(rich.plot.top).toBeGreaterThan(plain.plot.top);
    expect(rich.plot.width).toBeLessThan(plain.plot.width);
    expect(rich.valueAxis.rawTicks).toEqual([0, 10, 20]);
    expect(rich.mapping.context.plot).toEqual(rich.plot);
    expect(rich.options.grid).toMatchObject({
      left: rich.plot.left,
      top: rich.plot.top,
      width: rich.plot.width,
      height: rich.plot.height,
    });
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...base.viewport,
    });
    try {
      chart.setOption(rich.options);
      const svg = chart.renderToSVGString();
      expect(svg).toContain("Range revenue");
      expect(svg).toContain("USD, raw observations");
      expect(svg).toContain("Revenue &lt;USD&gt;");
      expect(svg).toContain("#112233");
      expect(svg).toContain("#c01234");
      expect(svg).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  });

  it("uses current model category override, preserves raw number ticks and full extent on crops", () => {
    const base = input();
    const snapshot = {
      ...base.snapshot,
      rows: [0, 100, 1].flatMap((category, n) => [
        { id: `a${n}`, category, values: { amount: 2, other: 4 } },
        { id: `b${n}`, category, values: { amount: 8, other: 12 } },
      ]),
    };
    const source = {
      ...base,
      snapshot,
      baseline: {
        ...base.baseline,
        model: { categoryAxisType: "number" },
        options: {
          "range-bar": {
            axes: {
              number: {
                bottom: {
                  min: 0,
                  max: 100,
                  nice: false,
                  interval: { values: [100, 0, 1, 1] },
                },
              },
            },
          },
        },
      },
    };
    const result = composed(source);
    expect(result.category.kind).toBe("number");
    expect(result.category.coordinates).toEqual([0, 100, 1]);
    expect(result.category.ticks).toEqual([
      { coordinate: 0, label: "0" },
      { coordinate: 1, label: "1" },
      { coordinate: 100, label: "100" },
    ]);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...base.viewport,
    });
    try {
      chart.setOption(result.options);
      for (const category of [0, 1, 100]) {
        const pixel = chart.convertToPixel({ gridIndex: 0 }, [category, 2]) as number[];
        expect(pixel[0]).toBeCloseTo(
          result.plot.left + (result.plot.width * category) / 100,
        );
      }
      expect(chart.renderToSVGString()).toContain("#112233");
    } finally {
      chart.dispose();
    }
    const crop = composed({
      ...source,
      visibleRange: [0.25, 0.75],
      categoryFullExtent: result.category.fullExtent,
    });
    expect(crop.category.fullExtent).toEqual([0, 100]);
    expect(crop.category.visibleExtent).toEqual([25, 75]);
  });

  it("swaps physical axis bindings with Bar direction while retaining reverse and semantic policies", () => {
    const base = input();
    const result = composed({
      ...base,
      baseline: {
        ...base.baseline,
        options: {
          "range-bar": {
            series: { direction: "horizontal" },
            axes: {
              category: { reverse: true, title: { enabled: true, text: "Period" } },
              number: {
                reverse: true,
                min: 0,
                max: 20,
                nice: false,
                interval: { step: 10 },
              },
            },
          },
        },
      },
    });
    expect(result.axisRuntime.axes).toMatchObject([
      { id: "category", direction: "y", position: "left" },
      { id: "number", direction: "x", position: "bottom" },
    ]);
    expect(result.options.xAxis).toMatchObject({ inverse: true, min: 0, max: 20 });
    expect(result.options.yAxis).toMatchObject({ inverse: false, name: "Period" });
    expect(result.valueAxis.rawTicks).toEqual([0, 10, 20]);
  });

  it("contains unsupported interval callbacks and keeps tiny viewports finite and empty", () => {
    const base = input();
    expect(
      composeRangeApplication({
        ...base,
        baseline: {
          ...base.baseline,
          options: {
            "range-bar": { axes: { number: { interval: { step: { every: 2 } } } } },
          },
        },
      }),
    ).toMatchObject({ status: "unsupported" });
    const tiny = composed({ ...base, viewport: { width: 1, height: 1 } });
    expect(tiny.plot.width * tiny.plot.height).toBe(0);
    expect(Object.values(tiny.plot).every(Number.isFinite)).toBe(true);
  });
});
it("reserves navigation space before composing and crops the retained physical x value domain", () => {
  const base = input();
  const full = composed({
    ...base,
    baseline: {
      ...base.baseline,
      options: { "range-bar": { series: { direction: "horizontal" } } },
    },
  });
  const zoomed = composed({
    ...base,
    baseline: {
      ...base.baseline,
      options: { "range-bar": { series: { direction: "horizontal" } } },
    },
    plotBottomInset: 70,
    valueFullExtent: [0, 20],
    valueVisibleRange: [0.25, 0.75],
  });
  expect(zoomed.valueAxis.fullExtent).toEqual([0, 20]);
  expect(zoomed.valueAxis.visibleExtent).toEqual([5, 15]);
  expect(zoomed.plot.top + zoomed.plot.height).toBeLessThan(
    full.plot.top + full.plot.height - 50,
  );
  expect(zoomed.mapping.context.plot).toEqual(zoomed.plot);
});
it("drops stale physical position when Range Bar changes direction", () => {
  const base = input();
  const previous = {
    ...base.axisRuntime,
    axes: base.axisRuntime.axes.map((axis) =>
      axis.id === "category"
        ? {
            ...axis,
            position: "top" as const,
            options: { position: "top", label: { color: "#aabbcc" } },
          }
        : axis,
    ),
  };
  const result = composed({
    ...base,
    axisRuntime: previous,
    baseline: {
      ...base.baseline,
      options: { "range-bar": { series: { direction: "horizontal" } } },
    },
  });
  expect(result.axisRuntime.axes[0].position).toBe("left");
  expect(result.appearance.axes.category.labels.color).toBe("#aabbcc");
});
