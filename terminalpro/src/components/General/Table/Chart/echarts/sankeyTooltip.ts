import type { SankeyRenderInput } from "../application/sankeyTypes";
import type { SankeyNode } from "../compatibility/sankeyContracts";
import { escapeHtml } from "./cartesianDisplay";

const UNKNOWN_SCOPE =
  "Units or allocation scope unspecified; numerical balance is not financial reconciliation";

function identity(node: SankeyNode): string {
  return `${node.label} (${typeof node.raw}; identity ${node.id})`;
}

function metadata(input: SankeyRenderInput): string[] {
  const m = input.graph.metadata;
  return [
    `Unit: ${m.unit ?? "Unknown"}`,
    `Currency: ${m.currency ?? "Unknown"}`,
    `Scale: ${m.scale ?? "Unknown"} (base units per stored amount)`,
    `Period: ${m.period ?? "Unknown"}`,
    `Measure: ${m.measure ?? "Unknown"}`,
    ...(input.graph.reconciliation === "unspecified-units" ? [UNKNOWN_SCOPE] : []),
  ];
}

function nodeRows(input: SankeyRenderInput, node: SankeyNode): string[] {
  const number = input.context.display.tooltipNumber;
  if (node.role === "source")
    return [identity(node), "Source", `Outgoing: ${number(node.outgoing)}`];
  if (node.role === "sink")
    return [identity(node), "Sink", `Incoming: ${number(node.incoming)}`];
  return [
    identity(node),
    "Internal allocation",
    `Incoming: ${number(node.incoming)}`,
    `Outgoing: ${number(node.outgoing)}`,
    `Residual: ${String(node.residual)} (stored amount)`,
    `Tolerance: ${String(node.tolerance)}`,
    node.balanced
      ? "Balanced within numerical tolerance"
      : "Incomplete or imbalanced flow",
  ];
}

function dataId(params: unknown): { id: string; edge: boolean } | undefined {
  if (!params || typeof params !== "object" || !("data" in params)) return;
  const data = params.data;
  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof data.id !== "string"
  )
    return;
  return { id: data.id, edge: "dataType" in params && params.dataType === "edge" };
}

export function sankeyTooltip(input: SankeyRenderInput) {
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const links = new Map(input.graph.links.map((link) => [link.id, link]));
  const rows = new Map(input.graph.snapshot.rows.map((row) => [row.id, row]));
  const evidence = (ids: readonly string[]): string[] => [
    `Rows: ${ids.join(", ")}`,
    ...ids.flatMap((id) => {
      const row = rows.get(id);
      return row ? [`Provenance (${id}): ${JSON.stringify(row.provenance)}`] : [];
    }),
  ];
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item" as const,
    confine: true,
    formatter: (params: unknown): string => {
      const selected = dataId(params);
      if (!selected) return "";
      const node = nodes.get(selected.id);
      const link = links.get(selected.id);
      if (node && !selected.edge) {
        const rowIds = [
          ...new Set(
            input.graph.links.flatMap((edge) =>
              edge.source === node.id || edge.target === node.id ? edge.rowIds : [],
            ),
          ),
        ];
        return [...nodeRows(input, node), ...metadata(input), ...evidence(rowIds)]
          .map(escapeHtml)
          .join("<br/>");
      }
      if (!link) return "";
      const source = nodes.get(link.source);
      const target = nodes.get(link.target);
      if (!source || !target) return "";
      return [
        `Source: ${identity(source)}`,
        `Target: ${identity(target)}`,
        `Value: ${input.context.display.tooltipNumber(link.value)}`,
        ...metadata(input),
        ...evidence(link.rowIds),
      ]
        .map(escapeHtml)
        .join("<br/>");
    },
  };
}
