import { escapeHtml } from "./cartesianDisplay";
import type { HistogramDatum, HistogramMappingInput } from "./histogramTypes";

export function histogramTooltipText(input: HistogramMappingInput, datum: HistogramDatum): string {
  const [lower, upper, frequency] = datum.value;
  const format = (v: number) => escapeHtml(String(input.context.display.numericAxis(v)));
  const field = datum.metadata.field;
  return `${escapeHtml(field.label || field.id)}: ${format(lower)} - ${format(upper)}<br/>Frequency: ${format(frequency)}`;
}
export function histogramTooltip(input: HistogramMappingInput) {
  return {
    show: input.style.application.tooltip.enabled, trigger: "item" as const,
    formatter: (params: unknown) => histogramTooltipText(input, (params as { data: HistogramDatum }).data),
  };
}
