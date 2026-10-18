import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { AppearanceInput } from "./appearanceModel";
import { applicationColors } from "./effectiveAppearanceColors";

/** Finite AG defaults: ChartTheme, BarSeriesModule and LineSeriesModule in the owned source. */
export function appearanceDefaults(input: AppearanceInput): RuntimeOptions {
  const colors = applicationColors(input.theme.colors);
  const typography = {
    fontFamily: "Verdana, sans-serif",
    fontSize: 12,
    fontWeight: 400,
    color: input.theme.colors.textColor,
  };
  const line = input.family === "line";
  return {
    title: { ...typography, enabled: false, text: "Title", fontSize: 17, spacing: 20 },
    subtitle: {
      ...typography,
      enabled: false,
      text: "Subtitle",
      fontSize: 13,
      spacing: 20,
      color: colors.subtle,
    },
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    background: { visible: true, fill: input.theme.colors.chartBackgroundColor },
    tooltip: {
      enabled: true,
      mode:
        input.seriesIds.length > 1 && input.seriesIds.length < 4 ? "shared" : "single",
    },
    legend: {
      enabled: input.seriesIds.length > 1,
      position: "bottom",
      spacing: 30,
      item: {
        paddingX: 16,
        paddingY: 8,
        marker: { size: 15, padding: 8, strokeWidth: 0 },
        label: typography,
      },
    },
    series: {
      strokeWidth: line ? 2 : 0,
      strokeOpacity: 1,
      fillOpacity: 1,
      lineDash: [0],
      connectMissingData: false,
      shadow: { enabled: false, color: "#00000080", xOffset: 3, yOffset: 3, blur: 5 },
      label: {
        ...typography,
        enabled: false,
        color: line ? typography.color : input.theme.colors.chartBackgroundColor,
      },
      marker: { enabled: line, shape: "circle", size: 7, strokeWidth: 0 },
    },
    axes: Object.fromEntries(
      ["category", "number", "time", "grouped-category"].map((type) => [
        type,
        {
          title: {
            ...typography,
            enabled: false,
            text: "Axis Title",
            spacing: 25,
            fontSize: 13,
          },
          label: {
            ...typography,
            spacing: type === "grouped-category" ? 10 : 11,
            autoRotate: type === "category",
            rotation: type === "grouped-category" ? 270 : undefined,
          },
          line: { enabled: type !== "number", width: 1, stroke: colors.axis },
          gridLine: {
            enabled: type === "number" || type === "grouped-category",
            width: 1,
            style: [{ stroke: colors.grid, lineDash: [] }],
          },
          tick: {
            enabled: type === "grouped-category",
            width: 1,
            size: 6,
            stroke:
              type === "grouped-category"
                ? input.theme.colors.base === "ag-default-dark"
                  ? "#7f8389"
                  : "#d9d9d9"
                : colors.axis,
          },
        },
      ]),
    ),
  };
}
