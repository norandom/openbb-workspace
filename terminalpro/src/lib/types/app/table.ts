import { z } from "zod";
import { ChartViewOptionsSchema } from "./chart";

export const ColorOptionsSchema = z.object({
  condition: z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "between"]).optional(),
  color: z.union([
    z.enum(["green", "red", "blue"]),
    z
      .templateLiteral(["#", z.string()])
      .refine((v) => /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(v), {
        message: "Invalid hex color code",
      }),
  ]),
  fill: z.boolean().default(false).optional(),
});

export const ColorBaseSchema = ColorOptionsSchema.extend({
  condition: z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "contains", "notContains"]),
  value: z.union([z.string(), z.number()]),
});

export const ColorBetweenSchema = ColorOptionsSchema.extend({
  condition: z.literal("between"),
  range: z.object({ min: z.number(), max: z.number() }),
});

export const ColorRuleSchema = z
  .discriminatedUnion("condition", [ColorBaseSchema, ColorBetweenSchema])
  .meta({ id: "ColorRule" });

export const RenderFnTypes = [
  "greenRed",
  "titleCase",
  "hoverCard",
  "cellOnClick",
  "columnColor",
  "showCellChange",
] as const;

export type RenderFn = (typeof RenderFnTypes)[number];

export const RenderFnSchema = z.enum(RenderFnTypes).optional();

const RenderFnParamsBaseSchema = z
  .looseObject({
    actionType: z
      // "openUrl", "openModal", "openWidget" not implemented yet
      .enum(["groupBy", "sendToAgent"])
      .nullish(),
    groupByParamName: z.string().nullish(),
    groupBy: z
      .object({
        forceUpdate: z.boolean().optional(),
        paramName: z
          .string()
          .min(1, "`groupBy.paramName` is required when actionType is groupBy"),
        valueField: z.string().optional(),
      })
      .optional(),
    hoverCard: z
      .object({
        cellField: z.string().optional().default("value"),
        title: z.string().optional(),
        markdown: z.string().optional(),
      })
      .nullish(),
    sendToAgent: z
      .object({
        markdown: z.string().optional(),
        agentId: z.string().nullish(),
      })
      .nullish(),
    colorRules: z.array(ColorRuleSchema).nullish(),
    colorValueKey: z.string().nullish(),
  })
  .nullish();

const RenderFnParamsSchema = z.preprocess(
  (val: z.output<typeof RenderFnParamsBaseSchema>, ctx) => {
    if (!val) return undefined;

    if (val?.actionType === "groupBy") {
      if (typeof val.groupByParamName === "string") {
        const { groupByParamName, groupBy, ...rest } = val;
        return {
          ...rest,
          groupBy: {
            ...(groupBy ?? {}),
            paramName: groupByParamName,
          },
        };
      }

      if (!val.groupBy || typeof val.groupBy?.paramName !== "string") {
        ctx.addIssue({
          code: "custom",
          message: "`groupBy.paramName` is required when actionType is `groupBy`",
        });
      }
    }

    if (val?.actionType === "sendToAgent") {
      if (!val.sendToAgent || typeof val.sendToAgent?.markdown !== "string") {
        ctx.addIssue({
          code: "custom",
          message:
            "`sendToAgent.markdown` is required when actionType is `sendToAgent`",
        });
      }
    }

    return val;
  },
  RenderFnParamsBaseSchema,
);

export const FormatterFnSchema = z
  .enum(["int", "none", "percent", "normalized", "normalizedPercent", "dateToYear"])
  .nullish();

