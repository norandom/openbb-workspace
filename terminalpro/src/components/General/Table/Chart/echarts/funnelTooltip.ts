import type { FunnelRenderInput } from "../application/funnelRenderTypes";
import { escapeHtml } from "./cartesianDisplay";
import type { FunnelGeometry } from "./funnelGeometry";

export function funnelTooltip(input: FunnelRenderInput, geometry: FunnelGeometry) {
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item" as const,
    confine: true,
    formatter: (params: unknown) => {
      if (!input.style.application.tooltip.enabled) return "";
      const index = (params as { dataIndex?: number })?.dataIndex;
      const shape = index === undefined ? undefined : geometry.stages[index];
      if (!shape) return "";
      const stage = input.data.stages[shape.index];
      if (stage.kind !== "value") return "";
      const title = escapeHtml(String(input.context.display.category(stage.category)));
      const field = escapeHtml(input.data.field.label);
      const value = escapeHtml(input.context.display.tooltipNumber(stage.value));
      return input.style.application.tooltip.mode === "compact"
        ? `${title} / ${field}: ${value}`
        : `<strong>${title}</strong><br/>${field}: ${value}`;
    },
  };
}
