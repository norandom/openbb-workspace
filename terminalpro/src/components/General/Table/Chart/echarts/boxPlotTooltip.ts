import { boxDisplayText } from "./boxPlotAdmission";
import type { BoxPlotMappingInput, BoxPlotProjection } from "./boxPlotTypes";
import { escapeHtml } from "./cartesianDisplay";

type Parameter = {
  readonly axisValue?: unknown;
  readonly data?: {
    readonly metadata?: { readonly fieldId?: unknown; readonly groupSlot?: unknown };
  };
};
function identity(value: unknown): { slot: number; fieldId?: string } | undefined {
  if (!value || typeof value !== "object") return;
  const p = value as Parameter;
  const metadata = p.data?.metadata;
  const slot = Number(metadata?.groupSlot ?? p.axisValue);
  if (!Number.isInteger(slot) || slot < 0) return;
  return {
    slot,
    fieldId: typeof metadata?.fieldId === "string" ? metadata.fieldId : undefined,
  };
}
export function boxPlotTooltip(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  empty: boolean,
) {
  const mode = input.style.application.tooltip.mode;
  const display = input.context.display;
  const rows = projection.fields.map((field) =>
    field.data.map((d) => {
      if (!d.summary) return "";
      const s = d.summary;
      const values = [s.min, s.q1, s.median, s.q3, s.max].map((v) => {
        const text = display.tooltipNumber(v);
        if (typeof text !== "string")
          throw Error("Box tooltip callback must return text.");
        return escapeHtml(text);
      });
      return `${escapeHtml(field.descriptor.label)}<br/>${[
        "Min",
        "Q1",
        "Median",
        "Q3",
        "Max",
      ]
        .map((name, index) => `${name}: ${values[index]}`)
        .join("<br/>")}`;
    }),
  );
  const headings = projection.groups.map((g) =>
    escapeHtml(boxDisplayText(display.category(g.category))),
  );
  return {
    show: input.style.application.tooltip.enabled,
    trigger: mode === "shared" ? ("axis" as const) : ("item" as const),
    axisPointer: {
      axis: input.style.direction === "vertical" ? ("x" as const) : ("y" as const),
      type: "line" as const,
    },
    formatter: (params: unknown): string => {
      if (empty) return "";
      const hit = identity(Array.isArray(params) ? params[0] : params);
      if (!hit || hit.slot >= headings.length) return "";
      const body = projection.fields
        .flatMap((field, index) =>
          field.enabled &&
          (mode === "shared" || field.descriptor.id === hit.fieldId) &&
          rows[index][hit.slot]
            ? [rows[index][hit.slot]]
            : [],
        )
        .join("<br/>");
      return body && mode !== "compact" ? `${headings[hit.slot]}<br/>${body}` : body;
    },
  };
}
