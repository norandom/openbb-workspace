import { init } from "echarts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SankeyRenderInput } from "../../../src/components/General/Table/Chart/application/sankeyTypes";
import type { SankeyGraph } from "../../../src/components/General/Table/Chart/compatibility/sankeyContracts";
import { fallbackDisplay } from "../../../src/components/General/Table/Chart/echarts/cartesianDisplay";
import { translateSankey } from "../../../src/components/General/Table/Chart/echarts/sankey";
import { sankeyTooltip } from "../../../src/components/General/Table/Chart/echarts/sankeyTooltip";

function input(): SankeyRenderInput {
  const metadata = {
    unit: "currency",
    currency: "USD",
    scale: 1,
    period: "FY2025",
    measure: "income-allocation",
  };
  const ids = ['["number",1]', '["string","1"]', '["string","<sink>"]'];
  const graph: SankeyGraph = {
    metadata,
    reconciliation: "declared-units",
    snapshot: {
      kind: "sankey",
      sourceMode: "flat",
      stateAddress: "s",
      dataRevision: 1,
      originalModel: {},
      selectedRange: {},
      selectedColumnIds: ["source", "target", "value"],
      columns: [
        { id: "source", label: "Source", role: "category" },
        { id: "target", label: "Target", role: "category" },
        { id: "value", label: "Amount", role: "number" },
      ],
      selection: {
        sourceColumnId: "source",
        targetColumnId: "target",
        valueColumnId: "value",
        metadata,
        metadataColumnIds: {},
      },
      rows: [
        {
          id: "row<1>",
          source: 1,
          target: "1",
          value: 10,
          metadata,
          provenance: { source: "<untrusted>" },
        },
        {
          id: "row2",
          source: "1",
          target: "<sink>",
          value: 9,
          metadata,
          provenance: {},
        },
      ],
    },
    nodes: [
      {
        id: ids[0],
        raw: 1,
        label: "1",
        role: "source",
        incoming: 0,
        outgoing: 10,
        residual: null,
        tolerance: null,
        balanced: null,
      },
      {
        id: ids[1],
        raw: "1",
        label: "1",
        role: "internal",
        incoming: 10,
        outgoing: 9,
        residual: 1,
        tolerance: 1e-9,
        balanced: false,
      },
      {
        id: ids[2],
        raw: "<sink>",
        label: "<sink>",
        role: "sink",
        incoming: 9,
        outgoing: 0,
        residual: null,
        tolerance: null,
        balanced: null,
      },
    ],
    links: [
      {
        id: JSON.stringify([ids[0], ids[1]]),
        source: ids[0],
        target: ids[1],
        value: 10,
        rowIds: ["row<1>"],
      },
      {
        id: JSON.stringify([ids[1], ids[2]]),
        source: ids[1],
        target: ids[2],
        value: 9,
        rowIds: ["row2"],
      },
    ],
  };
  const font = {
    font: "Arial",
    weight: "normal",
    size: 12,
    color: "#222",
    fontWeight: "normal",
    fontStyle: "normal",
  };
  return {
    graph,
    style: {
      application: {
        title: { ...font, enabled: true, text: "Income allocation", spacing: 5 },
        subtitle: { ...font, enabled: true, text: "USD FY2025", spacing: 3 },
        padding: { top: 10, right: 20, bottom: 30, left: 40 },
        background: { visible: true, fill: "#fff" },
        tooltip: { enabled: true, mode: "single" },
      },
      palette: ["#123456", "#abcdef"],
      textColor: "#222",
      fontFamily: "Arial",
      fontSize: 12,
      nodeWidth: 20,
      nodeGap: 12,
      linkOpacity: 0.45,
      labels: true,
    },
    context: { display: fallbackDisplay(2), viewport: { width: 640, height: 480 } },
  };
}

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);

