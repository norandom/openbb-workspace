import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateRadial } from "../../../src/components/General/Table/Chart/echarts/radial";
import { radialChrome } from "../../../src/components/General/Table/Chart/echarts/radialChrome";
import type { RadialPreparedModel } from "../../../src/components/General/Table/Chart/echarts/radialModel";
import {
  radialSeries,
  radialTooltip,
} from "../../../src/components/General/Table/Chart/echarts/radialSeries";
import { radialInput } from "./radial.fixtures";
const model: RadialPreparedModel = {
  center: [200, 180],
  outerRadius: 100,
  holeRadius: 20,
  domain: [0, 10],
  ticks: [0, 10],
  numericalGridRadii: [],
  axisStrokes: [
    { axis: "category", kind: "circle", radius: 100 },
    { axis: "numerical", kind: "line", x1: 0, y1: -20, x2: 0, y2: -100 },
  ],
  categoryLabels: [{ value: "A", x: 0, y: -120, angle: 0 }],
  numericalLabels: [{ value: 10, x: -10, y: -100 }],
  series: [
    {
      id: "primary",
      label: "primary",
      paletteIndex: 0,
      visible: true,
      marks: [
        {
          kind: "column",
          rowId: "first",
          rowIndex: 0,
          category: "A",
          rawValue: 7,
          startValue: 0,
          endValue: 7,
          labelX: 13,
          labelY: -44,
          startRadius: 20,
          endRadius: 80,
          width: 12,
          connectBaseline: true,
          rotation: Math.PI / 2,
        },
        {
          kind: "column",
          rowId: "second",
          rowIndex: 1,
          category: "A",
          rawValue: 0,
          startValue: 0,
          endValue: 0,
          labelX: 0,
          labelY: -20,
          startRadius: 20,
          endRadius: 20,
          width: 12,
          connectBaseline: true,
          rotation: 0,
        },
      ],
    },
    {
      id: "secondary",
      label: "secondary",
      paletteIndex: 1,
      visible: false,
      marks: [],
    },
  ],
};
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);
it("renders actual paths with directed rotation, open zero stroke and stable hidden legend", () => {
  const input = radialInput();
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 360,
  });
  try {
    chart.setOption({
      ...radialChrome(input, model),
      series: radialSeries(input, model),
    });
    const svg = chart.renderToSVGString();
    expect(svg).not.toMatch(/NaN|Infinity/);
    const paths = chart
      .getZr()
      .storage.getDisplayList()
      .filter((el) => el.type === "path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths.some((el) => Math.abs(el.rotation + Math.PI / 2) < 1e-9)).toBe(
      true,
    );
    expect(paths.some((el) => el.style.fill === "none")).toBe(true);
    expect(chart.getOption().legend).toMatchObject([
      { data: ["primary", "secondary"] },
    ]);
  } finally {
    chart.dispose();
  }
});
it("tooltip identity uses raw mark row ID even for duplicate categories", () => {
  const input = radialInput();
  const tooltip = radialTooltip(input, model);
  const format = tooltip.formatter as (p: unknown) => string;
  expect(
    format({ seriesId: "primary", data: { rowId: "first", rawValue: 7 } }),
  ).toContain("7");
  expect(
    format({ seriesId: "primary", data: { rowId: "second", rawValue: 0 } }),
  ).toContain("0");
});
it("renders unwrapped full-circle Bar sectors without replacing prepared geometry", () => {
  const input = radialInput("radialBar");
  const mark = model.series[0].marks[0];
  const prepared: RadialPreparedModel = {
    ...model,
    series: [
      {
        ...model.series[0],
        marks: [
          {
            ...mark,
            kind: "bar",
            innerRadius: 30,
            outerRadius: 45,
            startAngle: -Math.PI / 2,
            endAngle: (3 * Math.PI) / 2,
          },
        ],
      },
    ],
  };
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 360,
  });
  try {
    chart.setOption({ series: radialSeries(input, prepared) });
    const sector = chart
      .getZr()
      .storage.getDisplayList()
      .find((el) => el.type === "sector");
    expect(sector?.shape).toMatchObject({
      r0: 30,
      r: 45,
      startAngle: -Math.PI / 2,
      endAngle: (3 * Math.PI) / 2,
    });
  } finally {
    chart.dispose();
  }
});
it("painted path clicks carry distinct raw data identities for duplicate category text", () => {
  const input = radialInput();
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 360,
  });
  const clicks: unknown[] = [];
  try {
    chart.setOption({ series: radialSeries(input, model) });
    chart.on("click", (event) => clicks.push(event.data));
    const paths = chart
      .getZr()
      .storage.getDisplayList()
      .filter((el) => el.type === "path");
    for (const path of paths)
      chart.getZr().handler.dispatchToElement(
        {
          target: path,
          topTarget: path,
        },
        "click",
        {},
      );
    expect(clicks).toMatchObject([
      { rowId: "first", category: "A", rawValue: 7 },
      { rowId: "second", category: "A", rawValue: 0 },
    ]);
  } finally {
    chart.dispose();
  }
});
it("independent axis primitives and raw count labels retain prepared anchors and supplied opacity", () => {
  const base = radialInput();
  const input = {
    ...base,
    context: {
      ...base.context,
      display: {
        ...base.context.display,
        seriesLabel: (v: string | number) => `count ${v}`,
      },
    },
    style: {
      ...base.style,
      axes: {
        ...base.style.axes,
        category: {
          ...base.style.axes.category,
          color: "#ff0000",
          thickness: 3,
        },
        numerical: {
          ...base.style.axes.numerical,
          color: "#0000ff",
          thickness: 5,
        },
      },
      series: {
        ...base.style.series,
        labels: { ...base.style.series.labels, enabled: true },
        fillOpacity: 0.4,
        strokeOpacity: 0.6,
        strokeWidth: 2,
        lineDash: [4, 2],
      },
    },
  };
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 360,
  });
  try {
    chart.setOption({
      ...radialChrome(input, model),
      series: radialSeries(input, model),
    });
    const elements = chart.getZr().storage.getDisplayList();
    expect(elements.find((el) => el.type === "circle")?.style).toMatchObject({
      stroke: "#ff0000",
      lineWidth: 3,
    });
    expect(elements.find((el) => el.type === "line")?.style).toMatchObject({
      stroke: "#0000ff",
      lineWidth: 5,
    });
    const text = elements.find(
      (el) => el.type === "tspan" && el.style.text === "count 7",
    );
    expect(text).toBeDefined();
    const paths = elements.filter((el) => el.type === "path");
    expect(paths[0].style).toMatchObject({
      fill: "rgba(17,34,51,0.4)",
      stroke: "rgba(51,68,85,0.6)",
      lineWidth: 2,
      lineDash: [4, 2],
    });
    expect(paths[1].style.fill).toBe("none");
  } finally {
    chart.dispose();
  }
});

