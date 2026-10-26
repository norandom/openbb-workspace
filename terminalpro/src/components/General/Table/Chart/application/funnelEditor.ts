import { nativeFunnelType, isFunnelFamily } from "../compatibility/funnelContracts";
import {
  displayFont,
  fontWeightKey,
  typographyMetadata,
} from "../compatibility/editorBindings/metadata";
import { keys, record, validateEdit } from "../compatibility/editorBindings/validation";
import { fontLeaf } from "../compatibility/editorBindings/valueMapping";
import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import type {
  SeriesStyleControl,
  SeriesStyleField,
} from "../editor/series/ChartSeriesStylePanel";
import { freezeHierarchy } from "./hierarchyAppearanceValues";
import type { FunnelEditIntent, FunnelEditorState } from "./funnelEditorTypes";
import type {
  FunnelFont,
  FunnelStroke,
  ResolvedFunnelStyle,
} from "./funnelRenderTypes";
const bounds = (value: number, minimum: number) => ({
  min: 0,
  max: Math.max(value, minimum),
  step: 1,
});
const typography = <T extends Omit<FunnelFont, "enabled">>(value: T) => ({
  ...value,
  font: displayFont(value.font),
  weight: fontWeightKey(value),
});
const fontContext = (value: Omit<FunnelFont, "enabled">) => ({
  predefined: { fontWeight: value.fontWeight, fontStyle: value.fontStyle },
});
function controls(value: FunnelStroke): SeriesStyleControl[] {
  const labels: Record<SeriesStyleField, string> = {
    strokeWidth: "Stroke Width",
    lineDash: "Line Dash",
    strokeOpacity: "Stroke Opacity",
    fillOpacity: "Fill Opacity",
  };
  return (["strokeWidth", "lineDash", "strokeOpacity", "fillOpacity"] as const).map(
    (field) => {
      const opacity = field === "strokeOpacity" || field === "fillOpacity";
      const current = field === "lineDash" ? (value.lineDash[0] ?? 0) : value[field];
      return {
        field,
        label: labels[field],
        value: current,
        min: 0,
        max: opacity ? 1 : Math.max(current, 10),
        rangeStep: opacity ? 0.05 : 1,
        numberStep: "any",
      };
    },
  );
}
export function projectFunnelEditorState(
  style: ResolvedFunnelStyle,
): FunnelEditorState {
  const a = style.application;
  const captionOptions = (caption: typeof a.title) => ({
    ...typographyMetadata(caption),
    spacingBounds: bounds(caption.spacing, 100),
  });
  return freezeHierarchy({
    kind: "funnel",
    family: style.family,
    direction: style.direction,
    titles: {
      value: { title: typography(a.title), subtitle: typography(a.subtitle) },
      availableCaptions: ["title", "subtitle"],
      ...typographyMetadata(a.title, a.subtitle),
      spacingBounds: bounds(0, 100),
      optionsByCaption: {
        title: captionOptions(a.title),
        subtitle: captionOptions(a.subtitle),
      },
    },
    padding: {
      value: { ...a.padding },
      bounds: bounds(Math.max(...Object.values(a.padding)), 200),
    },
    background: { value: { ...a.background } },
    tooltips: {
      value: { ...a.tooltip },
      modes: [
        { value: "single", label: "Single" },
        { value: "shared", label: "Multiple" },
        { value: "compact", label: "Compact" },
      ],
    },
    series: { controls: controls(style.series) },
    labels: { value: typography(style.label), ...typographyMetadata(style.label) },
    stageLabels: {
      value: typography(style.stageLabel),
      ...typographyMetadata(style.stageLabel),
    },
    ...(style.family === "coneFunnel"
      ? {}
      : { shadow: { value: { ...style.shadow } } }),
    ...(style.family === "funnel"
      ? {
          dropOff: {
            enabled: style.dropOff.enabled,
            controls: controls(style.dropOff),
          },
        }
      : {}),
  });
}
function commonPatch(
  style: ResolvedFunnelStyle,
  intent: Exclude<FunnelEditIntent, { panel: "funnelDirection" | "funnelDropOff" }>,
): RuntimeOptions {
  const { panel, edit } = intent;
  validateEdit(panel === "stageLabels" ? "labels" : panel, edit);
  if (panel === "titles") {
    if (edit.caption !== "title" && edit.caption !== "subtitle")
      throw Error("Unsupported Funnel title");
    return {
      [edit.caption]: fontLeaf(
        edit.field,
        edit.value,
        fontContext(style.application[edit.caption]),
      ),
    };
  }
  if (panel === "labels" || panel === "stageLabels")
    return {
      series: {
        [panel === "labels" ? "label" : "stageLabel"]: fontLeaf(
          edit.field,
          edit.value,
          fontContext(panel === "labels" ? style.label : style.stageLabel),
        ),
      },
    };
  if (panel === "padding") return { padding: { [edit.side]: edit.value } };
  if (panel === "background" || panel === "tooltips")
    return { [panel === "tooltips" ? "tooltip" : panel]: { [edit.field]: edit.value } };
  if (panel === "shadow") {
    if (style.family === "coneFunnel") throw Error("Cone has no shadow");
    return { series: { shadow: { [edit.field]: edit.value } } };
  }
  if (panel === "series")
    return {
      series: { [edit.field]: edit.field === "lineDash" ? [edit.value] : edit.value },
    };
  throw Error("Unsupported Funnel control");
}
function patch(style: ResolvedFunnelStyle, intent: FunnelEditIntent): RuntimeOptions {
  if (intent.panel === "funnelDirection") {
    keys(record(intent), ["panel", "value"]);
    if (intent.value !== "vertical" && intent.value !== "horizontal")
      throw Error("Invalid Funnel direction");
    return { series: { direction: intent.value } };
  }
  keys(record(intent), ["panel", "edit"]);
  if (intent.panel === "funnelDropOff") {
    if (style.family !== "funnel") throw Error("Unsupported drop-off");
    const edit = record(intent.edit);
    validateEdit(edit.field === "enabled" ? "labels" : "series", edit);
    return {
      series: {
        dropOff: {
          [intent.edit.field]:
            intent.edit.field === "lineDash" ? [intent.edit.value] : intent.edit.value,
        },
      },
    };
  }
  return commonPatch(style, intent);
}
export function mapFunnelEditorIntent(
  style: ResolvedFunnelStyle,
  intent: FunnelEditIntent,
): ValidationResult<{ readonly eventOptions: RuntimeOptions }> {
  try {
    record(intent);
    if (!isFunnelFamily(style.family)) throw Error("Invalid Funnel context");
    return {
      valid: true,
      value: {
        eventOptions: { [nativeFunnelType(style.family)]: patch(style, intent) },
      },
    };
  } catch {
    return { valid: false, error: "Invalid Funnel editor intent" };
  }
}