function fanout(values: readonly number[], height = 480): SankeyRenderInput {
  const base = input();
  const source = JSON.stringify(["string", "source"]);
  const ids = values.map((_, index) => JSON.stringify(["string", `sink${index}`]));
  const graph: SankeyGraph = {
    ...base.graph,
    nodes: [
      {
        id: source,
        raw: "source",
        label: "Source",
        role: "source",
        incoming: 0,
        outgoing: values.reduce((sum, value) => sum + value, 0),
        residual: null,
        tolerance: null,
        balanced: null,
      },
      ...values.map((value, index) => ({
        id: ids[index],
        raw: `sink${index}`,
        label: `Sink ${index}`,
        role: "sink" as const,
        incoming: value,
        outgoing: 0,
        residual: null,
        tolerance: null,
        balanced: null,
      })),
    ],
    links: values.map((value, index) => ({
      id: JSON.stringify([source, ids[index]]),
      source,
      target: ids[index],
      value,
      rowIds: [`r${index}`],
    })),
    snapshot: {
      ...base.graph.snapshot,
      rows: values.map((value, index) => ({
        id: `r${index}`,
        source: "source",
        target: `sink${index}`,
        value,
        metadata: base.graph.metadata,
        provenance: {},
      })),
    },
  };
  return {
    ...base,
    graph,
    context: {
      ...base.context,
      viewport: { width: 640, height },
      display: { ...base.context.display, tooltipNumber: String },
    },
    style: {
      ...base.style,
      application: {
        ...base.style.application,
        title: { ...base.style.application.title, enabled: false },
        subtitle: { ...base.style.application.subtitle, enabled: false },
      },
    },
  };
}

function assertPositiveNative(
  chart: ReturnType<typeof init>,
  nodes: number,
  links: number,
) {
  expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  const model = (chart as any).getModel().getSeriesByIndex(0);
  const data = model.getData();
  expect(data.count()).toBe(nodes);
  for (let index = 0; index < data.count(); index++) {
    const layout = data.getItemLayout(index);
    expect([layout.x, layout.y, layout.dx, layout.dy].every(Number.isFinite)).toBe(
      true,
    );
    expect(layout.dx).toBeGreaterThan(0);
    expect(layout.dy).toBeGreaterThan(0);
  }
  const edges = model.getGraph().edgeData;
  expect(edges.count()).toBe(links);
  for (let index = 0; index < edges.count(); index++) {
    expect(edges.getItemLayout(index).dy).toBeGreaterThan(0);
    expect(Number.isFinite(edges.getItemLayout(index).dy)).toBe(true);
  }
}

