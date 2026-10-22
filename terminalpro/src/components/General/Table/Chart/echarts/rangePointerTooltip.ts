import { escapeHtml } from "./cartesianDisplay";
import { rangeDisplayText } from "./rangeBarAdmission";
import type { RangeBarProjection } from "./rangeBarTypes";
import type { RangeComposed } from "./rangeLiveTypes";
import type { RangePickCandidate } from "./rangePointerTypes";

export function rangeSharedTooltipRows(
  projection: RangeBarProjection,
  picked: Pick<RangePickCandidate, "fieldSlot" | "groupSlot">,
  tooltipEnabled: readonly boolean[],
) {
  const category = projection.groups[picked.groupSlot]?.category;
  return projection.fields.flatMap((field, fieldSlot) => {
    if (!field.enabled || !tooltipEnabled[fieldSlot]) return [];
    const datum =
      fieldSlot === picked.fieldSlot
        ? field.data.find((d) => d.groupSlot === picked.groupSlot && d.summary)
        : field.data.find(
            (d) => d.summary && projection.groups[d.groupSlot]?.category === category,
          );
    return datum ? [{ fieldSlot, groupSlot: datum.groupSlot }] : [];
  });
}
/** Gap repair: valid picked observations format their own raw pair, without compact-node indexing. */
export function rangePointerTooltip(
  composed: RangeComposed,
  picked: RangePickCandidate,
  tooltipEnabled: readonly boolean[],
): string {
  const tooltip = composed.mapping.style.tooltip;
  if (!tooltip.enabled || !tooltipEnabled[picked.fieldSlot]) return "";
  const rows =
    tooltip.mode === "shared"
      ? rangeSharedTooltipRows(composed.projection, picked, tooltipEnabled)
      : [{ fieldSlot: picked.fieldSlot, groupSlot: picked.groupSlot }];
  const body = rows
    .flatMap((row) => {
      const field = composed.projection.fields[row.fieldSlot];
      const summary = field.data.find((d) => d.groupSlot === row.groupSlot)?.summary;
      if (!summary || !field.enabled) return [];
      const display = composed.mapping.context.display;
      const values = [summary.min, summary.max].map((v) =>
        escapeHtml(rangeDisplayText(display.tooltipNumber(v))),
      );
      return [`${escapeHtml(field.descriptor.label)}: ${values[0]} - ${values[1]}`];
    })
    .join("<br/>");
  const group = composed.projection.groups[picked.groupSlot];
  return body && tooltip.mode !== "compact"
    ? `${escapeHtml(rangeDisplayText(composed.mapping.context.display.category(group.category)))}<br/>${body}`
    : body;
}
