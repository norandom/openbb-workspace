import * as echarts from "echarts";
import { expect, it } from "vitest";
import { translateRangeArea } from "../../../src/components/General/Table/Chart/echarts/rangeArea";
import { areaInput, fmpAreaInput } from "./rangeArea.fixtures";

it("renders portable observed FMP ranges with actual ECharts SVG", () => {
  const i = fmpAreaInput();
  i.style.valueScale = {
    min: 0,
    max: 80000000000,
    ticks: [0, 11000000000, 80000000000],
  };
  const r = translateRangeArea(i);
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(r.options);
    const svg = chart.renderToSVGString();
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).toContain("FY2017");
  } finally {
    chart.dispose();
  }
});
it("retains missing full-slot data and silent continuous connected fill", () => {
  const i = areaInput();
  for (const s of Object.values(i.style.fields)) s.connectMissingData = true;
  const r = translateRangeArea(i);
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  const series = r.options.series as echarts.CustomSeriesOption[];
  expect(series).toHaveLength(4);
  expect(series[0].silent).toBe(true);
  expect(series[1].data).toHaveLength(3);
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(r.options);
    const svg = chart.renderToSVGString();
    expect(svg).not.toMatch(/NaN|Infinity/);
    const dom = new DOMParser().parseFromString(svg, "image/svg+xml");
    const fills = Array.from(dom.querySelectorAll('path[fill="#145da0"]'));
    expect(fills.map((p) => p.getAttribute("d"))).toEqual([
      "M140 280L460 240L460 340L140 400Z",
    ]);
    const outlines = Array.from(dom.querySelectorAll('path[stroke="#ae1234"]'));
    expect(outlines.map((p) => p.getAttribute("d"))).toEqual([
      "M140 280L460 240M140 400L460 340",
      "M140 200L460 160M140 360L460 300",
    ]);
    expect(fills[0].getAttribute("fill-opacity")).toBe("0.4");
    expect(outlines[0].getAttribute("stroke-opacity")).toBe("0.7");
    expect(fills[0].getAttribute("filter")).toMatch(/^url/);
    expect(outlines.every((p) => !p.hasAttribute("filter"))).toBe(true);
    expect(
      Array.from(dom.querySelectorAll("clipPath path")).every(
        (p) => p.getAttribute("d") === "M60 40l480 0l0 400l-480 0Z",
      ),
    ).toBe(true);
    const pointerEvents: unknown[] = [];
    chart.on("updateAxisPointer", (event) => {
      pointerEvents.push(event);
    });
    const pixel = chart.convertToPixel({ gridIndex: 0 }, [1, 8]);
    chart.dispatchAction({
      type: "updateAxisPointer",
      x: pixel[0] + 2,
      y: pixel[1],
      currTrigger: "mousemove",
    });
    const axes = (
      pointerEvents.at(-1) as { axesInfo: { axisDim: string; value: number }[] }
    ).axesInfo;
    const snapped = axes.find((a) => a.axisDim === "x")?.value;
    expect(snapped).toBe(1);
    expect(
      (r.options.tooltip as { formatter: (v: unknown) => string }).formatter([
        { axisValue: snapped },
      ]),
    ).toBe("");
    for (const style of Object.values(i.style.fields)) style.connectMissingData = false;
    const gaps = translateRangeArea(i);
    if (gaps.status !== "supported") throw Error(JSON.stringify(gaps));
    chart.setOption(gaps.options, true);
    const gapDom = new DOMParser().parseFromString(
      chart.renderToSVGString(),
      "image/svg+xml",
    );
    expect(gapDom.querySelectorAll('path[fill="#145da0"]')).toHaveLength(0);
    expect(gapDom.querySelectorAll('path[stroke="#ae1234"]')).toHaveLength(0);
    i.context.legendSelection = { amount: false };
    const hidden = translateRangeArea(i);
    if (hidden.status !== "supported") throw Error(JSON.stringify(hidden));
    chart.setOption(hidden.options, true);
    expect(
      chart
        .getZr()
        .storage.getDisplayList(true)
        .filter((el) => el.type === "circle" && !el.ignore && !el.invisible),
    ).toHaveLength(4);
    i.context.legendSelection = { amount: true };
    const restored = translateRangeArea(i);
    if (restored.status !== "supported") throw Error(JSON.stringify(restored));
    chart.setOption(restored.options, true);
    const circles = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((el) => el.type === "circle");
    expect(circles).toHaveLength(8);
    expect(circles[0].getBoundingRect()).toMatchObject({
      x: 136,
      y: 396,
      width: 8,
      height: 8,
    });
  } finally {
    chart.dispose();
  }
});
it("dispatches raw slot identities from transparent engine targets without marker dependence", () => {
  const i = areaInput();
  i.style.tooltip.mode = "single";
  for (const s of Object.values(i.style.fields)) s.marker.enabled = false;
  const r = translateRangeArea(i);
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(r.options);
    const elements = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((el) => el.type === "rect" && !el.silent);
    expect(elements).toHaveLength(4);
    const seen: unknown[] = [];
    chart.on("click", (p) => {
      seen.push(p.data);
    });
    for (const target of elements) {
      const box = target.getBoundingRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      expect(target.contain(x, y)).toBe(true);
      chart.getZr().trigger("click", {
        target,
        topTarget: target,
        offsetX: x,
        offsetY: y,
        event: {},
      });
    }
    const formatter = (r.options.tooltip as { formatter: (p: unknown) => string })
      .formatter;
    expect(formatter({ data: seen[0] })).toBe(
      "period:last<br/>Revenue &lt;USD&gt;: number:5 - number:10",
    );
    i.style.tooltip.mode = "compact";
    const compact = translateRangeArea(i);
    if (compact.status !== "supported") throw Error(JSON.stringify(compact));
    expect(
      (compact.options.tooltip as { formatter: (p: unknown) => string }).formatter({
        data: seen[0],
      }),
    ).toBe("Revenue &lt;USD&gt;: number:5 - number:10");
    expect(seen.map((d) => (d as { metadata: unknown }).metadata)).toEqual([
      { fieldId: "amount", groupSlot: 2 },
      { fieldId: "amount", groupSlot: 0 },
      { fieldId: "other", groupSlot: 2 },
      { fieldId: "other", groupSlot: 0 },
    ]);
  } finally {
    chart.dispose();
  }
});
it("renders source interpolation, all marker shapes and labels without markers", () => {
  const input = areaInput();
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    for (const shape of [
      "square",
      "circle",
      "cross",
      "diamond",
      "plus",
      "triangle",
      "heart",
    ] as const) {
      for (const s of Object.values(input.style.fields)) {
        s.marker.shape = shape;
        s.connectMissingData = true;
        s.label.enabled = true;
        s.interpolation =
          shape === "square"
            ? { type: "smooth", tension: 1 }
            : shape === "cross"
              ? { type: "step", position: "middle" }
              : { type: "linear" };
      }
      const r = translateRangeArea(input);
      if (r.status !== "supported") throw Error(JSON.stringify(r));
      chart.setOption(r.options, true);
      const svg = chart.renderToSVGString();
      expect(svg).not.toMatch(/NaN|Infinity/);
      expect(svg).toContain("label:2");
      const markers = chart
        .getZr()
        .storage.getDisplayList(true)
        .filter(
          (e) =>
            e.type !== "text" &&
            e.style.fill === "#123456" &&
            e.style.stroke === "#654321",
        );
      expect(markers).toHaveLength(8);
      for (const marker of markers) {
        const b = marker.getBoundingRect();
        expect(b.width).toBeGreaterThan(0);
        expect(b.width).toBeLessThanOrEqual(8.01);
        expect(b.height).toBeGreaterThan(0);
        expect(b.height).toBeLessThanOrEqual(8.01);
      }
      expect(
        markers[0].getBoundingRect().x + markers[0].getBoundingRect().width / 2,
      ).toBeCloseTo(140);
    }
    for (const s of Object.values(input.style.fields)) s.marker.enabled = false;
    const r = translateRangeArea(input);
    if (r.status !== "supported") throw Error(JSON.stringify(r));
    chart.setOption(r.options, true);
    expect(chart.renderToSVGString()).toContain("label:2");
  } finally {
    chart.dispose();
  }
});

