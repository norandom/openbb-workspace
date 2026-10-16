import type { AgChartOptions, AgChartTheme } from "ag-charts-community";
import {
  type ChartThemeState,
  chartThemeParams,
  type ThemeMode,
} from "./chartThemeState";

function getData(totalFills: number) {
  // Always show all 4 dolphins for variety
  const data: Array<Record<string, string | number>> = [
    {
      dolphin: "Peter",
      interactionDurationTM: 120,
      interactionDurationYM: 86,
      numberOfLooksTM: 60,
      numberOfLooksYM: 64,
    },
    {
      dolphin: "Mary",
      interactionDurationTM: 135,
      interactionDurationYM: 259,
      numberOfLooksTM: 57,
      numberOfLooksYM: 93,
    },
    {
      dolphin: "Mercutio",
      interactionDurationTM: 140,
      interactionDurationYM: 145,
      numberOfLooksTM: 238,
      numberOfLooksYM: 217,
    },
    {
      dolphin: "Ada",
      interactionDurationTM: 110,
      interactionDurationYM: 147,
      numberOfLooksTM: 237,
      numberOfLooksYM: 217,
    },
  ];

  // Create series to match the exact number of fill colors
  const baseSeries = [
    {
      type: "bar" as const,
      xKey: "dolphin",
      yKey: "numberOfLooksTM",
      yName: "Number of Looks (TM)",
      strokeWidth: 2,
    },
    {
      type: "bar" as const,
      xKey: "dolphin",
      yKey: "numberOfLooksYM",
      yName: "Number of Looks (YM)",
      strokeWidth: 2,
    },
    {
      type: "bar" as const,
      xKey: "dolphin",
      yKey: "interactionDurationTM",
      yName: "Interaction Duration (TM)",
      strokeWidth: 2,
    },
    {
      type: "bar" as const,
      xKey: "dolphin",
      yKey: "interactionDurationYM",
      yName: "Interaction Duration (YM)",
      strokeWidth: 2,
    },
  ];

  const series = baseSeries.slice(0, Math.min(totalFills, 4));

  // Add extra series if we need more than 4
  const neededSeries = totalFills - 4;
  if (neededSeries > 0) {
    for (let i = 1; i <= neededSeries; i++) {
      // Add data for each dolphin for this series
      for (const [idx, d] of data.entries()) {
        const isOdd = (idx + i) % 2 === 1;
        d[`series${i}`] = isOdd ? 30 + i * 10 : 50 + i * 10;
      }

      series.push({
        type: "bar",
        xKey: "dolphin",
        yKey: `series${i}`,
        yName: `Series ${i + 4}`,
        strokeWidth: 2,
      });
    }
  }

  return { data, series };
}

export function buildChartPreview(
  state: ChartThemeState,
  mode: ThemeMode,
): AgChartOptions {
  const customTheme: AgChartTheme = {
    baseTheme: state.selectedBaseTheme,
    palette: { fills: state.fills, strokes: state.strokes },
    params: Object.fromEntries(
      Object.entries(chartThemeParams(state)).filter(
        ([key]) => !key.startsWith("backgroundImage"),
      ),
    ),
  };
  const { data, series } = getData(state.fills.length);
  return {
    theme: customTheme,
    data,
    series,
    axes: [
      { type: "category", position: "bottom" },
      { type: "number", position: "left" },
    ],
    title: { text: "Dolphin Interaction Data" },
    legend: { position: "bottom" },
    ...(mode === "dark" && !state.backgroundColor
      ? { background: { visible: false } }
      : {}),
  };
}
