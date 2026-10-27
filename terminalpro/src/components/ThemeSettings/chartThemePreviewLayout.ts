import { measureText } from "../General/Table/Chart/echarts/cartesianLayout";
import { layoutLegend } from "../General/Table/Chart/echarts/legendLayout";
import type { PreviewAppearance } from "./chartThemePreviewAppearance";
import type { previewSample } from "./chartThemePreviewData";

export interface PreviewViewport {
  readonly width: number;
  readonly height: number;
}

export function previewLayout(
  appearance: PreviewAppearance,
  sample: ReturnType<typeof previewSample>,
  viewport: PreviewViewport,
  selected: Readonly<Record<string, boolean>>,
) {
  const a = appearance;
  if (![viewport.width, viewport.height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error("Chart preview requires a positive finite viewport.");
  const font = {
    font: a.fontFamily,
    size: a.fontSize,
    fontWeight: a.fontWeight,
    fontStyle: undefined,
  };
  const titleHeight = measureText("Dolphin Interaction Data", {
    ...font,
    size: (a.fontSize * 17) / 12,
  }).height;
  const captionSpace = titleHeight + 20;
  const contentWidth = Math.max(1, viewport.width - a.padding * 2);
  const contentHeight = Math.max(1, viewport.height - a.padding * 2 - captionSpace);
  const aspect = contentWidth / contentHeight;
  const legendHeight = Math.round(
    contentHeight * (aspect < 1 ? Math.min(0.5, 0.2 / aspect) : 0.2),
  );
  const legend = layoutLegend({
    items: sample.map((s) => ({
      key: s.name,
      label: s.name,
      enabled: selected[s.name] !== false,
    })),
    viewport,
    padding: { top: a.padding, right: a.padding, bottom: a.padding, left: a.padding },
    captionSpace,
    legend: {
      ...font,
      enabled: sample.length > 1,
      color: a.color,
      weight: String(a.fontWeight),
      position: "bottom",
      spacing: 30,
      markerSize: 15,
      markerStroke: 2,
      itemSpacing: 8,
      horizontalSpacing: 16,
      verticalSpacing: 8,
    },
    markerStrokeWidth: 2,
    idPrefix: "theme-preview-legend-",
    layout: { markerShape: "square", maxHeight: legendHeight },
    interaction: {
      mode: "preview",
      focusColor: a.accentColor,
      focusBackgroundColor: a.chrome.backgroundColor,
      pageActiveColor: a.foregroundColor,
      pageInactiveColor: a.subtleTextColor,
    },
  });
  const values = sample.flatMap((s) => s.values);
  const maximum = Math.max(1, ...values);
  const axisWidth = measureText(String(Math.ceil(maximum / 50) * 50), font).width + 11;
  const labelHeight = measureText("Mercutio", font).height + 11;
  const left = a.padding + axisWidth;
  const right = a.padding;
  const top = a.padding + captionSpace;
  const bottom = a.padding + labelHeight + (legend.height ? legend.height + 30 : 0);
  const availableWidth = Math.max(1, viewport.width - left - right);
  // AG's category band leaves 30% between groups and 10% within the group.
  const barWidth = Math.max(
    0.1,
    ((availableWidth / 4) * 0.7) / Math.max(1, sample.length + (sample.length - 1) / 9),
  );
  return {
    legend,
    grid: { id: "theme-preview-grid", left, right, top, bottom, containLabel: false },
    geometry: { barWidth, barGap: 1 / 9 },
  };
}
