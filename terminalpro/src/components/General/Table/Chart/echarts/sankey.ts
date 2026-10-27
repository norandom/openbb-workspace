import { color, type EChartsOption } from "echarts";
import type { SankeyRenderInput, TranslateSankey } from "../application/sankeyTypes";
import type { SankeyGraph } from "../compatibility/sankeyContracts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import { sankeyTooltip } from "./sankeyTooltip";

function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite Sankey input");
  if (value && typeof value === "object") Object.values(value).forEach(finite);
}

function admit(input: SankeyRenderInput): void {
  const s = input.style;
  const a = s.application;
  finite(s);
  finite(input.context.viewport);
  const dimensions = [
    ...Object.values(input.context.viewport),
    ...Object.values(a.padding),
    s.nodeGap,
    s.fontSize,
    a.title.size,
    a.title.spacing,
    a.subtitle.size,
    a.subtitle.spacing,
  ];
  if (
    dimensions.some((n) => typeof n !== "number" || n < 0) ||
    typeof s.nodeWidth !== "number" ||
    s.nodeWidth <= 0 ||
    typeof s.linkOpacity !== "number" ||
    s.linkOpacity < 0 ||
    s.linkOpacity > 1
  )
    throw Error("Invalid Sankey dimensions or opacity");
  if (
    !s.palette.length ||
    [
      ...s.palette,
      s.textColor,
      a.background.fill,
      a.title.color,
      a.subtitle.color,
    ].some((c) => typeof c !== "string" || !color.parse(c))
  )
    throw Error("Invalid Sankey color");
  if (
    typeof s.labels !== "boolean" ||
    typeof a.tooltip.enabled !== "boolean" ||
    ![s.fontFamily, a.title.font, a.subtitle.font].every(
      (font) => typeof font === "string" && font.trim(),
    )
  )
    throw Error("Invalid Sankey typography or visibility");
}

function chrome(input: SankeyRenderInput) {
  const a = input.style.application;
  const captions = [a.title, a.subtitle].reduce(
    (sum, caption) =>
      sum +
      (caption.enabled && caption.text
        ? measureText(caption.text, caption).height + caption.spacing
        : 0),
    0,
  );
  return {
    backgroundColor: a.background.visible ? a.background.fill : "transparent",
    title: {
      show: a.title.enabled || a.subtitle.enabled,
      text: a.title.enabled ? a.title.text : "",
      subtext: a.subtitle.enabled ? a.subtitle.text : "",
      textStyle: fontStyle(a.title),
      subtextStyle: fontStyle(a.subtitle),
      itemGap: a.title.enabled && a.title.text ? a.title.spacing : 0,
      padding: 0,
      top: a.padding.top,
      left: "center",
    },
    padding: { ...a.padding, top: a.padding.top + captions },
  };
}

function layers(graph: SankeyGraph): Map<string, number> {
  const state = new Map(
    graph.nodes.map((node) => [
      node.id,
      { depth: 0, remaining: 0, targets: [] as string[] },
    ]),
  );
  for (const link of graph.links.filter((edge) => edge.value > 0)) {
    state.get(link.source)!.targets.push(link.target);
    state.get(link.target)!.remaining++;
  }
  const queue = [...state.keys()].filter((id) => state.get(id)!.remaining === 0);
  for (let index = 0; index < queue.length; index++) {
    const node = state.get(queue[index])!;
    for (const target of node.targets) {
      const next = state.get(target)!;
      next.depth = Math.max(next.depth, node.depth + 1);
      if (--next.remaining === 0) queue.push(target);
    }
  }
  if (queue.length !== state.size)
    throw new RangeError("Sankey geometry requires an acyclic positive flow.");
  const last = [...state.values()].reduce(
    (depth, node) => Math.max(depth, node.depth),
    0,
  );
  return new Map(
    [...state].map(([id, node]) => [id, node.targets.length ? node.depth : last]),
  );
}

