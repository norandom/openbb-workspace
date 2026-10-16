import type { AgChartOptions, AgChartTheme } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { memo, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { unsupportedChartReason } from "~/components/Widgets/communityCharts";
import UnsupportedRenderer from "~/components/Widgets/UnsupportedRenderer";
import { useShallowCopilotStore } from "~/lib/state/copilot";
import { useShallowThemeStore } from "~/lib/state/theme";
import { useWalkthroughStore } from "~/lib/state/walkthrough";
import { cn } from "../../ds/utils";
import { convertToReadableLabel } from "../../General/Table/AgGridUtils";
import { useAgThemes } from "../../General/Table/Chart/themes";
import {
  createChartArtifactAxes,
  createDefaultSeries,
} from "../../General/Table/Chart/utils";
import type { CreateWidgetParams } from "../hooks/useCreateWidgetFromArtifact";
import { ArtifactActions, type ArtifactProps } from "./ArtifactShared";

export const ChartArtifact = memo<ArtifactProps<"chart">>(
  ({ artifact, inAiMessage }) => {
    const theme = useShallowThemeStore((state) => state.theme);
    const decimalPlaces = useShallowThemeStore((state) => state.decimalDigits);
    const { customChartThemes, chartThemes } = useAgThemes(theme);

    const isHighlighted = useShallowCopilotStore(
      (s) => s.hoveredCitationWidgetId === artifact.name,
    );

    useEffect(() => {
      useWalkthroughStore.setState({ copilotArtifact: artifact });
    }, [artifact]);

    const chartOptions = useMemo(() => {
      if (!(artifact.content.length > 0 && artifact.chart_params)) return null;
      if (unsupportedChartReason(artifact.chart_params)) return null;
      const { chartType, xKey, yKey, angleKey, calloutLabelKey } =
        artifact.chart_params;

      const isScatter = chartType === "scatter";
      const isPie = chartType === "pie";
      const isDonut = chartType === "donut";

      const chartTheme = customChartThemes[chartThemes[0]];
      const overrides = chartTheme?.overrides || {};

      return {
        data: artifact.content,
        series: isDonut
          ? [
              {
                type: "donut",
                calloutLabelKey: calloutLabelKey,
                angleKey: angleKey,
                innerRadiusRatio: 0.7,
              },
            ]
          : isPie
            ? [
                {
                  type: "pie",
                  angleKey: angleKey,
                  calloutLabelKey: calloutLabelKey,
                },
              ]
            : yKey.map((key) => {
                const series = {
                  ...createDefaultSeries({
                    chartType,
                    getDecimalPlaces: () => decimalPlaces,
                  }),
                  type: chartType,
                  xKey: xKey,
                  yKey: key,
                  xName: convertToReadableLabel(xKey),
                  yName: convertToReadableLabel(key),
                };

                if (isScatter) {
                  return {
                    ...series,
                    title: [series.xName, series.yName].join(" vs "),
                  };
                }

                return series;
              }),
        background: { visible: false },
        padding: { top: 20, bottom: 5, left: 20, right: 20 },
        legend: {
          enabled: true,
          position: "top",
          maxHeight: 50,
          maxWidth: 500,
          spacing: 20,
          item: {
            paddingX: 10,
            paddingY: 3,
            marker: {
              shape: "square",
              size: 11,
            },
          },
        },
        theme: {
          ...chartTheme,
          overrides: {
            ...(chartTheme?.overrides || {}),
            common: {
              ...(overrides?.common || {}),
              title: {
                ...(overrides?.common?.title || {}),
                fontSize: 12,
              },
              axes: createChartArtifactAxes(chartType),
            },
          },
        } as unknown as AgChartTheme<any, unknown>,
        animation: { enabled: false },
        keyboard: { enabled: false },
      } as unknown as AgChartOptions;
    }, [artifact, chartThemes, customChartThemes]);

    const handleCopy = useCallback(() => {
      navigator.clipboard
        .writeText(JSON.stringify(artifact.content, null, 2))
        .then(() => toast.success("Chart data copied to clipboard"))
        .catch((err) =>
          toast.error("Failed to copy chart data", { description: err.message }),
        );
    }, [artifact.content]);

    const createWidgetParams = useMemo<CreateWidgetParams>(
      () => ({
        widgetType: "chart",
        content: artifact.content,
        metadata: {
          uuid: artifact.uuid,
          name: artifact.name,
          description: artifact.description,
          ...artifact.chart_params,
        },
      }),
      [artifact],
    );

    if (!(artifact.content.length > 0 && artifact.chart_params)) return null;

    if (unsupportedChartReason(artifact.chart_params))
      return <UnsupportedRenderer reason="unsupported standalone chart series" />;

    return (
      <div
        id={artifact.name}
        className={cn("overflow-auto rounded px-1.5", {
          "outline-2 outline-brand-main": isHighlighted,
          "dark:bg-dark-600 bg-light-50": inAiMessage,
          "dark:bg-dark-800 bg-light-50": !inAiMessage,
        })}
      >
        <div className="relative mt-1">
          <div className="grid min-h-[300]">
            <AgCharts className="h-full w-full" options={chartOptions} />
          </div>
          <ArtifactActions
            copyTooltip="Copy chart data"
            createTooltip="Create widget from chart"
            copyClassName="_copy-chart-data-button"
            copyTestId="copy-chart-data-button"
            createTestId="create-widget-from-chart-button"
            onCopy={handleCopy}
            createWidgetParams={createWidgetParams}
          />
        </div>
      </div>
    );
  },
);

ChartArtifact.displayName = "ChartArtifact";
