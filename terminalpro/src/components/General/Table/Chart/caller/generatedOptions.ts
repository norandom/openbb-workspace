import { buildRangeGeneratedSeries } from "../application/rangeSeriesAppearanceOptions";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { dataOnlyOptions } from "./themeInputs";

/** Source-generated finite options; callbacks remain in ChartDisplayPolicy. */
export function callerGeneratedOptions(
  view: any = {},
  series: any = {},
  axes: any = {},
): RuntimeOptions {
  const caption = (text: unknown) =>
    typeof text === "string" && text
      ? { title: { fontSize: 12, spacing: 10, enabled: true, text } }
      : {};
  const category = { ...caption(view.xLabel), label: { fontSize: 11 } };
  const rangeSeries = buildRangeGeneratedSeries(
    (dataOnlyOptions(series) as RuntimeOptions) ?? {},
  );
  if (!rangeSeries.valid) throw Error(rangeSeries.error);
  const {
    marker: _marker,
    connectMissingData: _connect,
    calloutLabel: _callout,
    ...polarSeries
  } = (dataOnlyOptions(series) as RuntimeOptions) ?? {};
  return {
    nightingale: { series: polarSeries },
    "radar-line": { series: polarSeries },
    "radar-area": { series: polarSeries },
    common: {
      axes: {
        category: { ...category, label: { ...category.label, autoRotate: true } },
        "grouped-category": { ...category, label: { ...category.label, rotation: 0 } },
        time: { ...category, label: { ...category.label, rotation: 0 } },
        number: { ...caption(view.yLabel), label: { fontSize: 11, autoRotate: false } },
        ...(dataOnlyOptions(axes) as RuntimeOptions),
      },
    },
    ...Object.fromEntries(
      ["scatter", "bubble", "histogram"].map((family) => [
        family,
        {
          axes: {
            number: { bottom: caption(view.xLabel), left: caption(view.yLabel) },
          },
          series: {
            label: { enabled: false },
            ...(dataOnlyOptions(series) as RuntimeOptions),
          },
        },
      ]),
    ),
    ...Object.fromEntries(
      ["pie", "donut"].map((family) => [
        family,
        {
          series: {
            calloutLabel: { enabled: true },
            sectorLabel: { enabled: true },
            ...(dataOnlyOptions(series) as RuntimeOptions),
          },
        },
      ]),
    ),
    "range-bar": { series: rangeSeries.value },
    "range-area": { series: rangeSeries.value },
    "box-plot": { series: { ...(dataOnlyOptions(series) as RuntimeOptions) } },
    waterfall: { series: { ...(dataOnlyOptions(series) as RuntimeOptions) } },
    bar: {
      series: {
        label: { enabled: false, placement: "outside-end" },
        ...(dataOnlyOptions(series) as RuntimeOptions),
      },
    },
    line: {
      series: {
        label: { enabled: false },
        ...(dataOnlyOptions(series) as RuntimeOptions),
      },
    },
  };
}
