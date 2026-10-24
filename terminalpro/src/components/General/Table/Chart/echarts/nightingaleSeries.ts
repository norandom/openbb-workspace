import type { BarSeriesOption, TooltipComponentOption } from "echarts";
import { color } from "echarts";
import type { NightingaleMappingInput } from "../compatibility/nightingaleContracts";
import { escapeHtml, fontStyle } from "./cartesianDisplay";
import type { NightingaleData } from "./nightingaleData";
function alpha(value: string, opacity: number) {
  return color.modifyAlpha(value, (color.parse(value)?.[3] ?? 1) * opacity) ?? value;
}
export function nightingaleSeries(
  input: NightingaleMappingInput,
  data: NightingaleData,
): BarSeriesOption[] {
  const s = input.style.series;
  const p = input.style.application.palette;
  return data.series.map((series, index) => ({
    id: series.id,
    name: series.id,
    type: "bar",
    coordinateSystem: "polar",
    ...((input.groupType ?? "stacked") !== "grouped"
      ? { stack: "nightingale", stackStrategy: "samesign" as const }
      : {}),
    barCategoryGap: "0%",
    barGap: "0%",
    roundCap: false,
    dimensions: ["radius", "category"],
    encode: { radius: 0, angle: 1 },
    itemStyle: {
      color: alpha(s.fill ?? p.fills[index % p.fills.length], s.fillOpacity),
      borderColor: alpha(
        s.stroke ?? p.strokes[index % p.strokes.length],
        s.strokeOpacity,
      ),
      borderWidth: s.strokeWidth,
      borderType: [...s.lineDash],
    },
    label: {
      ...fontStyle(s.labels),
      show: s.labels.enabled,
      formatter: (params: unknown) => {
        const d = (params as { data: { rawValue: number } }).data;
        return String(input.context.display.seriesLabel(d.rawValue));
      },
    },
    // Omit missing observations. A null stack placeholder poisons native negative stacks.
    data: series.scaled.flatMap((value, i) =>
      value === null
        ? []
        : [
            {
              name: data.rowIds[i],
              value: [value, data.rowIds[i]],
              rawValue: series.values[i],
              category: data.categories[i],
            },
          ],
    ),
  }));
}
function content(input: NightingaleMappingInput, params: unknown): string {
  const p = params as {
    data?: { name?: string; rawValue?: number };
    seriesId?: string;
  };
  if (typeof p.data?.rawValue !== "number") return "";
  const row = input.snapshot.rows.find((r) => r.id === p.data?.name);
  if (!row) return "";
  const mode = input.style.application.tooltip.mode;
  const lines = input.assignments
    .filter(
      (a) =>
        (mode === "shared" || a.colId === p.seriesId) &&
        input.context.legendSelection?.[a.colId] !== false,
    )
    .map((a) => {
      const label =
        input.snapshot.columns.find((c) => c.id === a.colId)?.label ?? a.colId;
      const value = row.values[a.colId];
      return `${escapeHtml(label)}: ${typeof value === "number" && Number.isFinite(value) ? escapeHtml(input.context.display.tooltipNumber(value)) : "—"}`;
    });
  return [
    ...(mode === "compact"
      ? []
      : [escapeHtml(String(input.context.display.category(row.category)))]),
    ...lines,
  ].join("<br/>");
}
export function nightingaleTooltip(
  input: NightingaleMappingInput,
): TooltipComponentOption {
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item",
    confine: true,
    formatter: (params) => content(input, params),
  };
}
