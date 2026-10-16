import type {
  AgAxisCaptionOptions,
  AgBubbleSeriesTooltipRendererParams,
  AgCartesianSeriesTooltipRendererParams,
  AgCategoryAxisThemeOptions,
  AgDonutSeriesTooltipRendererParams,
  AgNumberAxisOptions,
  AgPyramidSeriesTooltipRendererParams,
  AgRadarSeriesTooltipRendererParams,
  AgRadialSeriesTooltipRendererParams,
  AgTooltipRendererResult,
  AgTreemapSeriesTooltipRendererParams,
} from "ag-charts-community";
import type { ChartType, ChartTypeExCombo, GridChartContext } from "ag-grid-community";
import dayjs from "dayjs";
import { CHART_TYPE_TO_SERIES_TYPE } from "~/lib/constants";
import { formatNumber, formatNumberMagnitude } from "~/lib/utils";
import { isDate, isDateTime } from "../AgGridUtils";

type ToolTipRendererParams<
  T = any,
  CTX = GridChartContext,
> = AgCartesianSeriesTooltipRendererParams<T, CTX> &
  AgRadarSeriesTooltipRendererParams<T, CTX> &
  AgRadialSeriesTooltipRendererParams<T, CTX> &
  AgBubbleSeriesTooltipRendererParams<T, CTX> &
  AgTreemapSeriesTooltipRendererParams<T, CTX> &
  AgDonutSeriesTooltipRendererParams<T, CTX> &
  AgPyramidSeriesTooltipRendererParams<T, CTX>;

type CreateDefaultProps = {
  chartType: string;
  title?: { xLabel: string; yLabel: string };
  getParsedPeriod?: () => { isQuarterly: boolean; isAnnual: boolean };
  getDecimalPlaces?: () => number | undefined;
};

const parsedPeriodDefault = () => ({ isQuarterly: false, isAnnual: false });

export function getFiscalPeriodString(
  value: string | Date,
  getParsedPeriod: CreateDefaultProps["getParsedPeriod"],
  chartType = "",
): string {
  const hasTime = isDateTime(value);

  if (value instanceof Date) {
    const valueStr = value.toISOString().replace("T", " ");
    return valueStr.slice(0, 19).replace(" 00:00:00", "");
  }

  if (!(isDate(value) || hasTime)) return value;

  const dateObj = dayjs(value);

  if (hasTime && dateObj.format("HH:mm:ss").includes("00:00:00")) {
    return dateObj.format("YYYY-MM-DD");
  }

  const { isQuarterly, isAnnual } = getParsedPeriod();
  if (isQuarterly) {
    const newLine = chartType?.includes("Column") ? "\n" : " ";
    return `Q${dateObj.quarter()}${newLine}${dateObj.year()}`;
  }

  if (isAnnual) return `FY ${dateObj.year()}`;

  return value;
}

function getLgToSm(values: Record<string, any>, decimals?: number) {
  return Object.keys(values || {})
    .filter((key) => values[key] !== undefined && typeof values[key] === "number")
    .sort((a, b) => values[b] - values[a])
    .map((key) => ({ label: key, value: formatNumber(values[key], decimals) }));
}