function geometry(input: SankeyRenderInput, height: number) {
  const graph = input.graph;
  const depth = layers(graph);
  // One geometry scale protects native arithmetic; retained amounts and tooltips stay raw.
  const scale = graph.nodes.reduce(
    (max, node) => Math.max(max, node.incoming, node.outgoing),
    0,
  );
  if (!(scale > 0) || !Number.isFinite(scale))
    throw new RangeError("Sankey geometry requires finite positive node values.");
  const weights = new Map(
    graph.nodes.map((node) => [
      node.id,
      {
        incoming: 0,
        outgoing: 0,
        value: Math.max(node.incoming, node.outgoing) / scale,
      },
    ]),
  );
  const positive = graph.links.filter((link) => link.value > 0);
  for (const link of positive) {
    weights.get(link.source)!.outgoing += link.value / scale;
    weights.get(link.target)!.incoming += link.value / scale;
  }
  const columns = new Map<number, { count: number; total: number }>();
  for (const [id, node] of weights) {
    const level = depth.get(id)!;
    const column = columns.get(level) ?? { count: 0, total: 0 };
    column.count++;
    column.total += Math.max(node.value, node.incoming, node.outgoing);
    columns.set(level, column);
  }
  const population = [...columns.values()].reduce(
    (max, column) => Math.max(max, column.count),
    1,
  );
  // Reserve positive node area when default gaps do not fit a compact widget.
  const gap =
    input.style.nodeGap * (population - 1) < height
      ? input.style.nodeGap
      : height / (2 * Math.max(1, population - 1));
  const ky = [...columns.values()].reduce(
    (min, column) => Math.min(min, (height - (column.count - 1) * gap) / column.total),
    Number.POSITIVE_INFINITY,
  );
  const values = [...weights.values()]
    .map((node) => node.value)
    .concat(positive.map((link) => link.value / scale));
  if (
    !Number.isFinite(ky) ||
    ky <= 0 ||
    values.some((value) => !Number.isFinite(value * ky) || value * ky <= 0)
  )
    throw new RangeError(
      "Positive flow ratios cannot be represented safely at this viewport size. Adjust the value range or enlarge the chart.",
    );
  return { scale, gap, depth };
}

function series(
  input: SankeyRenderInput,
  padding: SankeyRenderInput["style"]["application"]["padding"],
) {
  const {
    graph,
    style: s,
    context: { viewport },
  } = input;
  const visible =
    viewport.width > padding.left + padding.right + s.nodeWidth &&
    viewport.height > padding.top + padding.bottom;
  const plan = visible
    ? geometry(input, viewport.height - padding.top - padding.bottom)
    : { scale: 1, gap: s.nodeGap, depth: new Map<string, number>() };
  const nodes = graph.nodes.map((node, index) => ({
    id: node.id,
    name: node.id,
    displayLabel: node.label,
    depth: plan.depth.get(node.id),
    // Internal transfers occupy max(incoming, outgoing), never their economic double-count.
    value: Math.max(node.incoming, node.outgoing) / plan.scale,
    itemStyle: { color: s.palette[index % s.palette.length] },
    label: { position: node.outgoing === 0 ? "left" : "right" },
  }));
  const links = graph.links
    .filter((link) => link.value > 0)
    .map((link) => ({
      id: link.id,
      source: link.source,
      target: link.target,
      value: link.value / plan.scale,
    }));
  finite(nodes);
  finite(links);
  return {
    id: "qopenbb-sankey",
    type: "sankey" as const,
    orient: "horizontal" as const,
    ...padding,
    draggable: false,
    animation: false,
    layoutIterations: 0,
    nodeWidth: s.nodeWidth,
    nodeGap: plan.gap,
    nodeAlign: "justify" as const,
    data: visible ? nodes : [],
    links: visible ? links : [],
    lineStyle: { color: "source", opacity: s.linkOpacity },
    label: {
      show: s.labels,
      color: s.textColor,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      formatter: (params: { data?: unknown }) => {
        const data = params.data;
        return data && typeof data === "object" && "displayLabel" in data
          ? String(data.displayLabel)
          : "";
      },
    },
    emphasis: { focus: "adjacency" as const },
  };
}

/** The existing host retains resize, export and disposal ownership. */
export const translateSankey: TranslateSankey = (input) => {
  try {
    admit(input);
    const c = chrome(input);
    const options = {
      animation: false,
      backgroundColor: c.backgroundColor,
      title: c.title,
      textStyle: {
        color: input.style.textColor,
        fontFamily: input.style.fontFamily,
        fontSize: input.style.fontSize,
      },
      tooltip: sankeyTooltip(input),
      series: [series(input, c.padding)],
    } as EChartsOption;
    return { status: "supported", options };
  } catch (error) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: error instanceof RangeError ? "unsafe-geometry" : "invalid-input",
          path: error instanceof RangeError ? ["graph"] : ["style"],
          message:
            error instanceof RangeError
              ? error.message
              : "Sankey input could not be safely projected into finite native geometry.",
        },
      ],
    };
  }
};