export const TableColumnDefsSchema = z.array(
  z.object({
    field: z.string(),
    enableCellChangeWs: z.boolean().default(true).nullish(),
    headerName: z.string(),
    chartDataType: z.enum(["category", "series", "time", "excluded"]).optional(),
    cellDataType: z
      .enum(["text", "number", "boolean", "date", "dateString", "object"])
      .optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    formatterFn: FormatterFnSchema,
    decimalPlaces: z.number().min(0).max(6).optional(),
    renderFn: z
      .preprocess((val) => {
        if (typeof val === "string") {
          return val.split(",").map((v) => v.trim());
        }

        return Array.isArray(val) ? val?.map((v) => v?.trim()) : val;
      }, z.array(RenderFnSchema).optional())
      .nullish(),
    renderFnParams: RenderFnParamsSchema.nullish(),
    // Sparkline configuration
    sparkline: z
      .object({
        type: z.enum(["line", "area", "bar"]),
        dataField: z.string().optional(),
        options: z
          .object({
            stroke: z.string().optional(),
            strokeWidth: z.number().optional(),
            fill: z.string().optional(),
            fillOpacity: z.number().optional(),
            min: z.number().optional(),
            max: z.number().optional(),
            direction: z.enum(["vertical", "horizontal"]).optional(),
            xKey: z.string().optional(),
            yKey: z.string().optional(),
            tooltip: z
              .object({
                enabled: z.boolean().optional(),
                renderer: z.string().optional(),
              })
              .optional(),
            axis: z
              .object({
                type: z.enum(["number", "category", "time"]).optional(),
                stroke: z.string().optional(),
                strokeWidth: z.number().optional(),
                paddingInner: z.number().optional(),
                paddingOuter: z.number().optional(),
              })
              .optional(),
            markers: z
              .object({
                enabled: z.boolean().optional(),
                shape: z
                  .enum(["circle", "diamond", "square", "plus", "cross", "triangle"])
                  .optional(),
                size: z.number().optional(),
                fill: z.string().optional(),
                stroke: z.string().optional(),
                strokeWidth: z.number().optional(),
                highlightSize: z.number().optional(),
              })
              .optional(),
            highlightStyle: z
              .object({
                fill: z.string().optional(),
                stroke: z.string().optional(),
                strokeWidth: z.number().optional(),
              })
              .optional(),
            // Points of interest configuration
            pointsOfInterest: z
              .object({
                firstLast: z
                  .object({
                    size: z.number().optional(),
                    fill: z.string().optional(),
                    stroke: z.string().optional(),
                    strokeWidth: z.number().optional(),
                  })
                  .optional(),
                minimum: z
                  .object({
                    size: z.number().optional(),
                    fill: z.string().optional(),
                    stroke: z.string().optional(),
                    strokeWidth: z.number().optional(),
                  })
                  .optional(),
                maximum: z
                  .object({
                    size: z.number().optional(),
                    fill: z.string().optional(),
                    stroke: z.string().optional(),
                    strokeWidth: z.number().optional(),
                  })
                  .optional(),
                positiveNegative: z
                  .object({
                    positive: z
                      .object({
                        size: z.number().optional(),
                        fill: z.string().optional(),
                        stroke: z.string().optional(),
                        strokeWidth: z.number().optional(),
                      })
                      .optional(),
                    negative: z
                      .object({
                        size: z.number().optional(),
                        fill: z.string().optional(),
                        stroke: z.string().optional(),
                        strokeWidth: z.number().optional(),
                      })
                      .optional(),
                  })
                  .optional(),
                highlighted: z
                  .object({
                    size: z.number().optional(),
                    fill: z.string().optional(),
                    stroke: z.string().optional(),
                    strokeWidth: z.number().optional(),
                  })
                  .optional(),
              })
              .optional(),
            // Custom formatter function for styling bars/columns based on values
            customFormatter: z.string(),
            label: z
              .object({
                enabled: z.boolean().optional(),
                fontWeight: z.string().optional(),
                fontStyle: z.string().optional(),
                fontSize: z.number().optional(),
                fontFamily: z.string().optional(),
                color: z.string().optional(),
                placement: z
                  .enum([
                    "inside",
                    "outside",
                    "inside-center",
                    "inside-end",
                    "outside-center",
                    "outside-end",
                  ])
                  .optional(),
              })
              .optional(),
            padding: z
              .object({
                top: z.number().optional(),
                right: z.number().optional(),
                bottom: z.number().optional(),
                left: z.number().optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
    width: z.number().nullish(),
    maxWidth: z.number().nullish(),
    minWidth: z.number().nullish(),
    hide: z.boolean().nullish(),
    headerTooltip: z.string().nullish(),
    rowGroup: z.boolean().nullish(),
    aggFunc: z.string().nullish(),
    pinned: z.union([z.literal("left"), z.literal("right"), z.boolean()]).nullish(),
    align: z.enum(["left", "center", "right"]).optional(),
  }),
);

export const DataSchema = z.looseObject({}).optional();

export const TableSchema = z
  .object({
    showAll: z.boolean().nullish(),
    chartView: ChartViewOptionsSchema.optional(),
    columnsDefs: TableColumnDefsSchema.optional(),
    columnState: DataSchema.optional(),
    filterModel: DataSchema.optional(),
    transpose: z.boolean().optional(),
    enableAdvanced: z.boolean().optional(),
    enableFormulas: z.boolean().optional(),
    formatterFn: FormatterFnSchema,
  })
  .optional();
