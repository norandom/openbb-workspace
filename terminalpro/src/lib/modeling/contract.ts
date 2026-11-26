import { z } from "zod";

export const MODELING_PATH = "/modeling/v1";
export const FCF_WIDGET = "qopenbb_issuer_fcf_yield";
export const SAVED_WIDGET = "qopenbb_saved_model_output";
export const FCF_MODEL = "issuer_fcf_yield";
export const FCF_METHOD = "1";
export const FCF_OUTPUT = "fcf_yield";

export const runId = z.string().regex(/^[0-9a-f]{32}$/);
const identifier = z
  .string()
  .refine((value) => /\S/u.test(value) && [...value].length <= 128);

const int64 = z.union([
  z.number().int(),
  z.bigint().min(-9223372036854775808n).max(9223372036854775807n),
]);
const scalar = z.union([z.string(), int64, z.boolean()]);

const assumptions = z.object({
  version: z.string(),
  effective_date: z.iso.date(),
  assumptions: z.array(
    z.object({
      assumption_id: z.string(),
      value: scalar,
      unit: z.string().nullish(),
      author: z.string().nullish(),
      origin: z.enum(["user_supplied", "method_default"]),
      rationale: z.string(),
    }),
  ),
});

export const savedRun = z.object({
  schema_version: z.literal("1"),
  run_id: runId,
  created_at: z.string(),
  descriptor: z.object({ model_id: z.string(), method_version: z.string() }),
  assumptions,
});

const status = z.enum(["verified", "unverified", "withheld"]);
const nonblank = z.string().regex(/\S/u);
const traceValue = z.object({
  name: identifier,
  value: z.string(),
  unit: identifier,
  currency: z.string().nullable(),
  scale: z.number().int(),
  period_start: z.iso.date().nullable(),
  period_end: z.iso.date().nullable(),
});
const valueSchemas = {
  decimal: z
    .string()
    .max(78)
    .regex(
      /^(?:0|-?(?:[1-9][0-9]{0,37}|0\.[0-9]{0,37}[1-9]|(?=(?:[0-9]\.?){1,37}[1-9](?![\s\S]))[1-9][0-9]*\.[0-9]*[1-9]))(?![\s\S])/u,
    ),
  integer: int64,
  boolean: z.boolean(),
  text: nonblank.max(4096),
  date: z.iso.date(),
};

const projectedOutput = z
  .object({
    output_id: identifier,
    status,
    freshness: z.enum(["saved", "matched", "stale"]),
    value: scalar.nullable(),
    value_type: z.enum(["decimal", "integer", "boolean", "text", "date"]),
    display_text: z.string().nullable(),
    unit: identifier,
    reason: z.string().nullable(),
    check_explanations: z.string().nullable(),
    semantic_definition: nonblank,
    run_detail_href: nonblank,
  })
  .refine((row) => {
    if (row.status === "withheld")
      return row.value === null && row.display_text === null;
    return (
      valueSchemas[row.value_type].safeParse(row.value).success &&
      row.display_text !== null
    );
  });

export const projection = z.object({
  run_id: runId,
  results: z.tuple([projectedOutput]),
  run_detail_href: nonblank,
  checks: z.array(
    z.object({
      rule_id: z.string(),
      rule_version: z.string(),
      severity: z.string(),
      status: z.string(),
      explanation: z.string().nullable(),
    }),
  ),
  trace: z.array(
    z.object({
      trace_id: z.string(),
      formula_id: z.string(),
      formula_version: z.string(),
      expression: z.string(),
      source_record_ids: z.array(z.string()),
      input_ids: z.array(z.string()),
      substitutions: z.array(traceValue),
      intermediate_values: z.array(traceValue),
    }),
  ),
  verification: z.array(
    z.object({
      output_id: identifier,
      status: z.string(),
      explanation: z.string(),
    }),
  ),
});

export const savedSelection = z.object({
  run_id: runId,
  output_id: identifier,
  expected_run_id: runId.optional(),
});

export type SavedSelection = z.infer<typeof savedSelection>;
export type SavedRun = z.infer<typeof savedRun>;
export type Projection = z.infer<typeof projection>;
