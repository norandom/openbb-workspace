import { z } from "zod";
import { runId } from "./contract";

const stampPattern =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|\+00:00)(?![\s\S])/u;
const decimalPattern = /^([+-]?)(\d+(?:\.\d+)?)(?:e([+-]?\d+))?(?![\s\S])/iu;
const timestamp = z
  .string()
  .regex(stampPattern)
  .refine(
    (value) =>
      z.iso.date().safeParse(value.slice(0, 10)).success &&
      Number.isFinite(Date.parse(value)),
  );
const id = z.string().regex(/\S/u).max(128);
const ids = z.array(id);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/u);

export function exactDecimalSign(value: string) {
  const match = decimalPattern.exec(value);
  if (!match) return undefined;
  if (!/[1-9]/u.test(match[2])) return 0;
  return match[1] === "-" ? -1 : 1;
}

// Compare decimal magnitudes without expanding large exponents or rounding to binary floats.
export function compareStoryDecimals(left: string, right: string) {
  const leftSign = exactDecimalSign(left);
  const rightSign = exactDecimalSign(right);
  if (leftSign === undefined || rightSign === undefined) return undefined;
  if (leftSign !== rightSign) return leftSign > rightSign ? 1 : -1;
  if (leftSign === 0) return 0;
  const a = decimalMagnitude(left);
  const b = decimalMagnitude(right);
  const size = Math.max(a.digits.length, b.digits.length);
  const aDigits = a.digits.padEnd(size, "0");
  const bDigits = b.digits.padEnd(size, "0");
  if (a.order !== b.order) return a.order > b.order ? leftSign : -leftSign;
  if (aDigits === bDigits) return 0;
  return aDigits > bDigits ? leftSign : -leftSign;
}

function decimalMagnitude(value: string) {
  const match = decimalPattern.exec(value)!;
  const [whole, fraction = ""] = match[2].split(".");
  const digits = (whole + fraction).replace(/^0+/u, "");
  const order = BigInt(digits.length - fraction.length) + BigInt(match[3] ?? "0");
  return { digits, order };
}

export function normalizedStoryTimestamp(value: string) {
  const [seconds, fraction = ""] = value.replace(/(?:Z|\+00:00)$/u, "").split(".");
  return seconds + "." + fraction.padEnd(6, "0") + "Z";
}

const selection = z.object({
  commodity_symbol: z.enum(["DBC", "GLD"]),
  technology_symbol: z.enum(["XLK", "VGT"]),
  observation_date: z.iso.date(),
});
const schedule = z.object({
  calendar_id: z.literal("NYSE_ARCA"),
  schedule_revision: z.string().regex(/^[A-Za-z0-9._-]{1,128}(?![\s\S])/u),
});
const cutoff = z.object({
  observation_date: z.iso.date(),
  decision_at: timestamp,
  evaluated_at: timestamp,
  session_timezone: z.literal("America/New_York"),
});
const storyBinding = z.object({ selection, schedule, cutoff });

const row = z.object({
  record_id: id,
  source_record_id: id.nullable(),
  entity_id: id,
  metric_id: id,
  observation_date: z.iso.date(),
  value: z.string().nullable(),
  category: z.enum(["raw", "provider", "estimate"]),
  published_at: timestamp.nullable(),
  vintage_at: timestamp.nullable(),
  context: z.object({
    unit: id,
    scale: z.number().int(),
    currency: id.nullable(),
    basis: id.nullable(),
    quantity: id,
    vintage_coverage: z.enum(["known", "unknown", "unavailable"]).nullable(),
    vintage_limitation: z.string().nullable(),
  }),
});
const output = z.object({
  output_id: id,
  semantic_definition: z.string().min(1),
  value: z.preprocess(
    (value) => (typeof value === "string" ? value : null),
    z.string().nullable(),
  ),
  value_type: id,
  unit: id,
  status: z.enum(["verified", "unverified", "withheld"]),
  reason: z.string().nullable(),
  check_ids: ids,
  trace_ids: ids,
  exception_ids: ids,
});
const check = z.object({
  rule_id: id,
  rule_version: id,
  severity: id,
  status: id,
  explanation: z.string().nullable(),
  output_ids: ids,
});
const traceValue = z.object({
  name: id,
  value: z.string(),
  unit: id,
  currency: id.nullable(),
  scale: z.number().int(),
  period_start: z.iso.date().nullable(),
  period_end: z.iso.date().nullable(),
});
const trace = z.object({
  trace_id: id,
  output_id: id,
  formula_id: id,
  formula_version: id,
  expression: z.string(),
  source_record_ids: ids,
  input_ids: ids,
  check_ids: ids,
  substitutions: z.array(traceValue),
  intermediate_values: z.array(traceValue),
  transformations: z.array(
    z.object({
      transformation_id: id,
      version: id,
      description: z.string(),
    }),
  ),
});
const verification = z.object({
  output_id: id,
  reference_version: id,
  input_fingerprint: fingerprint,
  assumption_fingerprint: fingerprint,
  descriptor_fingerprint: fingerprint,
  output_fingerprint: fingerprint,
  status: z.enum(["match", "mismatch", "unavailable"]),
  explanation: z.string().min(1),
});

