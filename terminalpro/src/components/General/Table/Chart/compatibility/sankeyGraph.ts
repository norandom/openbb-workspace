import { aggregateSankey, compensatedSum } from "./sankeyAggregation";
import type {
  BuildSankeyGraph,
  SankeyDiagnostic,
  SankeyLink,
  SankeyNode,
  SankeyRawId,
  SankeySnapshot,
} from "./sankeyContracts";
import { validateSankeySnapshot } from "./sankeySnapshot";
import {
  commonMetadata,
  completeMetadata,
  freezeSankey,
  sankeyFailure,
} from "./sankeyValidation";

function nodesOf(
  rawNodes: Map<string, SankeyRawId>,
  links: readonly SankeyLink[],
  diagnostics: SankeyDiagnostic[],
): SankeyNode[] {
  const nodes: SankeyNode[] = [];
  const flows = new Map<string, { inputs: SankeyLink[]; outputs: SankeyLink[] }>();
  for (const id of rawNodes.keys()) flows.set(id, { inputs: [], outputs: [] });
  for (const link of links) {
    flows.get(link.source)!.outputs.push(link);
    flows.get(link.target)!.inputs.push(link);
  }
  for (const [id, raw] of rawNodes) {
    const { inputs, outputs } = flows.get(id)!;
    if (![...inputs, ...outputs].some((link) => link.value > 0)) continue;
    const rowIds = [...new Set([...inputs, ...outputs].flatMap((link) => link.rowIds))];
    const incoming = compensatedSum(
      inputs.map((link) => link.value),
      rowIds,
    );
    const outgoing = compensatedSum(
      outputs.map((link) => link.value),
      rowIds,
    );
    const role =
      inputs.length && outputs.length ? "internal" : inputs.length ? "sink" : "source";
    const residual = role === "internal" ? incoming - outgoing : null;
    const tolerance =
      role === "internal"
        ? Math.max(1e-9, 1e-12 * Math.max(Math.abs(incoming), Math.abs(outgoing)))
        : null;
    const balanced = residual === null ? null : Math.abs(residual) <= tolerance!;
    nodes.push({
      id,
      raw,
      label: String(raw),
      role,
      incoming,
      outgoing,
      residual,
      tolerance,
      balanced,
    });
    if (balanced === false)
      diagnostics.push({
        code: "sankey-imbalance",
        severity: "warning",
        path: ["nodes", id],
        rowIds,
        nodeId: id,
        message: `Incomplete or imbalanced flow: incoming ${incoming}, outgoing ${outgoing}, residual ${residual}, tolerance ${tolerance}`,
      });
  }
  return nodes;
}
function build(snapshot: SankeySnapshot) {
  const diagnostics: SankeyDiagnostic[] = [];
  const metadata = commonMetadata(snapshot.selection.metadata, snapshot.rows);
  const declared =
    snapshot.rows.length > 0 &&
    snapshot.rows.every((row) => completeMetadata(row.metadata));
  if (!declared)
    diagnostics.push({
      code: "sankey-unspecified-units",
      severity: "warning",
      path: ["selection", "metadata"],
      rowIds: snapshot.rows
        .filter((row) => !completeMetadata(row.metadata))
        .map((row) => row.id),
      message:
        "Units or allocation scope unspecified; numerical balance is not financial reconciliation",
    });
  const aggregated = aggregateSankey(snapshot);
  const links = aggregated.links.filter((link) => link.value > 0);
  const nodes = nodesOf(aggregated.rawNodes, aggregated.links, diagnostics);
  if (!snapshot.rows.length)
    return { status: "empty" as const, reason: "no-rows" as const, diagnostics };
  if (!links.length)
    return { status: "empty" as const, reason: "zero-only" as const, diagnostics };
  return {
    status: "ready" as const,
    graph: {
      snapshot,
      nodes,
      links,
      metadata,
      reconciliation: declared
        ? ("declared-units" as const)
        : ("unspecified-units" as const),
    },
    diagnostics,
  };
}
export const buildSankeyGraph: BuildSankeyGraph = (input) => {
  const validated = validateSankeySnapshot(input);
  if (!validated.valid)
    return { status: "invalid", diagnostics: validated.diagnostics };
  try {
    return freezeSankey(build(validated.snapshot));
  } catch (error) {
    const diagnostic = sankeyFailure(error) ?? {
      code: "invalid-sankey",
      path: [],
      message: "Graph could not be built safely",
      rowIds: [],
      severity: "error" as const,
    };
    return { status: "invalid", diagnostics: [diagnostic] };
  }
};
