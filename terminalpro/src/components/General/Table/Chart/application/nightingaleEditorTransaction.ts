import type { ResolvedFontStyle } from "./appearanceModel";
import type {
  MapNightingaleEditorIntent,
  NightingaleAcceptedEditIntent,
  NightingalePreparedSelection,
} from "../compatibility/nightingaleContracts";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { keys, record, validateEdit } from "../compatibility/editorBindings/validation";
import { fontLeaf, legendLeaf } from "../compatibility/editorBindings/valueMapping";
function commonPatch(
  selected: NightingalePreparedSelection,
  intent: NightingaleAcceptedEditIntent,
): RuntimeOptions {
  const style = selected.mapping.style;
  validateEdit(intent.panel, intent.edit);
  const context = (value: ResolvedFontStyle) => ({
    predefined: { fontWeight: value.fontWeight, fontStyle: value.fontStyle },
  });
  switch (intent.panel) {
    case "titles":
      if (intent.edit.caption !== "title" && intent.edit.caption !== "subtitle")
        throw Error("Nightingale has no axis titles");
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
    default:
      throw Error("Unsupported Nightingale control");
  }
}
function polarPatch(
  selected: NightingalePreparedSelection,
  intent: Extract<
    NightingaleAcceptedEditIntent,
    { panel: "nightingalePolarAxis" | "nightingalePolarLabels" }
  >,
): RuntimeOptions {
  keys(record(intent.edit), ["field", "value"]);
  const { field, value } = intent.edit;
  if (intent.panel === "nightingalePolarLabels") {
    if (field === "orientation") {
      if (
        typeof value !== "string" ||
        !["fixed", "parallel", "perpendicular"].includes(value)
      )
        throw Error("Invalid Nightingale orientation");
    } else {
      if (!["font", "weight", "size", "color"].includes(field))
        throw Error("Invalid Nightingale label field");
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
  if (intent.panel !== "nightingalePolarAxis")
    throw Error("Unsupported Nightingale panel");
  if (field === "innerRadiusRatio") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
      throw Error("Invalid Nightingale inner radius ratio");
    return {
      axes: {
        "angle-category": { innerRadiusRatio: value },
        "radius-number": { innerRadiusRatio: value },
      },
    };
  }
  validateEdit("axis", intent.edit);
  const line = field === "color" ? { stroke: value } : { width: value };
  return {
    axes: { "angle-category": { line }, "radius-number": { line: { ...line } } },
  };
}
export const mapNightingaleEditorIntent: MapNightingaleEditorIntent = (
  selected,
  intent,
) => {
  try {
    keys(record(intent), ["panel", "edit"]);
    if (selected.mapping.family !== "nightingale")
      throw Error("Invalid Nightingale context");
    if (intent.panel === "nightingaleGroupType") {
      keys(record(intent.edit), ["value"]);
      const value = intent.edit.value;
      if (value !== "grouped" && value !== "stacked" && value !== "normalized")
        throw Error("Invalid Nightingale Group Type");
      return { valid: true, value: { kind: "group-type", seriesGroupType: value } };
    }
    const leaf =
      intent.panel === "nightingalePolarAxis" ||
      intent.panel === "nightingalePolarLabels"
        ? polarPatch(selected, intent)
        : commonPatch(selected, intent);
    return {
      valid: true,
      value: { kind: "options", eventOptions: { nightingale: leaf } },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid Nightingale edit",
    };
  }
};