describe("inactive native Sankey presentation", () => {
  it("renders positive subnormal financial amounts with finite native geometry and original tooltip values", () => {
    const i = fanout([Number.MIN_VALUE]);
    const before = JSON.stringify(i);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 480,
    });
    try {
      const r = translateSankey(i);
      if (r.status !== "supported") throw Error("subnormal graph rejected");
      chart.setOption(r.options);
      assertPositiveNative(chart, 2, 1);
      expect(
        sankeyTooltip(i).formatter({
          dataType: "edge",
          data: { id: i.graph.links[0].id },
        }),
      ).toContain("Value: 5e-324");
      expect(JSON.stringify(i)).toBe(before);
    } finally {
      chart.dispose();
    }
  });

  it("fits crowded native layers into short viewports and restores default gaps on resize", () => {
    const i = fanout(
      Array.from({ length: 20 }, () => 1),
      100,
    );
    const before = JSON.stringify(i);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 100,
    });
    try {
      const r = translateSankey(i);
      if (r.status !== "supported") throw Error("compact graph rejected");
      chart.setOption(r.options);
      assertPositiveNative(chart, 21, 20);
      expect((r.options.series as any[])[0].nodeGap).toBeLessThan(60 / 19);
      chart.resize({ width: 640, height: 480 });
      const restored = translateSankey({
        ...i,
        context: { ...i.context, viewport: { width: 640, height: 480 } },
      });
      if (restored.status !== "supported") throw Error("restored graph rejected");
      expect((restored.options.series as any[])[0].nodeGap).toBe(12);
      chart.setOption(restored.options, { notMerge: true });
      assertPositiveNative(chart, 21, 20);
      expect(JSON.stringify(i)).toBe(before);
    } finally {
      chart.dispose();
    }
  });

  it("rejects unrepresentable positive geometry ratios without dropping links, and permits corrected values", () => {
    const i = fanout([Number.MIN_VALUE, 1e308]);
    const before = JSON.stringify(i);
    const rejected = translateSankey(i);
    expect(rejected.status).toBe("invalid");
    expect(rejected).not.toHaveProperty("options");
    expect(JSON.stringify(i)).toBe(before);
    const corrected = fanout([1, 2]);
    const r = translateSankey(corrected);
    if (r.status !== "supported") throw Error("corrected graph rejected");
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 480,
    });
    try {
      chart.setOption(r.options);
      assertPositiveNative(chart, 3, 2);
    } finally {
      chart.dispose();
    }
  });

  it("preserves typed identities, economic widths and immutable inputs with inherited chrome", () => {
    const i = input();
    const before = JSON.stringify(i);
    const r = translateSankey(i);
    expect(r.status).toBe("supported");
    if (r.status !== "supported") throw Error("fixture");
    const s = (r.options.series as any[])[0];
    expect(s).toMatchObject({
      type: "sankey",
      orient: "horizontal",
      draggable: false,
      animation: false,
      nodeWidth: 20,
      nodeGap: 12,
      lineStyle: { opacity: 0.45 },
      left: 40,
      right: 20,
      bottom: 30,
    });
    expect(s.top).toBeGreaterThan(10);
    expect(s.data.map((n: any) => n.name)).toEqual(i.graph.nodes.map((n) => n.id));
    expect(s.data.map((n: any) => n.value)).toEqual([1, 1, 0.9]);
    expect(s.links.map((l: any) => [l.source, l.target, l.value])).toEqual(
      i.graph.links.map((l) => [l.source, l.target, l.value / 10]),
    );
    expect(r.options.title).toMatchObject({
      text: "Income allocation",
      subtext: "USD FY2025",
    });
    expect(r.options.backgroundColor).toBe("#fff");
    expect(r.options).not.toHaveProperty("xAxis");
    expect(r.options).not.toHaveProperty("legend");
    s.data[0].value = 999;
    s.links[0].value = 999;
    expect(JSON.stringify(i)).toBe(before);
  });

  it("escapes labels, row identities, metadata, provenance and display formatter output", () => {
    const base = input();
    const i = {
      ...base,
      graph: {
        ...base.graph,
        metadata: { ...base.graph.metadata, period: "<period>" },
      },
      context: {
        ...base.context,
        display: {
          ...base.context.display,
          tooltipNumber: (value: number) => `<b>${value}</b>`,
        },
      },
    };
    const t = sankeyTooltip(i);
    const link = t.formatter({ dataType: "edge", data: { id: i.graph.links[0].id } });
    expect(link).toContain("&lt;b&gt;10&lt;/b&gt;");
    expect(link).toContain("row&lt;1&gt;");
    expect(link).toContain("&lt;untrusted&gt;");
    expect(link).toContain("&lt;period&gt;");
    expect(link).toContain("USD");
    expect(link).toContain("Scale: 1");
    expect(link).toContain("income-allocation");
    expect(link).toContain("number");
    expect(link).toContain("string");
    expect(link).not.toContain("<untrusted>");
    expect(t.formatter({ data: { id: "unknown" } })).toBe("");
  });

  it("distinguishes internal residual/tolerance from source and sink observations", () => {
    const i = input();
    const t = sankeyTooltip(i);
    const node = (n: number) =>
      t.formatter({ dataType: "node", data: { id: i.graph.nodes[n].id } });
    expect(node(1)).toContain("Incoming: 10.00");
    expect(node(1)).toContain("Outgoing: 9.00");
    expect(node(1)).toContain("Residual: 1 (stored amount)");
    expect(node(1)).toContain("Tolerance: 1e-9");
    expect(node(1)).toContain("Incomplete or imbalanced flow");
    expect(node(0)).toContain("Source");
    expect(node(0)).not.toContain("Incoming:");
    expect(node(2)).toContain("Sink");
    expect(node(2)).not.toContain("Outgoing:");
    const balanced = {
      ...i,
      graph: {
        ...i.graph,
        nodes: i.graph.nodes.map((n) =>
          n.role === "internal" ? { ...n, residual: 0, balanced: true } : n,
        ),
      },
    };
    expect(
      sankeyTooltip(balanced).formatter({ data: { id: i.graph.nodes[1].id } }),
    ).toContain("Balanced within numerical tolerance");
    const tinyResidual = {
      ...i,
      graph: {
        ...i.graph,
        nodes: i.graph.nodes.map((n) =>
          n.role === "internal" ? { ...n, residual: 1e-10, balanced: true } : n,
        ),
      },
    };
    expect(
      sankeyTooltip(tinyResidual).formatter({ data: { id: i.graph.nodes[1].id } }),
    ).toContain("Residual: 1e-10 (stored amount)");
  });

  it("keeps unknown financial scope explicit and honors disabled tooltips/labels and theme", () => {
    const base = input();
    const i = {
      ...base,
      graph: {
        ...base.graph,
        metadata: {
          unit: null,
          currency: null,
          scale: null,
          period: null,
          measure: null,
        },
        reconciliation: "unspecified-units" as const,
      },
      style: {
        ...base.style,
        labels: false,
        textColor: "#eee",
        palette: ["#ff0000"],
        application: {
          ...base.style.application,
          background: { visible: false, fill: "#000" },
          tooltip: { enabled: false, mode: "single" },
        },
      },
    };
    const t = sankeyTooltip(i);
    expect(t.show).toBe(false);
    expect(t.formatter({ data: { id: i.graph.nodes[0].id } })).toContain(
      "Unit: Unknown",
    );
    expect(t.formatter({ data: { id: i.graph.nodes[0].id } })).toContain(
      "numerical balance is not financial reconciliation",
    );
    const r = translateSankey(i);
    if (r.status !== "supported") throw Error("fixture");
    expect(r.options.backgroundColor).toBe("transparent");
    expect((r.options.series as any[])[0]).toMatchObject({
      label: { show: false, color: "#eee" },
      data: [
        { itemStyle: { color: "#ff0000" } },
        { itemStyle: { color: "#ff0000" } },
        { itemStyle: { color: "#ff0000" } },
      ],
    });
    expect(i.graph.links.map((l) => l.value)).toEqual([10, 9]);
  });

  it.each([
    { nodeWidth: 0 },
    { nodeGap: -1 },
    { linkOpacity: 1.1 },
    { linkOpacity: Number.NaN },
    { fontSize: Number.POSITIVE_INFINITY },
    { palette: [] },
    { palette: ["not-a-color"] },
    { textColor: "url(unsafe)" },
  ])("rejects invalid style without partial options %j", (patch) => {
    const i = input();
    const r = translateSankey({ ...i, style: { ...i.style, ...patch } });
    expect(r.status).toBe("invalid");
    expect(r).not.toHaveProperty("options");
  });

  it("renders real native link paths with finite left-to-right geometry and recovers after tiny viewport", () => {
    const i = input();
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 480,
    });
    try {
      const r = translateSankey(i);
      if (r.status !== "supported") throw Error("fixture");
      chart.setOption(r.options);
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
      const list = chart.getZr().storage.getDisplayList();
      expect(list.filter((el) => el.type === "path")).toHaveLength(2);
      for (const el of list) {
        const b = el.getBoundingRect();
        expect([b.x, b.y, b.width, b.height].every(Number.isFinite)).toBe(true);
      }
      const model = (chart as any).getModel().getSeriesByIndex(0).getData();
      expect(model.count()).toBe(3);
      for (const index of [0, 1, 2]) {
        expect(model.getItemGraphicEl(index).type).toBe("rect");
        expect(model.getItemGraphicEl(index).getBoundingRect().height).toBeGreaterThan(
          0,
        );
      }
      expect([0, 1, 2].map((n) => model.getItemLayout(n).x)).toEqual([0, 280, 560]);
      const tiny = translateSankey({
        ...i,
        context: { ...i.context, viewport: { width: 0, height: 0 } },
      });
      if (tiny.status !== "supported") throw Error("tiny fixture");
      expect((tiny.options.series as any[])[0].data).toEqual([]);
      chart.setOption(tiny.options, { notMerge: true });
      chart.setOption(r.options, { notMerge: true });
      expect(
        chart
          .getZr()
          .storage.getDisplayList()
          .filter((el) => el.type === "path"),
      ).toHaveLength(2);
    } finally {
      chart.dispose();
    }
  });
});
