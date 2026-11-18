import { z } from "zod";
import type { FormInputParamDef, ParamDef } from "~/components/types";
import { unionErrorMap } from "./schemaErrors";

export const EditorLanguages = [
  "sql",
  "javascript",
  "python",
  "json",
  "html",
  "css",
  "markdown",
  "xml",
  "text",
] as const;
export type EditorLanguage = (typeof EditorLanguages)[number];

const ParamDefSchemaBase = z
  .object({
    paramName: z.string().min(1, "This field is required"),
    optional: z.boolean().optional(),
    validationSchema: z.record(z.string(), z.unknown()).optional(),
    label: z.string().optional(),
    value: z.any().nullish(),
    description: z.any().optional(),
    multiple: z.boolean().default(false).optional(),
    row: z.number().optional(),
    type: z
      .enum(
        ["text", "date", "ticker", "number", "boolean", "endpoint", "button", "tabs"],
        unionErrorMap(
          "Supported types are text, date, ticker, number, boolean, endpoint, tabs",
        ),
      )
      .default("text")
      .optional(),
    show: z.boolean().default(true).optional(),
    hidden: z.boolean().optional().default(false),
    style: z
      .object({
        popupWidth: z.number().min(100).max(1000).optional(), // value in px for <AdvancedSelect /> popup width
      })
      .optional(),
    options: z
      .array(
        z
          .object({
            label: z.string(),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]).nullish(),
          })
          .optional(),
      )
      .default([])
      .optional(),
    multiSelect: z.boolean().default(false).optional(),
    roles: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    query: z.string().optional(),
  })
  .partial({
    options: true,
    value: true,
    label: true,
    description: true,
    row: true,
    multiple: true,
    placeholder: true,
    multiSelect: true,
    show: true,
    hidden: true,
    query: true,
  })
  .meta({ id: "ParamDef" });

const ParamValueSchema = z.discriminatedUnion("type", [
  ParamDefSchemaBase.extend({
    type: z.literal("text"),
    value: z.string().nullish(),
    language: z.enum(EditorLanguages, unionErrorMap("Unsupported language")).nullish(),
  }).meta({ id: "TextParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("tabs"),
    value: z.string().nullish(),
    options: z
      .array(
        z.object({
          label: z.string(),
          value: z.string().nullish(),
        }),
      )
      .optional(),
  }).meta({ id: "TabsParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("ticker"),
    value: z.string().nullish(),
  }).meta({ id: "TickerParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("date"),
    value: z.string().nullish(),
  }).meta({ id: "DateParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("button"),
    label: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).nullish(),
  }).meta({ id: "ButtonParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("number"),
    value: z
      .union([z.number(), z.string().regex(/^-?\d*\.?\d*$/)])
      .pipe(z.coerce.number())
      .nullish(),
  }).meta({ id: "NumberParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("boolean"),
    value: z.boolean().nullish(),
  }).meta({ id: "BooleanParamDef" }),
  ParamDefSchemaBase.extend({
    type: z.literal("endpoint"),
    value: z.any().nullish(),
    optionsEndpoint: z.string().optional(),
    optionsParams: z.record(z.string(), z.any()).optional(),
    groupById: z.string().optional(),
    query: z.string().optional(),
  }).meta({ id: "EndpointParamDef" }),
  ParamDefSchemaBase.extend({
    paramName: z.string().optional(),
    type: z.literal("form"),
    endpoint: z.string().optional(),
    method: z.enum(["POST", "PUT"]).optional(),
    inputParams: z
      .array(
        ParamDefSchemaBase.extend({
          type: z
            .enum(
              ["date", "boolean", "endpoint", "number", "text", "button"],
              unionErrorMap(
                "Supported types are text, date, button, number, boolean, endpoint",
              ),
            )
            .optional(),
        }),
      )
      .optional(),
  }).meta({ id: "FormParamDef" }),
]);

export const ParamDefSchema = ParamValueSchema.refine(
  (data) => {
    if (data.multiple === true && data.type !== "text") {
      return false;
    }
    return true;
  },
  {
    message: "multiple can only be true when type is 'text'",
    path: ["multiple"],
  },
);

const ParamDefSchemaArray = z.array(ParamDefSchema).refine(
  (params) => {
    const fileSelectorCount = params.filter((param) =>
      param.roles?.includes("fileSelector"),
    ).length;
    return fileSelectorCount <= 1;
  },
  {
    message: "Only one parameter can have the role 'fileSelector'.",
  },
);

const toParamType = { date: "date" } as const;

export function newParamDef<T extends ParamDef | FormInputParamDef>(paramDef: T): T {
  const { type, value, show } = paramDef;
  let options = paramDef.options ?? [];

  if (type === "boolean" && !options.length) {
    options = [
      { label: "True", value: true },
      { label: "False", value: false },
    ];
  }

  const parseValue = (v: any) => {
    if (v === undefined || v === null || v === "") return undefined;
    if (type === "number" && typeof v === "string") {
      for (const fnc of [Number.parseFloat, Number.parseInt]) {
        const num = fnc(v);
        if (!Number.isNaN(num)) return num;
      }
    }
    if (type === "text") return v?.toString();
    return v;
  };

  const parsedValue = parseValue(value);

  return {
    ...paramDef,
    value: parsedValue ?? null,
    label: paramDef.label ?? paramDef.paramName,
    type: type ?? toParamType?.[paramDef.paramName] ?? "text",
    show: typeof show === "boolean" ? show : true,
    options,
  };
}

export function isParamDef(p: any): p is ParamDef {
  return typeof p === "object" && (p?.type === "form" || p?.paramName);
}

export function isParamDefArray(params: any): params is ParamDef[] {
  return Array.isArray(params) && params.every((p) => isParamDef(p));
}

export const ParamsSchema = z
  .preprocess((val) => {
    if (!Array.isArray(val)) return [];

    const values = val.map((item) => (isParamDef(item) ? newParamDef(item) : item));

    let row = isParamDef(values[0]) ? 1 : 0;
    for (const item of values) {
      if (isParamDefArray(item)) {
        for (const p of item) {
          if (!isParamDef(p)) continue;

          Object.assign(p, newParamDef(p));
          p.row = row;
        }
        row++;
        continue;
      }

      if (isParamDef(item) && item.row === undefined) {
        item.row = 0;
      }
    }

    return values.flat();
  }, ParamDefSchemaArray)
  .default([]);
