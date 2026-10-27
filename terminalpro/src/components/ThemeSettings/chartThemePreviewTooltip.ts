import type { TooltipComponentOption } from "echarts";
import { escapeHtml } from "../General/Table/Chart/echarts/cartesianDisplay";
import type { PreviewAppearance } from "./chartThemePreviewAppearance";
import type { previewSample } from "./chartThemePreviewData";

export function previewTooltip(
  appearance: PreviewAppearance,
  sample: ReturnType<typeof previewSample>,
  selected: Readonly<Record<string, boolean>>,
): TooltipComponentOption {
  const { chrome, borderColor, fills, strokes } = appearance;
  return {
    trigger: "item",
    renderMode: "html",
    confine: true,
    enterable: false,
    transitionDuration: 0,
    showDelay: 0,
    hideDelay: 0,
    backgroundColor: chrome.backgroundColor,
    borderColor,
    borderWidth: 1,
    padding: 8,
    textStyle: {
      color: chrome.color,
      fontFamily: chrome.fontFamily,
      fontSize: chrome.fontSize,
      fontWeight: chrome.fontWeight,
    },
    extraCssText: `border-radius:4px;box-shadow:${appearance.popupShadow}`,
    formatter: (params) => {
      const point = Array.isArray(params) ? params[0] : params;
      const shared = sample.length > 1 && sample.length < 4;
      const rows = shared
        ? sample.flatMap((series, index) =>
            selected[series.name] === false
              ? []
              : [{ index, name: series.name, value: series.values[point.dataIndex] }],
          )
        : [
            {
              index: point.seriesIndex ?? 0,
              name: point.seriesName,
              value: point.value,
            },
          ];
      const content = rows
        .map((row) => {
          const marker = `display:inline-block;width:12px;height:12px;background:${escapeHtml(fills[row.index] ?? "transparent")};border:2px solid ${escapeHtml(strokes[row.index] ?? "transparent")};margin-right:8px;vertical-align:middle`;
          return `<div><span style="${marker}"></span><span>${escapeHtml(String(row.name ?? ""))}</span><span style="margin-left:8px">${escapeHtml(String(row.value ?? ""))}</span></div>`;
        })
        .join("");
      return `<div data-chart-theme-tooltip style="color:${escapeHtml(chrome.color)};border-color:${escapeHtml(borderColor)}"><div style="margin-bottom:4px">${escapeHtml(String(point.name ?? ""))}</div>${content}</div>`;
    },
  };
}
