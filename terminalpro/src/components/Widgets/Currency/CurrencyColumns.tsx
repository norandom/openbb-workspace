import type { ColDef } from "ag-grid-community";
import type { ReactElement } from "react";
import { formatTime } from "~/components/General/Table/AgGridUtils";
import Tooltip from "~/components/Tooltip";
import { cn, formatNumber } from "~/lib/utils";
export function formatPercentage(
  value: string | number,
  withColor = false,
  decimals = 2,
): ReactElement | string {
  if (value === null || value === undefined) return "-";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return "Invalid value";
  }
  const formattedValue = `${numericValue >= 0 ? "+" : ""}${formatNumber(
    numericValue,
    decimals,
  )}%`;
  if (withColor) {
    return (
      <span
        className={cn({
          "text-green-400": numericValue > 0,
          "text-red-500": numericValue < 0,
        })}
      >
        {formattedValue}
      </span>
    );
  }
  return formattedValue;
}

export function currencyColumns(decimalDigitsToUse: number, timezone: string) {
  return [
    {
      field: "base_currency",
      headerName: "Base Currency",
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Symbol",
      flex: 1,
      field: "symbol",
      filter: "agTextColumnFilter",
      cellDataType: "text",
    },
    {
      field: "last_rate",
      headerName: "Last",
      flex: 1,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "open",
      headerName: "Open",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "high",
      headerName: "High",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "low",
      headerName: "Low",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "volume",
      headerName: "Volume",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
    },
    {
      field: "prev_close",
      headerName: "Prev Close (%)",
      flex: 1,
      type: "numericColumn",
      valueGetter: (params) => {
        if (params.node.group) return "";
        if (!(params.data?.prev_close && params.data?.last_rate)) return 0;
        const prevClose = params.data.prev_close;
        const lastRate = params.data.last_rate;
        return formatNumber(
          ((lastRate - prevClose) / prevClose) * 100,
          decimalDigitsToUse,
        );
      },
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "change",
      headerName: "Change",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "change_percent",
      headerName: "Change Percent",
      flex: 1,
      hide: true,
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
      filter: "agNumberColumnFilter",
    },
    {
      field: "ma50",
      headerName: "MA50",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "ma200",
      headerName: "MA200",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "year_high",
      headerName: "52W High",
      flex: 1,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "year_low",
      headerName: "52W Low",
      flex: 1,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        return (
          <span className="whitespace-nowrap" title={params.value}>
            {formatNumber(params.value, decimalDigitsToUse)}
          </span>
        );
      },
    },
    {
      field: "one_week",
      headerName: "1W%",
      flex: 1,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "one_month",
      headerName: "1M%",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "three_month",
      headerName: "3M%",
      flex: 1,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "six_month",
      headerName: "6M%",
      flex: 1,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "ytd",
      headerName: "YTD%",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "one_year",
      headerName: "1Y%",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "three_year",
      headerName: "3Y%",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "five_year",
      headerName: "5Y%",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "ten_year",
      headerName: "10Y%",
      flex: 1,
      hide: true,
      filter: "agNumberColumnFilter",
      type: "numericColumn",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return formatPercentage(params.value, true, decimalDigitsToUse);
      },
    },
    {
      field: "last_rate_timestamp",
      headerName: "Time",
      flex: 1,
      filter: "agDateColumnFilter",
      cellRenderer: (params) => {
        if (params.node.group) return "";
        return (
          <Tooltip message={timezone}>
            <div>{formatTime(params.value)}</div>
          </Tooltip>
        );
      },
    },
  ] as ColDef[];
}
