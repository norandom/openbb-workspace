import { z } from "zod";
import {
  CronExpressionSchema,
  RefetchIntervalSchema,
  StorageSchema,
  TickerSchema,
} from "./chart";
import { ParamsSchema } from "./params";
import { DataSchema, TableSchema } from "./table";
import { widgetTypesSchema } from "./widgetTypes";

export const WidgetSchemaBase = z.object({
  id: z.string(),
  widgetId: z.string(),
  type: widgetTypesSchema.optional(),
  fileEndpoint: z.string().optional(),
  name: z.string().optional(),
  showTitle: z.boolean().default(true).nullish(),
  description: z.string().optional(),
  groupId: z.string().nullish(),
  groupById: z.string().nullish(),
  innerTab: z.string().optional(),
  disableRetrievalForCopilot: z.boolean().optional(),
  storage: StorageSchema.optional(),
  external: z.boolean().optional(),
  params: ParamsSchema.optional(),
  staleTime: z
    .number()
    .min(1000)
    .nullish()
    .default(1000 * 60 * 5),
  refetchInterval: RefetchIntervalSchema.nullish(),
  dataUpdateDisplay: CronExpressionSchema.optional(),
  runButton: z.boolean().optional(),
  /** @deprecated Use `language` field in params array instead for omni/ssrm_advanced widgets */
  inputType: z.string().optional(),
  copilotParseAs: z
    .union([z.literal("structured"), z.literal("unstructured")])
    .optional(),
  raw: z.boolean().optional(),
  exportable: z.boolean().default(true).optional(),
});

export const InternalWidgetSchema = WidgetSchemaBase.extend({
  data: z
    .object({
      mainTicker: TickerSchema.optional(),
      secondaryTickers: z.array(TickerSchema).optional(),
      html: z.string().optional(),
      table: DataSchema,
    })
    .optional()
    .default({ table: {} }),
  refetchInterval: z
    .union([z.number().min(1000), z.literal(false), CronExpressionSchema])
    .optional()
    .default(1000 * 60 * 15),
});

export const ExternalWidgetSchema = WidgetSchemaBase.extend({
  category: z.string().nullish(),
  subCategory: z.string().nullish(),
  connectionType: z
    .enum([
      "single",
      "advanced-backend",
      "file",
      "database",
      "snowflake",
      "widgetMetadata",
    ])
    .nullish(),
  endpoint: z
    .object({
      url: z.string(),
      method: z.enum(["GET", "POST"]),
      headers: z.record(z.string(), z.string()).optional(),
      query: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  wsEndpoint: z.string().optional(),
  data: z.preprocess(
    (val: any) => {
      if (val?.wsRowIdColumn && !val?.wsRowIdColumns) {
        const { wsRowIdColumn, ...rest } = val;
        rest.wsRowIdColumns =
          typeof wsRowIdColumn === "string" ? [wsRowIdColumn] : wsRowIdColumn;

        return rest;
      }
      return val;
    },
    z
      .looseObject({
        wsRowIdColumns: z.array(z.string()).optional(),
        table: TableSchema.optional(),
        mainTicker: TickerSchema.optional(),
      })
      .optional()
      .default({ table: {} }),
  ),
  source: z.union([z.array(z.string()), z.string()]).nullish(),
  sourceId: z.string().nullish(),
  sourceName: z.string().nullish(),
  sourceDatabase: z.string().optional(),
  schemaName: z.string().optional(),
  isSharedWidget: z.boolean().nullish(),
})
  .transform((val) => {
    if ((val.runButton && !val.refetchInterval) || val.refetchInterval === false) {
      val.staleTime = Number.POSITIVE_INFINITY;
      val.refetchInterval = false;
    } else if (!val.runButton && val.refetchInterval === undefined) {
      val.refetchInterval = 1000 * 60 * 15;
    }
    return val;
  })
  .refine(
    // make sure multi_file_viewer has "fileSelector" in roles
    (data) => {
      if (data.type === "multi_file_viewer") {
        return data.params?.some(
          (param) => param.type === "endpoint" && param.roles?.includes("fileSelector"),
        );
      }
      return true;
    },
    {
      path: ["params"],
      message: `Endpoint param with \`{ roles: ["fileSelector"] }\` required for \`multi_file_viewer\`.`,
    },
  );
