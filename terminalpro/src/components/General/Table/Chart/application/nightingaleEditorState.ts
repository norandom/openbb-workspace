import type {
  NightingaleGroupType,
  NightingaleEditorState,
  ResolvedNightingaleStyle,
} from "../compatibility/nightingaleContracts";
import {
  displayFont,
  fontWeightKey,
  typographyMetadata,
} from "../compatibility/editorBindings/metadata";
const bounds = (max: number) => ({ min: 0, max, step: 1 });
const choice = <T extends string>(value: T) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
});
export function projectNightingaleEditorState(
  style: ResolvedNightingaleStyle,
  groupType: NightingaleGroupType,
): NightingaleEditorState {
  const a = style.application;
  const s = style.series;
  const captions = { title: a.title, subtitle: a.subtitle };
  const captionOptions = (v: typeof a.title) => ({
    ...typographyMetadata(v),
    spacingBounds: bounds(Math.max(100, v.spacing)),
  });
  const fields = ["strokeWidth", "lineDash", "strokeOpacity", "fillOpacity"] as const;
  return {
    kind: "nightingale",
    groupType: {
      value: groupType,
      choices: (["grouped", "stacked", "normalized"] as const).map(choice),
    },
    titles: {
      value: Object.fromEntries(
        Object.entries(captions).map(([key, v]) => [
          key,
          { ...v, font: displayFont(v.font), weight: fontWeightKey(v) },
        ]),
      ),
      availableCaptions: ["title", "subtitle"],
      ...typographyMetadata(a.title, a.subtitle),
      spacingBounds: bounds(100),
      optionsByCaption: {
        title: captionOptions(a.title),
        subtitle: captionOptions(a.subtitle),
      },
    },
    legend: {
      value: {
        ...a.legend,
        font: displayFont(a.legend.font),
        weight: fontWeightKey(a.legend),
      },
      ...typographyMetadata(a.legend),
      positions: ["top", "right", "bottom", "left"].map(choice),
      bounds: {
        spacing: bounds(200),
        markerSize: bounds(40),
        markerStroke: bounds(10),
        itemSpacing: bounds(20),
        horizontalSpacing: bounds(50),
        verticalSpacing: bounds(50),
      },
    },
    padding: { value: { ...a.padding }, bounds: bounds(200) },
    background: { value: { ...a.background } },
    tooltips: {
      value: { ...a.tooltip },
      modes: [
        { value: "single", label: "Single" },
        { value: "shared", label: "Multiple" },
        { value: "compact", label: "Compact" },
      ],
    },
    series: {
      controls: fields.map((field) => {
        const value = field === "lineDash" ? (s.lineDash[0] ?? 0) : s[field];
        const opacity = field.endsWith("Opacity");
        return {
          field,
          label: {
            strokeWidth: "Stroke Width",
            lineDash: "Line Dash",
            strokeOpacity: "Line Opacity",
            fillOpacity: "Fill Opacity",
          }[field],
          value,
          min: 0,
          max: Math.max(value, opacity ? 1 : field === "lineDash" ? 30 : 10),
          rangeStep: opacity ? 0.05 : 1,
          numberStep: opacity ? 0.05 : ("any" as const),
        };
      }),
    },
    labels: {
      value: {
        ...s.labels,
        font: displayFont(s.labels.font),
        weight: fontWeightKey(s.labels),
      },
      ...typographyMetadata(s.labels),
    },
    polarAxis: {
      value: {
        ...style.polarAxis,
        labels: {
          ...style.polarAxis.labels,
          font: displayFont(style.polarAxis.labels.font),
          weight: fontWeightKey(style.polarAxis.labels),
        },
      },
      ...typographyMetadata(style.polarAxis.labels),
      orientations: (["fixed", "parallel", "perpendicular"] as const).map(choice),
    },
  };
}
