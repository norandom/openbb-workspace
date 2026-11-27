type Parameter = {
  type?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  anyOf?: { type?: string; format?: string }[];
};
export type FinancialWidgetPolicy = {
  queryPolicy?: FinancialQueryPolicy & { maxRequests?: number };
  data?: { financialQueryPolicy?: FinancialQueryPolicy & { maxRequests?: number } };
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};
export type FinancialQueryPolicy = {
  parameters: Record<string, Parameter>;
  required: string[];
  dateWindow?: { mode: string; maxInclusiveDays?: number } | null;
};

function validateParameter(name: string, value: string | number, schema: Parameter) {
  if (schema.type === "integer") {
    if (typeof value !== "number" && typeof value !== "string")
      throw new Error(`${name} must be an integer.`);
    if (typeof value === "string" && !/^-?\d+$/.test(value))
      throw new Error(`${name} must be an integer.`);
    const number = Number(value);
    if (
      !Number.isSafeInteger(number) ||
      number < (schema.minimum ?? Number.NEGATIVE_INFINITY) ||
      number > (schema.maximum ?? Number.POSITIVE_INFINITY)
    )
      throw new Error(`${name} is outside its allowed integer range.`);
    return number;
  }
  if (
    name === "symbol" &&
    (typeof value !== "string" ||
      !value ||
      /[\s,]/.test(value) ||
      value.length > (schema.maxLength ?? 50))
  )
    throw new Error("Choose exactly one company symbol.");
  if (name.endsWith("_date")) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new Error("Choose a valid calendar date.");
  }
  return value;
}

function dateWindow(
  params: Record<string, string | number>,
  policy: FinancialQueryPolicy,
) {
  const rule = policy.dateWindow;
  if (!rule) return;
  const start = params.start_date;
  const end = params.end_date;
  if (
    (rule.mode === "required_pair" && (!start || !end)) ||
    (rule.mode === "optional_pair" && Boolean(start) !== Boolean(end))
  )
    throw new Error("Supply both start and end dates.");
  if (start && end) {
    const days = (Date.parse(String(end)) - Date.parse(String(start))) / 86400000 + 1;
    if (days < 1 || days > (rule.maxInclusiveDays ?? Number.POSITIVE_INFINITY))
      throw new Error("Choose an ordered date window within the dataset limit.");
  }
}

export function validateFinancialQuery(
  params: Record<string, string | number>,
  policy: FinancialQueryPolicy,
) {
  if (params.provider !== "fmp") throw new Error("This dataset requires provider FMP.");
  for (const name of Object.keys(params)) {
    if (
      name !== "provider" &&
      !(name in policy.parameters) &&
      params[name] != null &&
      params[name] !== ""
    )
      throw new Error("Unknown financial query parameter.");
  }
  for (const name of policy.required)
    if (params[name] === undefined || params[name] === null || params[name] === "")
      throw new Error(`Supply ${name}.`);
  for (const [name, schema] of Object.entries(policy.parameters)) {
    if (params[name] !== undefined && params[name] !== null && params[name] !== "")
      validateParameter(name, params[name], schema);
  }
  dateWindow(params, policy);
}

export function financialWidgetPolicy(widget: unknown): FinancialWidgetPolicy {
  const value = (widget ?? {}) as FinancialWidgetPolicy;
  const queryPolicy = value.queryPolicy ?? value.data?.financialQueryPolicy;
  return {
    ...value,
    queryPolicy,
    ...(queryPolicy?.maxRequests === 1 && {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  };
}
