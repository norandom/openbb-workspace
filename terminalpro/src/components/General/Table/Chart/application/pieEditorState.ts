import { displayFont, fontWeightKey, typographyMetadata } from "../compatibility/editorBindings/metadata";
import type { PieFont, PieMappingInput } from "../echarts/pieTypes";
import type { PieEditorState, NumericControl } from "./pieSessionTypes";

function numeric(label: string, value: number, maximum: number, step = 1): NumericControl {
  return { label, value, min: 0, max: Math.max(maximum, value), rangeStep: step,
    numberStep: step === 1 ? "any" : step };
}
function labelPanel(value: PieFont) {
  return { value: { enabled: value.enabled, font: displayFont(value.font), weight: fontWeightKey(value),
    size: value.size, color: value.color }, ...typographyMetadata(value) };
}
export function projectPieEditorState(style: PieMappingInput["style"]): PieEditorState {
  const a = style.application;
  const s = style.series;
  const captions = { title: a.title, subtitle: a.subtitle };
  const bounds = (max: number) => ({ min: 0, max, step: 1 });
  const captionOptions = (caption: typeof a.title) => ({ ...typographyMetadata(caption), spacingBounds: bounds(Math.max(100, caption.spacing)) });
  return {
    kind: "pie",
    titles: { value: Object.fromEntries(Object.entries(captions).map(([key, value]) => [key,
      { ...value, font: displayFont(value.font), weight: fontWeightKey(value) }])),
      availableCaptions: ["title", "subtitle"], ...typographyMetadata(a.title, a.subtitle), spacingBounds: bounds(100),
      optionsByCaption: { title: captionOptions(a.title), subtitle: captionOptions(a.subtitle) } },
    legend: { value: { ...a.legend, font: displayFont(a.legend.font), weight: fontWeightKey(a.legend) },
      ...typographyMetadata(a.legend), positions: ["top", "right", "bottom", "left"].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
      bounds: { spacing: bounds(200), markerSize: bounds(40), markerStroke: bounds(10), itemSpacing: bounds(20), horizontalSpacing: bounds(50), verticalSpacing: bounds(50) } },
    padding: { value: { ...a.padding }, bounds: bounds(200) },
    background: { value: { ...a.background } },
    tooltips: { value: { ...a.tooltip }, modes: [{ value: "single", label: "Single" }, { value: "shared", label: "Multiple" }, { value: "compact", label: "Compact" }] },
    series: { controls: (["strokeWidth", "strokeOpacity", "fillOpacity"] as const).map(field => ({
      field, ...numeric(field === "strokeWidth" ? "Stroke Width" : field === "strokeOpacity" ? "Stroke Opacity" : "Fill Opacity",
        s.paint[field], field === "strokeWidth" ? 10 : 1, field === "strokeWidth" ? 1 : 0.05) })) },
    shadow: { value: { ...s.paint.shadow } },
    callout: labelPanel(s.calloutLabel), sector: labelPanel(s.sectorLabel),
    calloutControls: { length: numeric("Length", s.calloutLine.length, 40), strokeWidth: numeric("Stroke Width", s.calloutLine.strokeWidth, 10), offset: numeric("Offset", s.calloutLabel.offset, 30) },
    sectorPosition: numeric("Position Ratio", s.sectorLabel.positionRatio, 1, 0.05),
  };
}
