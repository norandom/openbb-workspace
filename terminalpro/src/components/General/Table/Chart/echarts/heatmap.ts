import type { EChartsOption } from "echarts";
import type {
  HeatmapMappingInput,
  TranslateHeatmap,
} from "../application/heatmapTypes";
import { escapeHtml } from "./cartesianDisplay";
import { heatmapAxes } from "./heatmapAxes";
import { heatmapItems, heatmapRenderer } from "./heatmapCells";
import { HEATMAP_SERIES_ID, heatmapChrome } from "./heatmapChrome";
import { buildHeatmapData, type HeatmapData } from "./heatmapData";

function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite heatmap input");
  if (value !== null && typeof value === "object") Object.values(value).forEach(finite);
}
function admit(input: HeatmapMappingInput) {
  finite(input.style);
  finite(input.context.viewport);
  const s = input.style;
  if (s.family !== "heatmap" || !s.colorRange.length)
    throw Error("Invalid heatmap style");
  const sizes = [
    input.context.viewport.width,
    input.context.viewport.height,
    ...Object.values(s.application.padding),
    s.series.strokeWidth,
    s.series.itemPadding,
    s.series.label.size,
    s.series.label.minimumFontSize,
    s.gradientLegend.spacing,
    s.gradientLegend.gradient.thickness,
    s.gradientLegend.gradient.preferredLength,
  ];
  if (
    sizes.some((value) => value < 0) ||
    s.series.strokeOpacity < 0 ||
    s.series.strokeOpacity > 1
  )
    throw Error("Invalid heatmap dimension");
}
export function heatmapTooltip(input: HeatmapMappingInput, model: HeatmapData) {
  const items = heatmapItems(model);
  return {
    show: input.style.application.tooltip.enabled,
    trigger: "item" as const,
    confine: true,
    formatter: (params: unknown) => {
      if (!input.style.application.tooltip.enabled) return "";
      const index = (params as { dataIndex?: number })?.dataIndex;
      const item = index === undefined ? undefined : items[index];
      if (!item || item.value.length < 3) return "";
      const [x, y, value] = item.value;
      const row = model.y[y];
      const column = model.x[x];
      const title = escapeHtml(String(input.context.display.legend(row.label)));
      const label = escapeHtml(column.label);
      const number = escapeHtml(input.context.display.tooltipNumber(value));
      return input.style.application.tooltip.mode === "compact"
        ? `${label}: ${number}`
        : `<strong>${title}</strong><br/>${label}: ${number}`;
    },
  };
}
/** Inactive translator: existing application host retains lifecycle and export ownership. */
export const translateHeatmap: TranslateHeatmap = (input) => {
  try {
    admit(input);
    const model = buildHeatmapData(input.projection);
    const chrome = heatmapChrome(input, model);
    const options = {
      animation: false,
      ...chrome.options,
      ...heatmapAxes(input, model, chrome.plot),
      tooltip: heatmapTooltip(input, model),
      series: [
        {
          id: HEATMAP_SERIES_ID,
          type: "custom",
          coordinateSystem: "cartesian2d",
          animation: false,
          clip: true,
          dimensions: ["x", "y", "value"],
          encode: { x: 0, y: 1 },
          data: chrome.plot.width && chrome.plot.height ? heatmapItems(model) : [],
          renderItem: heatmapRenderer(input, model),
          emphasis: { disabled: true },
        },
      ],
    } as EChartsOption;
    finite(options);
    return { status: "supported", options };
  } catch {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-input",
          path: [],
          message: "Heatmap input could not be projected into finite native geometry.",
        },
      ],
    };
  }
};