const storyRun = z.object({
  schema_version: z.literal("1"),
  run_id: runId.length(32),
  created_at: timestamp,
  descriptor: z.object({
    model_id: id,
    method_version: id,
    reference_version: id,
    input_schema_id: id,
    input_schema_version: z.literal("1"),
  }),
  assumptions: z.object({
    version: z.literal("1"),
    effective_date: z.iso.date(),
    assumptions: z.array(
      z.object({ assumption_id: id, value: z.string(), value_type: z.literal("text") }),
    ),
  }),
  inputs: z.object({
    schema_id: id,
    schema_version: z.literal("1"),
    cutoff,
    tables: z.array(z.object({ table_id: id, rows: z.array(row).max(10000) })).max(3),
    provenance: z.object({
      origin: z.literal("service_acquired"),
      source: id,
      acquisition_id: id,
      query: z.array(z.tuple([id, z.string()])).max(128),
      retrieved_at: timestamp,
    }),
  }),
  outputs: z.array(output).max(6),
  checks: z.array(check).max(256),
  trace: z.array(trace).max(1024),
  verification: z.array(verification).max(256),
});

export const storyMethods = {
  comparison: {
    model: "proxy_comparison",
    version: "2",
    dataset: "story.etf_pair",
    source: "fmp",
    tables: ["sessions", "left_closes", "right_closes"],
    outputUnits: {
      left_momentum: "percent",
      right_momentum: "percent",
      momentum_spread: "percentage_points",
      left_volatility: "percent",
      right_volatility: "percent",
      volatility_spread: "percentage_points",
    },
  },
  regime: {
    model: "real_yield_regime",
    version: "1",
    dataset: "story.dfii10",
    source: "fred",
    tables: ["sessions", "dfii10"],
    outputUnits: { regime: "classification", change: "percentage_points" },
  },
} as const;
export const storyPriceBasis = "split_adjusted_dividends_excluded";
export const storySides = ["left", "right"] as const;

export type StoryRole = keyof typeof storyMethods;
export type StoryBinding = z.infer<typeof storyBinding>;
export type StoryRun = z.infer<typeof storyRun>;
export type StoryRow = z.infer<typeof row>;
export type StoryTrace = z.infer<typeof trace>;
export type StoryTraceValue = z.infer<typeof traceValue>;
export type StoryOutput = z.infer<typeof output>;
export type StoryCheck = z.infer<typeof check>;
export type StoryVerification = z.infer<typeof verification>;
export type StorySide = (typeof storySides)[number];
export type StoryLegFailure = (typeof legFailures)[number];
export type StoryLegReceipt =
  | { retrievedAt: string; failure?: never }
  | { retrievedAt?: never; failure: StoryLegFailure };
export type BoundStoryRun = {
  role: StoryRole;
  run: StoryRun;
  binding: StoryBinding;
  legReceipts?: Record<StorySide, StoryLegReceipt>;
};

const legFailures = [
  "missing_data",
  "upstream",
  "entitlement",
  "invalid_response",
  "timeout",
  "throttling",
] as const;
const legFailure = z.enum(legFailures);

function unique(values: string[]) {
  return new Set(values).size === values.length;
}

function sameKeys(actual: string[], expected: readonly string[]) {
  return (
    actual.length === expected.length && expected.every((key) => actual.includes(key))
  );
}

function matches(map: Map<string, string>, required: Record<string, string>) {
  return Object.entries(required).every(([key, value]) => map.get(key) === value);
}

function sameCutoff(actual: StoryBinding["cutoff"], expected: StoryBinding["cutoff"]) {
  return (
    actual.observation_date === expected.observation_date &&
    actual.session_timezone === expected.session_timezone &&
    normalizedStoryTimestamp(actual.decision_at) ===
      normalizedStoryTimestamp(expected.decision_at) &&
    normalizedStoryTimestamp(actual.evaluated_at) ===
      normalizedStoryTimestamp(expected.evaluated_at)
  );
}

