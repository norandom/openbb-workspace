import { escapeHtml } from "./cartesianDisplay";
import { rangeDisplayText } from "./rangeBarAdmission";
import { rangeCoordinate } from "./rangeBarAxes";
import type {
  RangeBarMappingInput,
  RangeBarProjection,
  RangeBarText,
} from "./rangeBarTypes";

export function prepareRangeText(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
): RangeBarText {
  const d = input.context.display;
  const categories = projection.groups.map((g) =>
    rangeDisplayText(d.category(g.category)),
  );
  const pointers = projection.groups.map((g) =>
    rangeDisplayText(d.crosshair(g.category)),
  );
  const ticks = new Map(
    (input.style.valueScale?.ticks ?? []).map((v) => [
      rangeCoordinate(v, input),
      rangeDisplayText(d.numericAxis(v)),
    ]),
  );
  const endpoints = projection.fields.map((field) =>
    field.data.map((datum) => {
      if (
        !input.style.valueScale ||
        !field.enabled ||
        !datum.summary ||
        !input.style.fields[field.descriptor.id].label.enabled
      )
        return null;
      return [
        rangeDisplayText(d.seriesLabel(datum.summary.min)),
        rangeDisplayText(d.seriesLabel(datum.summary.max)),
      ] as const;
    }),
  );
  const tooltipRows = projection.fields.map((field) =>
    field.data.map((datum) => {
      if (
        !input.style.valueScale ||
        !input.style.tooltip.enabled ||
        !field.enabled ||
        !datum.summary
      )
        return "";
      const values = [datum.summary.min, datum.summary.max].map((v) => {
        const t = d.tooltipNumber(v);
        if (typeof t !== "string")
          throw Error("Range Bar tooltip callback must return text.");
        return escapeHtml(t);
      });
      return `${escapeHtml(field.descriptor.label)}: ${values[0]} - ${values[1]}`;
    }),
  );
  return { categories, pointers, ticks, endpoints, tooltipRows };
}
type Parameter = {
  readonly axisValue?: unknown;
  readonly data?: {
    readonly metadata?: { readonly fieldId?: unknown; readonly groupSlot?: unknown };
  };
};
function identity(value: unknown): { slot: number; fieldId?: string } | undefined {
  if (!value || typeof value !== "object") return;
  const p = value as Parameter;
  const m = p.data?.metadata;
  const slot = m?.groupSlot ?? p.axisValue;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) return;
  return { slot, fieldId: typeof m?.fieldId === "string" ? m.fieldId : undefined };
}
export function rangeBarTooltip(
  input: RangeBarMappingInput,
  projection: RangeBarProjection,
  text: RangeBarText,
) {
  const { mode, enabled } = input.style.tooltip;
  const headings = text.categories.map(escapeHtml);
  return {
    show: enabled && input.style.valueScale !== null,
    trigger: mode === "shared" ? ("axis" as const) : ("item" as const),
    axisPointer: {
      axis: input.style.direction === "vertical" ? ("x" as const) : ("y" as const),
      type: "line" as const,
    },
    formatter: (params: unknown): string => {
      if (!enabled || input.style.valueScale === null) return "";
      const hit = identity(Array.isArray(params) ? params[0] : params);
      if (!hit || hit.slot >= headings.length) return "";
      const rows = projection.fields.flatMap((f, n) =>
        f.enabled &&
        (mode === "shared" || f.descriptor.id === hit.fieldId) &&
        text.tooltipRows[n][hit.slot]
          ? [text.tooltipRows[n][hit.slot]]
          : [],
      );
      const body = rows.join("<br/>");
      return body && mode !== "compact" ? `${headings[hit.slot]}<br/>${body}` : body;
    },
  };
}
