import type { EChartsOption, SeriesOption } from "echarts";
import { useId, useMemo, useRef, useState } from "react";
import { EChartsHost } from "~/components/General/Table/Chart/echarts/EChartsHost";
import type {
  StoryChartLane,
  StoryCharts,
  StoryChartView,
} from "~/lib/modeling/storyState";
import { useThemeStore } from "~/lib/state/theme";

export type ChartConfig = StoryCharts[StoryChartView][StoryChartLane];
export type ChartPoint = { label: string; value: string; display: string };
export type ChartSeries = { id: string; label: string; points: ChartPoint[] };
type Props = {
  label: string;
  caption: string;
  config: ChartConfig;
  series: ChartSeries[];
  readOnly: boolean;
  onChange: (config: {
    chart_type?: ChartConfig["chart_type"];
    series?: string[];
  }) => void;
};

const axes = {
  date: "Session date",
  proxy: "ETF proxy",
  window: "Window",
  price_usd: "USD",
  percent: "%",
  percentage_points: "pp",
};

function chartOptions(
  label: string,
  config: ChartConfig,
  selected: ChartSeries[],
  theme: "light" | "dark",
): EChartsOption {
  const categories = [
    ...new Set(selected.flatMap(({ points }) => points.map((point) => point.label))),
  ];
  if (config.x_axis === "date") categories.sort();
  const color = theme === "dark" ? "#e1e6ef" : "#263044";
  const gridColor = theme === "dark" ? "#424b5d" : "#d8dde6";
  return {
    animation: false,
    aria: {
      enabled: true,
      label: {
        description: `${label}. Exact values appear in the story findings and dated tables.`,
      },
    },
    tooltip: { trigger: "item", renderMode: "richText" },
    textStyle: { color },
    grid: { top: 54, bottom: 52, left: 58, right: 22 },
    color: theme === "dark" ? ["#86b9fc", "#f6a76c"] : ["#1767a9", "#a85b24"],
    legend: { top: 5, textStyle: { color }, selectedMode: false },
    xAxis: {
      data: categories,
      type: "category",
      name: axes[config.x_axis],
      nameLocation: "middle",
      nameGap: 27,
      axisLabel: { color, hideOverlap: true },
      axisLine: { lineStyle: { color } },
    },
    yAxis: {
      type: "value",
      name: axes[config.y_axis],
      axisLabel: { color },
      splitLine: { lineStyle: { color: gridColor } },
      scale: config.chart_type === "line",
    },
    series: selected.map((item): SeriesOption => {
      const byLabel = new Map(item.points.map((point) => [point.label, point]));
      return {
        name: item.label,
        type: config.chart_type,
        ...(config.chart_type === "line" && { showSymbol: categories.length <= 2 }),
        data: categories.map((category) => {
          const point = byLabel.get(category);
          return point
            ? {
                value: Number(point.value),
                tooltip: {
                  formatter: `${item.label} · ${category} · ${point.display}`,
                },
              }
            : null;
        }),
      };
    }),
  };
}

function ChartRenderer({
  label,
  caption,
  config,
  series,
}: Pick<Props, "label" | "caption" | "config" | "series">) {
  const id = useId();
  const captionId = `${id}-caption`;
  const theme = useThemeStore((state) => state.theme);
  const revision = useRef(0);
  const [failedRevision, setFailedRevision] = useState<number>();
  const request = useMemo(
    () => ({
      options: chartOptions(caption, config, series, theme),
      revision: ++revision.current,
    }),
    [caption, config, series, theme],
  );
  return (
    <figure aria-label={label} aria-describedby={captionId}>
      <figcaption id={captionId} className="text-ds-text-caption">
        {caption}
      </figcaption>
      {failedRevision === request.revision && (
        <p role="alert">
          Chart unavailable. The findings and dated tables remain available.
        </p>
      )}
      <EChartsHost
        {...request}
        legendScope={id}
        className="h-56 w-full"
        onError={() => setFailedRevision(request.revision)}
      />
    </figure>
  );
}

export function ResearchStoryChart({
  label,
  caption,
  config,
  series,
  onChange,
  readOnly,
}: Props) {
  const selected = series.filter((item) => config.series.some((id) => id === item.id));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <fieldset
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
        disabled={readOnly}
      >
        <legend className="body-sm-semibold">{label}</legend>
        <label className="flex items-center gap-2">
          Chart type
          <select
            aria-label={`${label} type`}
            className="rounded border border-ds-border bg-card p-1"
            value={config.chart_type}
            onChange={(event) =>
              onChange({ chart_type: event.target.value === "bar" ? "bar" : "line" })
            }
          >
            <option value="line">Line</option>
            <option value="bar">Bar</option>
          </select>
        </label>
        {series.map((item) => {
          const checked = selected.includes(item);
          return (
            <label key={item.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={checked}
                disabled={checked && selected.length === 1}
                onChange={() =>
                  onChange({
                    series: checked
                      ? config.series.filter((id) => id !== item.id)
                      : [...config.series, item.id],
                  })
                }
              />
              {item.label}
            </label>
          );
        })}
      </fieldset>
      {selected.some((item) => item.points.length) ? (
        <ChartRenderer
          label={label}
          caption={caption}
          config={config}
          series={selected}
        />
      ) : (
        <p>No values for the selected series.</p>
      )}
    </div>
  );
}
