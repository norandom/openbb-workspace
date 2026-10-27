import merge from "lodash.merge";
import {
  displayFont,
  fontWeightKey,
  typographyMetadata,
} from "../compatibility/editorBindings/metadata";
import { validateEdit } from "../compatibility/editorBindings/validation";
import { fontLeaf } from "../compatibility/editorBindings/valueMapping";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import { composeAppearanceOptions } from "./appearanceComposition";
import type { ApplicationSessionInputs } from "./applicationSessionTypes";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { at, number, object, text } from "./effectiveAppearanceValues";
import type { SankeyAppearanceIntent, SankeyEditorState } from "./sankeySessionTypes";
import type { SankeyRenderInput } from "./sankeyTypes";

export function resolveSankeyAppearance(
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  baseline: OptionBaseline,
): SankeyRenderInput["style"] {
  const composed = composeAppearanceOptions({ baseline, generated: inputs.generated });
  if (!composed.valid) throw Error(composed.error);
  const source = [
    merge(
      {},
      appearanceDefaults({ theme: inputs.theme, family: "sankey", seriesIds: [] }),
      { series: { label: { color: inputs.theme.colors.textColor } } },
    ),
    object(inputs.theme.overrides.common),
    object(inputs.theme.overrides.sankey),
    object(composed.value.common),
    object(composed.value.sankey),
    object(baseline.options.sankey),
  ];
  const effective = merge({}, ...source);
  const application = resolveAppearanceChrome(source, inputs.theme.palette, 0);
  return {
    application,
    palette: inputs.theme.palette.fills,
    textColor: text(
      at(effective, "series.label.color") ?? inputs.theme.colors.textColor,
    ),
    fontFamily: text(at(effective, "series.label.fontFamily") ?? "Verdana, sans-serif"),
    fontSize: number(at(effective, "series.label.fontSize") ?? 12, Number.MIN_VALUE),
    linkOpacity: 0.45,
    nodeWidth: 20,
    nodeGap: 12,
    labels: true,
  };
}
export function sankeyEditorState(
  style: SankeyRenderInput["style"],
): SankeyEditorState {
  const a = style.application;
  const typography = (caption: typeof a.title) => ({
    ...caption,
    font: displayFont(caption.font),
    weight: fontWeightKey(caption),
  });
  const bounds = (value: number, minimum: number) => ({
    min: 0,
    max: Math.max(value, minimum),
    step: 1,
  });
  const captionOptions = (caption: typeof a.title) => ({
    ...typographyMetadata(caption),
    spacingBounds: bounds(caption.spacing, 100),
  });
  return {
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
  };
}
export function sankeyAppearancePatch(
  style: SankeyRenderInput["style"],
  intent: SankeyAppearanceIntent,
): RuntimeOptions {
  validateEdit(intent.panel, intent.edit);
  if (intent.panel === "titles") {
    if (intent.edit.caption !== "title" && intent.edit.caption !== "subtitle")
      throw Error("Unsupported Sankey caption");
    const caption = style.application[intent.edit.caption];
    return {
      sankey: {
        [intent.edit.caption]: fontLeaf(intent.edit.field, intent.edit.value, {
          predefined: { fontWeight: caption.fontWeight, fontStyle: caption.fontStyle },
        }),
      },
    };
  }
  if (intent.panel === "padding")
    return { sankey: { padding: { [intent.edit.side]: intent.edit.value } } };
  return {
    sankey: {
      [intent.panel === "tooltips" ? "tooltip" : "background"]: {
        [intent.edit.field]: intent.edit.value,
      },
    },
  };
}
