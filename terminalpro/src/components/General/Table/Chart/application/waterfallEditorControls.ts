import { color } from "echarts";
import {
  displayFont,
  fontWeightKey,
  typographyMetadata,
} from "../compatibility/editorBindings/metadata";
import { fontLeaf, fontPairs } from "../compatibility/editorBindings/valueMapping";
import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import type { SeriesStyleControl } from "../editor/series/ChartSeriesStylePanel";
import { bool, number, text } from "./effectiveAppearanceValues";
import type {
  WaterfallControlValues,
  WaterfallEdit,
  WaterfallItemStyle,
  WaterfallResolvedAppearance,
} from "./waterfallTypes";

function itemControls(
  item: WaterfallItemStyle,
): WaterfallControlValues["items"]["positive"] {
  const values = {
    strokeWidth: item.strokeWidth,
    lineDash: item.lineDash[0] ?? 0,
    strokeOpacity: item.strokeOpacity,
    fillOpacity: item.fillOpacity,
  };
  const labels = {
    strokeWidth: "Stroke Width",
    lineDash: "Line Dash",
    strokeOpacity: "Stroke Opacity",
    fillOpacity: "Fill Opacity",
  };
  const controls = (Object.keys(values) as (keyof typeof values)[]).map(
    (field): SeriesStyleControl => ({
      field,
      label: labels[field],
      value: values[field],
      min: 0,
      max: field.endsWith("Opacity") ? 1 : Math.max(values[field], 10),
      rangeStep: field.endsWith("Opacity") ? 0.05 : 1,
      numberStep: "any",
    }),
  );
  return {
    series: { controls },
    labels: {
      value: {
        ...item.label,
        font: displayFont(item.label.font),
        weight: fontWeightKey(item.label),
      },
      ...typographyMetadata(item.label),
    },
  };
}
export function waterfallControlValues(
  value: WaterfallResolvedAppearance,
): WaterfallControlValues {
  return {
    direction: value.series.direction,
    connector: value.series.line,
    items: {
      positive: itemControls(value.series.item.positive),
      negative: itemControls(value.series.item.negative),
    },
  };
}
function validateColor(value: unknown) {
  if (!color.parse(text(value))) throw Error("Invalid Waterfall editor color");
}
function labelPatch(
  edit: Extract<WaterfallEdit, { kind: "label" }>,
  current: WaterfallResolvedAppearance,
) {
  const { field, value } = edit.edit;
  if (field === "enabled") bool(value);
  else if (field === "size") number(value);
  else if (field === "color") validateColor(value);
  else if (field === "font") {
    if (!text(value)) throw Error("Missing Waterfall font");
  } else if (
    field !== "weight" ||
    (value !== "predefined" && !Object.hasOwn(fontPairs, String(value)))
  )
    throw Error("Invalid Waterfall label edit");
  const label = current.series.item[edit.sign].label;
  return fontLeaf(field, value, {
    predefined: { fontWeight: label.fontWeight, fontStyle: label.fontStyle },
  });
}
export function mapWaterfallEdit(
  edit: WaterfallEdit,
  current: WaterfallResolvedAppearance,
): ValidationResult<RuntimeOptions> {
  try {
    let series: RuntimeOptions;
    if (edit.kind === "direction") {
      if (edit.value !== "horizontal" && edit.value !== "vertical")
        throw Error("Invalid Waterfall direction");
      series = { direction: edit.value };
    } else if (edit.kind === "connector") {
      if (!["stroke", "strokeWidth", "strokeOpacity", "lineDash"].includes(edit.field))
        throw Error("Invalid connector edit");
      if (edit.field === "stroke") validateColor(edit.value);
      else
        number(
          edit.value,
          0,
          edit.field === "strokeOpacity" ? 1 : Number.POSITIVE_INFINITY,
        );
      series = {
        line: { [edit.field]: edit.field === "lineDash" ? [edit.value] : edit.value },
      };
    } else {
      if (edit.sign !== "positive" && edit.sign !== "negative")
        throw Error("Invalid Waterfall item sign");
      if (edit.kind === "label")
        series = { item: { [edit.sign]: { label: labelPatch(edit, current) } } };
      else if (edit.kind === "item") {
        if (
          !["strokeWidth", "strokeOpacity", "fillOpacity", "lineDash"].includes(
            edit.field,
          )
        )
          throw Error("Invalid item edit");
        number(
          edit.value,
          0,
          edit.field.endsWith("Opacity") ? 1 : Number.POSITIVE_INFINITY,
        );
        series = {
          item: {
            [edit.sign]: {
              [edit.field]: edit.field === "lineDash" ? [edit.value] : edit.value,
            },
          },
        };
      } else throw Error("Invalid Waterfall edit");
    }
    return { valid: true, value: { waterfall: { series } } };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid Waterfall edit",
    };
  }
}