function matchesRun(
  run: StoryRun,
  role: StoryRole,
  binding: StoryBinding,
  expectedRunId?: string,
) {
  const method = storyMethods[role];
  const { descriptor, inputs, assumptions } = run;
  return (
    (expectedRunId === undefined || run.run_id === expectedRunId) &&
    descriptor.model_id === method.model &&
    descriptor.method_version === method.version &&
    descriptor.reference_version === method.version &&
    descriptor.input_schema_id === `${method.model}.inputs` &&
    inputs.schema_id === descriptor.input_schema_id &&
    sameCutoff(inputs.cutoff, binding.cutoff) &&
    binding.selection.observation_date === binding.cutoff.observation_date &&
    assumptions.effective_date <= binding.selection.observation_date &&
    normalizedStoryTimestamp(binding.cutoff.evaluated_at) >=
      normalizedStoryTimestamp(binding.cutoff.decision_at) &&
    sameKeys(
      run.outputs.map(({ output_id }) => output_id),
      Object.keys(method.outputUnits),
    ) &&
    sameKeys(
      inputs.tables.map(({ table_id }) => table_id),
      method.tables,
    ) &&
    unique(inputs.tables.flatMap(({ rows }) => rows.map(({ record_id }) => record_id)))
  );
}

function resolveLegReceipt(
  inputs: StoryRun["inputs"],
  query: Map<string, string>,
  side: StorySide,
): StoryLegReceipt | undefined {
  const failure = query.get(side + "_error");
  const stamp = query.get(side + "_retrieved_at");
  if (failure !== undefined) {
    const error = legFailure.safeParse(failure);
    const table = inputs.tables.find(({ table_id }) => table_id === side + "_closes");
    if (stamp === undefined && error.success && table?.rows.length === 0)
      return { failure: error.data };
    return undefined;
  }
  if (stamp && timestamp.safeParse(stamp).success) return { retrievedAt: stamp };
  return undefined;
}

function comparisonReceipts(inputs: StoryRun["inputs"], query: Map<string, string>) {
  const left = resolveLegReceipt(inputs, query, "left");
  const right = resolveLegReceipt(inputs, query, "right");
  if (!left || !right) return undefined;
  const latest = [left.retrievedAt, right.retrievedAt]
    .filter((stamp): stamp is string => stamp !== undefined)
    .map(normalizedStoryTimestamp)
    .sort()
    .at(-1);
  if (latest !== normalizedStoryTimestamp(inputs.provenance.retrieved_at))
    return undefined;
  return { left, right };
}

export function decodeStoryRun(
  payload: unknown,
  role: StoryRole,
  expected: StoryBinding,
  expectedRunId?: string,
): BoundStoryRun | undefined {
  const decoded = storyRun.safeParse(payload);
  const binding = storyBinding.safeParse(expected);
  if (
    !decoded.success ||
    !binding.success ||
    !matchesRun(decoded.data, role, binding.data, expectedRunId)
  )
    return undefined;
  const run = decoded.data;
  const { selection, schedule } = binding.data;
  const method = storyMethods[role];
  const query = new Map(
    run.inputs.provenance.query.map(([key, value]) => [key, value] as const),
  );
  const assumptions = new Map(
    run.assumptions.assumptions.map(({ assumption_id, value }) => [
      assumption_id,
      value,
    ]),
  );
  const parameters =
    role === "comparison"
      ? {
          ...schedule,
          left_proxy: selection.commodity_symbol,
          right_proxy: selection.technology_symbol,
        }
      : schedule;
  const required =
    role === "comparison"
      ? {
          ...parameters,
          left_calendar: schedule.calendar_id,
          right_calendar: schedule.calendar_id,
          price_basis: storyPriceBasis,
          leg_methods: "etf_momentum@1, etf_realized_volatility@1",
        }
      : parameters;
  if (
    run.inputs.provenance.source !== method.source ||
    query.size !== run.inputs.provenance.query.length ||
    assumptions.size !== run.assumptions.assumptions.length ||
    assumptions.size !== Object.keys(required).length ||
    !matches(query, { ...parameters, dataset_id: method.dataset }) ||
    !matches(assumptions, required)
  )
    return undefined;
  if (role === "regime") return { run, role, binding: binding.data };
  const legReceipts = comparisonReceipts(run.inputs, query);
  if (legReceipts) return { run, role, binding: binding.data, legReceipts };
  return undefined;
}
