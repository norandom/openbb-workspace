import { color, type EChartsOption, type SeriesOption } from "echarts";
import type {
  ApplicationResolvedStyle,
  ApplicationThemeInput,
} from "../application/appearanceModel";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { CartesianFamily } from "./cartesianTypes";

// Stock createItemStyler uses this palette independently of the normal series palette.
const fills = [
  "#fac858",
  "#91cc75",
  "#5470c6",
  "#ee6666",
  "#73c0de",
  "#3ba272",
  "#fc8452",
  "#9a60b4",
  "#ea7ccc",
  "#ffb347",
  "#87ceeb",
  "#32cd32",
  "#ff6347",
  "#4169e1",
  "#ff69b4",
];

export function cartesianBarColors(
  options: EChartsOption,
  snapshot: ChartSnapshot,
  family: CartesianFamily,
  enabled: boolean,
  theme: ApplicationThemeInput,
  style: ApplicationResolvedStyle,
): EChartsOption {
  const series = options.series as SeriesOption[];
  if (!enabled || family === "line" || series.length !== 1) return options;
  const palette = theme.name.startsWith("custom-") ? theme.palette.fills : fills;
  const categoryColors = new Map<string, string>();
  const colors = snapshot.rows.map((row) => {
    const key = row.category?.toString() || "";
    if (!categoryColors.has(key))
      categoryColors.set(key, palette[categoryColors.size % palette.length]);
    return categoryColors.get(key)!;
  });
  return {
    ...options,
    series: series.map(
      (item) =>
        ({
          ...item,
          data: (item as { data: unknown[] }).data.map((value, index) => ({
            value,
            itemStyle: {
              color:
                style.application.series.fillOpacity === 1
                  ? colors[index]
                  : color.modifyAlpha(
                      colors[index],
                      color.parse(colors[index])![3] *
                        style.application.series.fillOpacity,
                    ),
            },
          })),
        }) as SeriesOption,
    ),
  };
}