it("gives selected fields precedence and lower slots exact cell-boundary ties", () => {
  const i = areaInput();
  i.snapshot.rows = [
    { id: "a", category: "a", values: { amount: 5, other: 5 } },
    { id: "b", category: "b", values: { amount: 5, other: 5 } },
  ];
  for (const s of Object.values(i.style.fields)) s.marker.enabled = false;
  const r = translateRangeArea(i);
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(r.options);
    const targets = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((e) => e.type === "rect" && !e.silent);
    expect(targets).toHaveLength(4);
    const box = targets[3].getBoundingRect();
    const x = box.x + box.width;
    const y = box.y + box.height / 2;
    const selected = chart.getZr().findHover(x, y)?.target;
    expect(selected).toBe(targets[3]);
    const seen: unknown[] = [];
    chart.on("click", (p) => {
      seen.push(p.data);
    });
    chart.getZr().trigger("click", {
      target: selected,
      topTarget: selected,
      offsetX: x,
      offsetY: y,
      event: {},
    });
    expect(seen).toMatchObject([{ metadata: { fieldId: "other", groupSlot: 0 } }]);
    expect(box.height).toBe(1);
  } finally {
    chart.dispose();
  }
});

it("renders exact ticks, midpoint extrema, singleton suppression and clipped hit bounds", () => {
  const i = areaInput();
  for (const s of Object.values(i.style.fields)) {
    s.connectMissingData = true;
    s.marker.enabled = false;
  }
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  const render = () => {
    const r = translateRangeArea(i);
    if (r.status !== "supported") throw Error(JSON.stringify(r));
    chart.setOption(r.options, true);
    return new DOMParser().parseFromString(chart.renderToSVGString(), "image/svg+xml");
  };
  try {
    let dom = render();
    expect(
      Array.from(dom.querySelectorAll("text"))
        .filter((t) => t.textContent?.startsWith("axis:"))
        .map((t) => [t.textContent, t.getAttribute("transform")]),
    ).toEqual([
      ["axis:0", "translate(52 440)"],
      ["axis:3", "translate(52 380)"],
      ["axis:11", "translate(52 220)"],
      ["axis:20", "translate(52 40)"],
    ]);
    i.snapshot.rows = [
      { id: "a", category: "a", values: { amount: 9, other: 9 } },
      { id: "b", category: "b", values: { amount: 9, other: 9 } },
    ];
    i.style.valueScale = { min: 9, max: 9, ticks: [9] };
    dom = render();
    expect(dom.querySelector('path[fill="#145da0"]')?.getAttribute("d")).toBe(
      "M180 240L420 240L180 240Z",
    );
    expect(dom.querySelector('path[stroke="#ae1234"]')?.getAttribute("d")).toBe(
      "M180 240L420 240M180 240L420 240",
    );
    expect(
      Array.from(dom.querySelectorAll("text")).map((t) => t.textContent),
    ).toContain("axis:9");
    expect(
      Array.from(dom.querySelectorAll("text")).map((t) => t.textContent),
    ).toContain("label:9");
    expect(dom.documentElement.textContent).not.toContain("axis:0.5");
    i.snapshot.rows = i.snapshot.rows.slice(0, 1);
    dom = render();
    expect(
      dom.querySelectorAll('path[fill="#145da0"],path[stroke="#ae1234"]'),
    ).toHaveLength(0);
    i.snapshot.rows = [];
    dom = render();
    expect(Array.from(dom.querySelectorAll("text")).map((t) => t.textContent)).toEqual([
      "axis:9",
    ]);
    i.snapshot.rows = [
      { id: "a", category: "a", values: { amount: 2, other: 3 } },
      { id: "b", category: "a", values: { amount: 12, other: 15 } },
    ];
    i.style.valueScale = { min: 6, max: 9, ticks: [6, 7, 9] };
    dom = render();
    const hits = chart
      .getZr()
      .storage.getDisplayList(true)
      .filter((e) => e.type === "rect" && !e.silent);
    expect(hits.map((h) => h.getBoundingRect())).toMatchObject([
      { x: 60, y: 40, width: 480, height: 400 },
      { x: 60, y: 40, width: 480, height: 400 },
    ]);
    i.style.valueScale = null;
    dom = render();
    expect(
      dom.querySelectorAll('path[fill="#145da0"],path[stroke="#ae1234"]'),
    ).toHaveLength(0);
    expect(Array.from(dom.querySelectorAll("text")).map((t) => t.textContent)).toEqual([
      "period:a",
    ]);
  } finally {
    chart.dispose();
  }
});
it("keeps Area series IDs unique when field names contain role suffixes", () => {
  const input = areaInput();
  input.snapshot.selectedColumnIds = input.snapshot.selectedColumnIds.map((id) =>
    id === "other" ? "amount:targets" : id,
  );
  input.snapshot.columns = input.snapshot.columns.map((column) =>
    column.id === "other" ? { ...column, id: "amount:targets" } : column,
  );
  input.snapshot.rows = input.snapshot.rows.map((row) => ({
    ...row,
    values: { amount: row.values.amount, "amount:targets": row.values.other },
  }));
  input.style.fields["amount:targets"] = input.style.fields.other;
  delete input.style.fields.other;
  const result = translateRangeArea(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 600,
    height: 500,
  });
  try {
    chart.setOption(result.options);
    const series = chart.getOption().series as { id: string; name: string }[];
    expect(new Set(series.map((s) => s.id)).size).toBe(4);
    expect(new Set(series.map((s) => s.name))).toEqual(
      new Set(["amount", "amount:targets"]),
    );
  } finally {
    chart.dispose();
  }
});
