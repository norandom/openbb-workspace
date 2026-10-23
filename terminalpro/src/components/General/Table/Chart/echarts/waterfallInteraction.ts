import type { WaterfallRenderInput } from "../application/waterfallTypes";
import { escapeHtml } from "./cartesianDisplay";
import { navigatorBorder } from "./cartesianNavigatorMask";
import type { ChartPointerPlan } from "./chartPointerTypes";
import { pickRangeChart, rangeExactPickers } from "./rangePointerPick";
import type { WaterfallGeometry } from "./waterfallSeries";

export function waterfallPointer(
  input: WaterfallRenderInput,
  geometry: WaterfallGeometry,
): ChartPointerPlan | undefined {
  const fieldId = input.fieldId;
  if (!geometry.plot || fieldId === undefined) return;
  const candidates = geometry.candidates;
  const matches = new Map(candidates.map((c) => [c.key, c]));
  const policy = input.navigation;
  const display = input.context.display;
  const column = input.snapshot.columns.find((c) => c.id === fieldId);
  if (!column) return;
  const horizontal = input.appearance.series.direction === "horizontal";
  const exact = rangeExactPickers([candidates], input.context.viewport);
  const appearance = input.appearance.application;
  return {
    viewport: input.context.viewport,
    plot: geometry.plot,
    pagination: policy.pagination,
    paint: {
      background: input.theme.colors.chartBackgroundColor,
      color: input.theme.colors.textColor,
      borderColor: navigatorBorder(input.theme),
      fontFamily: appearance.legend.font,
      fontSize: appearance.legend.size,
      fontWeight: appearance.legend.fontWeight ?? 400,
      pointerColor: appearance.axes.category.fields.color,
      pointerLabelBackground: input.theme.colors.chartBackgroundColor,
      pointerLabelColor: input.theme.colors.textColor,
    },
    pick: (point, intent) =>
      pickRangeChart(
        point,
        horizontal ? "y" : "x",
        [candidates],
        intent === "hover" ? policy.hoverRange : policy.clickRange,
        exact,
        policy.outsideMinor,
      ),
    present: (match) => {
      const candidate = matches.get(match.key);
      if (!candidate) return;
      const row = input.snapshot.rows[candidate.groupSlot];
      const delta = row.values[fieldId];
      return {
        html:
          input.appearance.series.tooltipEnabled && appearance.tooltip.enabled
            ? `${appearance.tooltip.mode === "compact" ? "" : `${escapeHtml(String(display.category(row.category)))}<br/>`}${escapeHtml(column.label)}: ${escapeHtml(String(display.tooltipNumber(delta!)))}`
            : "",
        anchor: { x: candidate.x, y: candidate.y },
        categoryPointer: {
          axis: horizontal ? "y" : "x",
          coordinate: horizontal ? candidate.y : candidate.x,
          label: String(display.crosshair(row.category)),
        },
      };
    },
  };
}