export function createDefaultSeries(props: CreateDefaultProps) {
  const { chartType, getParsedPeriod = parsedPeriodDefault, getDecimalPlaces } = props;

  return {
    label: {
      enabled: false,
      formatter: (params) => {
        if (typeof params.value === "number") {
          return formatNumber(params.value, 0);
        }

        if (!dayjs(params.value).isValid()) {
          return `${params.value}`.split(" ").reduce((acc, word, i) => {
            if (i % 2 === 0 && `${acc} ${word}`.length < 20) {
              return `${acc} ${word}`;
            }
            return `${acc} ${word}\n`;
          });
        }

        return getFiscalPeriodString(params.value, getParsedPeriod, chartType);
      },
    },
    tooltip: {
      enabled: true,
      renderer: (params: ToolTipRendererParams): AgTooltipRendererResult => {
        const { xKey, yKey, seriesId, context, stageKey, valueKey, ...rest } = params;
        const {
          datum,
          angleName,
          angleKey,
          sizeKey,
          labelKey = yKey,
          labelName,
        } = rest;

        const dKey = [xKey, yKey, angleKey, sizeKey, labelKey, stageKey].find(
          (key) => datum?.[key] !== undefined,
        );
        const lKey = [labelKey, valueKey].find((key) => datum?.[key] !== undefined);

        const dateString = getFiscalPeriodString(datum?.[dKey], getParsedPeriod);
        const labelValue = getFiscalPeriodString(datum?.[lKey], getParsedPeriod);
        // const newLabel = labelName?.includes("AG-GRID") ? labelValue : labelName;
        // const label = datum?.[labelKey] && `${newLabel || labelKey}: ${labelValue}`;

        const indexColDef = context?.api.getColumnDef("Index");
        let headerName: string | undefined;

        if (indexColDef) {
          // @ts-expect-error
          headerName = indexColDef?.valueFormatter({
            value: dateString?.toString(),
            colDef: indexColDef,
          });
        }

        const colDef = context?.api.getColumn(lKey);

        if (
          [
            "RadialColumn",
            "Radar",
            "Nightingale",
            "BoxPlotSeries",
            "FunnelSeries",
            "RadialBar",
            "HistogramSeries",
          ].find((item) => seriesId.includes(item))
        )
          return {};

        if (seriesId.includes("HeatmapSeries")) {
          const dateString = getFiscalPeriodString(
            datum?.[params.yKey],
            getParsedPeriod,
          );
          const values = {
            [datum?.[xKey]]: datum?.[params.colorKey],
          };

          return {
            title: dateString?.toString(),
            data: getLgToSm(values, getDecimalPlaces?.()),
          };
        }

        if (seriesId.includes("TreemapSeries")) {
          const values = {
            [params.colorName]: datum?.[params.colorKey],
            [params.yName || yKey]: datum?.[yKey],
            [params.sizeName || sizeKey]: datum?.[sizeKey],
          };

          return {
            title: labelValue?.toString(),
            data: getLgToSm(values, getDecimalPlaces?.()),
          };
        }

        if (seriesId.includes("BubbleSeries")) {
          const values = {
            [params.xName || xKey]: datum?.[xKey],
            [params.yName || yKey]: datum?.[yKey],
            [params.sizeName || sizeKey]: datum?.[sizeKey],
          };
          return { data: getLgToSm(values, getDecimalPlaces?.()) };
        }

        if (seriesId.includes("ScatterSeries")) {
          const values = {
            [params.xName || xKey]: datum?.[xKey],
            [params.yName || yKey]: datum?.[yKey],
          };
          return { data: getLgToSm(values, getDecimalPlaces?.()) };
        }
        if (angleName && datum?.[angleKey]) {
          const angleValue = datum?.[angleKey];
          const dateString = getFiscalPeriodString(
            datum?.[params.radiusKey] || datum?.[params.calloutLabelKey],
            getParsedPeriod,
          );
          return {
            data: [{ label: "", value: angleValue?.toLocaleString() }],
            title: labelName || angleName,
            heading: dateString?.toString(),
          };
        }

        const data = getLgToSm(
          {
            [colDef?.getColDef()?.headerName || lKey]: labelValue,
          },
          getDecimalPlaces?.(),
        );

        const title = getFiscalPeriodString(params.title, getParsedPeriod);

        return {
          heading: headerName || dateString?.toString(),
          data,
          title: data?.length > 0 ? undefined : title,
        };
      },
    },
  };
}

export function createChartArtifactAxes(chartType: string) {
  const titleOptions = {
    enabled: true,
    fontSize: 11,
    spacing: 10,
    formatter: (params) => {
      const { boundSeries } = params;

      const title = new Set(boundSeries?.map((series) => series?.name));

      return Array.from(title).join(", ");
    },
  } as AgAxisCaptionOptions;

  return {
    category: {
      label: {
        avoidCollisions: true,
        fontSize: 11,
        autoRotate: false,
        formatter: (params) => {
          if (
            dayjs(params.value).startOf("day").format("MMM DD\n YYYY") ===
            "Invalid Date"
          ) {
            return `${params.value}`.split(" ").reduce((acc, word, i) => {
              if (i % 2 === 0 && `${acc} ${word}`.length < 20) {
                return `${acc} ${word}`;
              }
              return `${acc} ${word}\n`;
            });
          }

          if (typeof params.value === "number")
            return formatNumber(params.value, 0).replace(/,/g, "");
          if (params.value?.toString()?.length < 10) return params.value;

          return dayjs(params.value).startOf("day").format("MMM DD\n YYYY");
        },
      },
      title: titleOptions,
    } as AgCategoryAxisThemeOptions,
    number: {
      label: {
        fontSize: 11,
        formatter: (params) => {
          if (typeof params.value === "number") {
            return formatNumberMagnitude(params.value, 0).replace(/,/g, "");
          }

          return params.value;
        },
      },
      title: {
        ...titleOptions,
        enabled: chartType === "scatter",
      },
    } as AgNumberAxisOptions,
  };
}

type SeriesMapping = typeof CHART_TYPE_TO_SERIES_TYPE;
export type ChartSeriesT = SeriesMapping[ChartTypeExCombo];

export function getSeriesType(chartType: ChartType): ChartSeriesT {
  return CHART_TYPE_TO_SERIES_TYPE[chartType as ChartTypeExCombo] ?? "line";
}