it("joined numerical output renders both families and invalid pixels never escape translation", () => {
  for (const family of ["radialColumn", "radialBar"] as const) {
    const input = radialInput(family, "normalized");
    const result = translateRadial(input);
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw Error("Translation failed");
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      ...input.context.viewport,
    });
    try {
      chart.setOption(result.options);
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
      expect(
        chart
          .getZr()
          .storage.getDisplayList()
          .some(
            (el) => el.type === (family === "radialColumn" ? "path" : "sector"),
          ),
      ).toBe(true);
    } finally {
      chart.dispose();
    }
    expect(
      translateRadial({
        ...input,
        context: {
          ...input.context,
          viewport: { width: Number.POSITIVE_INFINITY, height: 600 },
        },
      }).status,
    ).toBe("invalid");
    expect(
      translateRadial({
        ...input,
        context: { ...input.context, viewport: { width: 1e8, height: 1e8 } },
      }).status,
    ).toBe("invalid");
    expect(
      translateRadial({
        ...input,
        style: {
          ...input.style,
          series: { ...input.style.series, fillOpacity: 2 },
        },
      }).status,
    ).toBe("invalid");
  }
});

it("paints silent alternating numerical grid circles below series and preserves absent/disabled callers", () => {
  const base = radialInput();
  const prepared = { ...model, numericalGridRadii: [80, 50, 20] };
  const grid = {
    enabled: true,
    width: 2,
    styles: [
      { stroke: "red", lineDash: [4, 2] },
      { stroke: "blue", lineDash: [] },
    ],
  };
  const option = radialChrome(
    { ...base, style: { ...base.style, numericalGrid: grid } },
    prepared,
  );
  const circles = (option.graphic as any[]).filter((g) => g.z === -1);
  expect(circles.map((g) => g.shape)).toEqual(
    [80, 50, 20].map((r) => ({ cx: 200, cy: 180, r })),
  );
  expect(circles.map((g) => g.style.stroke)).toEqual(["red", "blue", "red"]);
  expect(circles[0]).toMatchObject({
    silent: true,
    style: { fill: "none", lineWidth: 2, lineDash: [4, 2] },
  });
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 360,
  });
  try {
    chart.setOption({ ...option, series: radialSeries(base, prepared) });
    const painted = chart.getZr().storage.getDisplayList();
    const grids = painted.filter((el) => el.type === "circle" && el.z === -1);
    expect(grids.map((el) => el.shape.r)).toEqual([80, 50, 20]);
    expect(grids.map((el) => el.style.stroke)).toEqual(["red", "blue", "red"]);
    expect(grids.every((el) => el.silent)).toBe(true);
    expect(painted.findIndex((el) => el.type === "path")).toBeGreaterThan(
      painted.indexOf(grids[2]),
    );
  } finally {
    chart.dispose();
  }
  for (const numericalGrid of [undefined, { ...grid, enabled: false }])
    expect(
      (
        radialChrome(
          { ...base, style: { ...base.style, numericalGrid } },
          prepared,
        ).graphic as any[]
      ).filter((g) => g.z === -1),
    ).toEqual([]);
});
