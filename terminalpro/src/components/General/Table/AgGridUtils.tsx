export { getColumnDefs, getQuarterColumnDefs } from "./ColumnDefinitions";
export {
  convertToReadableLabel,
  determineFilterType,
  formatDate,
  formatObjectValue,
  formatTime,
  getDateFilterParams,
  getTimezoneCompact,
  inferChartDataType,
  isBigNumber,
  isDate,
  isDateorYearField,
  isDateTime,
  isLink,
} from "./ColumnValues";

// Range menus and pivot callbacks remain import-compatible for unavailable legacy renderers.
export const getCellRange = (..._args: any[]) => undefined;
export const checkCellRange = (..._args: any[]) => false;
export const getChartContextMenuItems = (..._args: any[]) => [];
export const getContextMenuItems = (..._args: any[]) => [];
export const getAddToCopilotMenuItem = (..._args: any[]) => undefined;
export const onPivotModeChanged = (..._args: any[]) => undefined;
export const FINANCIAL_RATIO_COLS = {
  liquidity: ["Index", "current_ratio", "cash_per_share", "cash_ratio"],
  efficiency: [
    "Index",
    "days_sales_outstanding",
    "receivables_turnover",
    "inventory_turnover",
    "asset_turnover",
    "operating_cash_flow_per_share",
    "free_cash_flow_per_share",
  ],
  profitability: [
    "Index",
    "gross_profit_margin",
    "operating_profit_margin",
    "net_income_per_share",
    "return_on_assets",
    "return_on_equity",
    "earnings_yield",
    "free_cash_flow_yield",
    "income_quality",
  ],
  leverage: [
    "Index",
    "debt_ratio",
    "debt_to_equity",
    "interest_debt_per_share",
    "net_debt_to_ebitda",
  ],
  coverage: [
    "Index",
    "interest_coverage",
    "cash_flow_coverage_ratios",
    "capex_to_operating_cash_flow",
    "dividend_paid_and_capex_coverage_ratio",
  ],
  operating_cash_flow: [
    "Index",
    "operating_cash_flow_per_share",
    "free_cash_flow_per_share",
    "cash_per_share",
    "capex_per_share",
  ],
};
