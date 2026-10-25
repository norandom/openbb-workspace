import { escapeHtml } from "./cartesianDisplay";
import type { HierarchyData } from "./hierarchyData";
import type { HierarchyMappingInput } from "./hierarchyModel";

function nodeId(params: unknown): string | undefined {
  if (!params || typeof params !== "object" || !("data" in params)) return;
  const data = params.data;
  return data && typeof data === "object" && "id" in data && typeof data.id === "string"
    ? data.id
    : undefined;
}
export function hierarchyTooltip(input: HierarchyMappingInput, model: HierarchyData) {
  return {
    show: input.style.tooltip.enabled,
    trigger: "item" as const,
    confine: true,
    formatter: (params: unknown): string => {
      const id = nodeId(params);
      const meta = id === undefined ? undefined : model.metadata.get(id);
      if (!meta) return "";
      const node = meta.node;
      const title = escapeHtml(node.label ?? "");
      if (node.children.length)
        return input.family === "treemap" ? title : `${title}<br/>${title}`;
      const assignments = input.projection.assignments;
      const ids =
        input.family === "treemap"
          ? [assignments.colorId, assignments.sizeId]
          : input.style.tooltip.mode === "compact"
            ? []
            : [assignments.sizeId];
      const rows = ids.flatMap((key) => {
        const value = key === undefined ? undefined : node.datum?.values[key];
        if (typeof value !== "number" || !Number.isFinite(value)) return [];
        const column = input.projection.numericColumns.find((c) => c.id === key);
        return [{ value, label: column?.label ?? key ?? "" }];
      });
      if (input.family === "treemap") rows.sort((a, b) => b.value - a.value);
      const content = rows.map(
        (row) =>
          `${escapeHtml(row.label)}: ${escapeHtml(input.context.display.tooltipNumber(row.value))}`,
      );
      return [title, ...content].filter(Boolean).join("<br/>");
    },
  };
}
