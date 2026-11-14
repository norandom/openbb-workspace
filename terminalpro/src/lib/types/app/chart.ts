import { z } from "zod";
import { AG_CHART_TYPES } from "../../constants";
import { unionErrorMap } from "./schemaErrors";

export const ChartTypeSchema = z
  .enum(
    ["columnLineCombo", "areaColumnCombo", "customCombo", "sankey", ...AG_CHART_TYPES],
    unionErrorMap("Invalid chart type"),
  )
  .default("line")
  .meta({ id: "ChartType" });

export const _GridDataSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minH: z.number().nullish(),
  minW: z.number().nullish(),
  maxH: z.number().nullish(),
  maxW: z.number().nullish(),
  moved: z.boolean().nullish(),
  static: z.boolean().nullish(),
  isDraggable: z.boolean().nullish(),
});

export const StorageSchema = z.looseObject({}).default({});

export const CronExpressionSchema = z.string().trim().min(1);
export const RefetchIntervalSchema = z.union([
  z.number().min(1000),
  z.literal(false),
  CronExpressionSchema,
]);

export const TickerSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  category: z.enum(
    ["crypto", "equity", "forex", "index", "futures", "derivative", "etf", "country"],
    unionErrorMap("Invalid input"),
  ),
  color: z.string().nullish(),
  type: z.string().nullish(),
  name: z.string().nullish(),
  exchange: z.string().nullish(),
  currency: z.string().nullish(),
  industry: z.string().nullish(),
  sector: z.string().nullish(),
  country: z.string().nullish(),
  cik: z.string().nullish(),
  isin: z.string().nullish(),
  cusip: z.string().nullish(),
  has_options: z.boolean().nullish(),
});

export const ChartViewOptionsSchema = z.object({
  enabled: z.boolean().default(false).optional(),
  chartType: ChartTypeSchema.optional(),
  ignoreCellRange: z.boolean().optional(),
  cellRangeCols: z
    .partialRecord(ChartTypeSchema.optional(), z.array(z.string()).nullish())
    .optional(),
  chartSettingsOpen: z.boolean().default(false).optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export const ChartModelSchema = z.looseObject({
  modelType: z.enum(["range", "pivot"]).optional(),
  chartType: ChartTypeSchema.optional(),
  chartOptions: z.record(z.string(), z.any()).optional(),
  cellRange: z
    .looseObject({
      columns: z.array(z.string()).optional(),
    })
    .optional(),
  suppressChartRanges: z.boolean().optional(),
});
