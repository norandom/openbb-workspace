import type { ResolvedFontStyle } from "./appearanceModel";
import type {
  MapRadarEditorIntent,
  RadarAcceptedEditIntent,
  RadarPreparedSelection,
} from "../compatibility/radarContracts";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { keys, record, validateEdit } from "../compatibility/editorBindings/validation";
import { fontLeaf, legendLeaf } from "../compatibility/editorBindings/valueMapping";
import { radarOptionKey } from "./radarAppearance";
function commonPatch(
  selected: RadarPreparedSelection,
  intent: RadarAcceptedEditIntent,
): RuntimeOptions {
  const style = selected.mapping.style;
  validateEdit(intent.panel, intent.edit);
  const context = (value: ResolvedFontStyle) => ({
    predefined: { fontWeight: value.fontWeight, fontStyle: value.fontStyle },
  });
  switch (intent.panel) {
    case "titles":
      if (intent.edit.caption !== "title" && intent.edit.caption !== "subtitle")
        throw Error("Radar has no axis titles");
      return {
        [intent.edit.caption]: fontLeaf(
          intent.edit.field,
          intent.edit.value,
          context(style.application[intent.edit.caption]),
        ),
      };
    case "legend":
      return {
        legend: legendLeaf(
          intent.edit.field,
          intent.edit.value,
          context(style.application.legend),
        ),
      };
    case "padding":
      return { padding: { [intent.edit.side]: intent.edit.value } };
    case "background":
      return { background: { [intent.edit.field]: intent.edit.value } };
    case "tooltips":
      return { tooltip: { [intent.edit.field]: intent.edit.value } };
    case "series":
      return {
        series: {
          [intent.edit.field]:
            intent.edit.field === "lineDash" ? [intent.edit.value] : intent.edit.value,
        },
      };
    case "labels":
      return {
        series: {
          label: fontLeaf(
            intent.edit.field,
            intent.edit.value,
            context(style.series.labels),
          ),
        },
      };
    case "markers":
      return { series: { marker: { [intent.edit.field]: intent.edit.value } } };
    default:
      throw Error("Unsupported Radar control");
  }
}
function polarPatch(
  selected: RadarPreparedSelection,
  intent: Extract<
    RadarAcceptedEditIntent,
    { panel: "radarPolarAxis" | "radarPolarLabels" }
  >,
): RuntimeOptions {
  keys(record(intent.edit), ["field", "value"]);
  const { field, value } = intent.edit;
  if (intent.panel === "radarPolarLabels") {
    if (field === "orientation") {
      if (
        typeof value !== "string" ||
        !["fixed", "parallel", "perpendicular"].includes(value)
      )
        throw Error("Invalid Radar orientation");
    } else {
      if (!["font", "weight", "size", "color"].includes(field))
        throw Error("Invalid Radar label field");
      validateEdit("labels", intent.edit);
    }
    const labels = selected.mapping.style.polarAxis.labels;
    const label = fontLeaf(field, value, {
      predefined: { fontWeight: labels.fontWeight, fontStyle: labels.fontStyle },
    });
    return {
      axes: {
        "angle-category": { label },
        ...(field === "orientation"
          ? {}
          : { "radius-number": { label: { ...label } } }),
      },
    };
  }
  if (intent.panel !== "radarPolarAxis") throw Error("Unsupported Radar panel");
  if (field === "shape") {
    if (value !== "circle" && value !== "polygon") throw Error("Invalid Radar shape");
    return { axes: { "angle-category": { shape: value } } };
  }
  if (field === "innerRadiusRatio") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
      throw Error("Invalid Radar inner radius ratio");
    return { axes: { "radius-number": { innerRadiusRatio: value } } };
  }
  validateEdit("axis", intent.edit);
  const line = field === "color" ? { stroke: value } : { width: value };
  return {
    axes: { "angle-category": { line }, "radius-number": { line: { ...line } } },
  };
}
export const mapRadarEditorIntent: MapRadarEditorIntent = (selected, intent) => {
  try {
    keys(record(intent), ["panel", "edit"]);
    const leaf =
      intent.panel === "radarPolarAxis" || intent.panel === "radarPolarLabels"
        ? polarPatch(selected, intent)
        : commonPatch(selected, intent);
    return { valid: true, value: { [radarOptionKey(selected.mapping.family)]: leaf } };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid Radar edit",
    };
  }
};
