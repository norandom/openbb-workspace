import {
  exactDecimalSign,
  normalizedStoryTimestamp,
  storyPriceBasis,
  storySides,
  type BoundStoryRun,
  type StoryRow,
  type StorySide,
  type StoryTrace,
} from "./storyContract";

export type StoryRecord = StoryRow & { table_id: string };

export function storyRecords(bound: BoundStoryRun) {
  return new Map(
    bound.run.inputs.tables.flatMap(({ table_id, rows }) =>
      rows.map((row) => [row.record_id, { ...row, table_id }] as const),
    ),
  );
}

const windowSize = 64;

export function storyWindow(bound: BoundStoryRun) {
  const { schedule, selection } = bound.binding;
  const rows =
    bound.run.inputs.tables.find(({ table_id }) => table_id === "sessions")?.rows ?? [];
  const dates = rows.map(({ observation_date }) => observation_date).sort();
  if (
    dates.length !== windowSize ||
    new Set(dates).size !== windowSize ||
    dates.at(-1) !== selection.observation_date ||
    rows.some(
      (row) =>
        row.entity_id !== schedule.calendar_id ||
        row.metric_id !== "session" ||
        row.value !== "1" ||
        row.context.unit !== "session" ||
        row.category === "estimate",
    )
  )
    return undefined;
  return {
    start: dates[0],
    end: selection.observation_date,
    observationCount: dates.length,
    dates,
  };
}

function traceRows(
  trace: StoryTrace,
  records: Map<string, StoryRecord>,
  inputIds: string[],
) {
  const rows: StoryRecord[] = [];
  if (
    new Set(trace.source_record_ids).size !== trace.source_record_ids.length ||
    trace.input_ids.length !== inputIds.length ||
    !inputIds.every((id) => trace.input_ids.includes(id))
  ) {
    return undefined;
  }
  for (const id of trace.source_record_ids) {
    const row = records.get(id);
    if (!row || !inputIds.includes(row.table_id)) return undefined;
    rows.push(row);
  }
  return rows.sort((left, right) =>
    left.observation_date.localeCompare(right.observation_date),
  );
}

export function isStoryPriceRow(row: StoryRow, symbol: string) {
  return (
    row.entity_id === symbol &&
    row.metric_id === "close" &&
    row.category === "provider" &&
    row.value !== null &&
    exactDecimalSign(row.value) === 1 &&
    row.source_record_id !== null &&
    row.context.unit === "price" &&
    row.context.basis === storyPriceBasis &&
    row.context.currency === "USD" &&
    row.context.scale === 0 &&
    row.context.vintage_coverage === "unknown" &&
    row.published_at === null &&
    row.vintage_at === null
  );
}

export function isStoryMacroEndpoint(row: StoryRow, cutoff: string) {
  return (
    row.entity_id === "DFII10" &&
    row.metric_id === "real_yield" &&
    row.category !== "estimate" &&
    row.value !== null &&
    exactDecimalSign(row.value) !== undefined &&
    row.context.unit === "percent" &&
    row.context.quantity === "rate" &&
    row.context.basis === "treasury_constant_maturity" &&
    row.context.currency === null &&
    row.context.scale === 0 &&
    row.context.vintage_coverage === "known" &&
    row.published_at !== null &&
    normalizedStoryTimestamp(row.published_at) <= cutoff &&
    (row.vintage_at === null || normalizedStoryTimestamp(row.vintage_at) <= cutoff)
  );
}

function datesMatch(rows: StoryRow[], dates: string[]) {
  return (
    rows.length === dates.length &&
    rows.every((row, index) => row.observation_date === dates[index])
  );
}

function traceReceipts(
  trace: StoryTrace,
  bound: BoundStoryRun,
  sides: readonly StorySide[],
) {
  return (
    trace.transformations.length === sides.length &&
    sides.every((side, index) => {
      const stamp = bound.legReceipts?.[side].retrievedAt;
      const receipt = trace.transformations[index];
      if (
        !stamp ||
        receipt.transformation_id !== side + ".retrieved_history" ||
        receipt.version !== "2"
      )
        return false;
      const receiptStamp = receipt.description.match(
        /retrieved at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00))(?=\.\s|\s|$)/u,
      )?.[1];
      return (
        receiptStamp !== undefined &&
        normalizedStoryTimestamp(receiptStamp) === normalizedStoryTimestamp(stamp)
      );
    })
  );
}

function macroTrace(
  trace: StoryTrace,
  rows: StoryRecord[],
  bound: BoundStoryRun,
  window: NonNullable<ReturnType<typeof storyWindow>>,
) {
  const cutoff = normalizedStoryTimestamp(bound.binding.cutoff.decision_at);
  const endpoints = rows.filter(({ table_id }) => table_id === "dfii10");
  if (
    !datesMatch(endpoints, [window.start, window.end]) ||
    trace.substitutions.length !== endpoints.length
  )
    return false;
  return endpoints.every((row, index) => {
    const cited = trace.substitutions[index];
    return (
      isStoryMacroEndpoint(row, cutoff) &&
      cited.name === row.record_id &&
      cited.period_end === row.observation_date &&
      cited.value === row.value &&
      cited.unit === "percent" &&
      cited.scale === 0 &&
      cited.currency === null
    );
  });
}

export function traceEvidence(
  trace: StoryTrace,
  bound: BoundStoryRun,
  records: Map<string, StoryRecord>,
) {
  const window = storyWindow(bound);
  if (!window) return undefined;
  const [side, metric] = trace.output_id.split("_");
  const sides =
    metric === "spread" ? storySides : storySides.filter((leg) => side === leg);
  const requiredTables =
    bound.role === "regime" ? ["dfii10"] : sides.map((leg) => leg + "_closes");
  const rows = traceRows(trace, records, ["sessions", ...requiredTables]);
  if (
    !rows ||
    !datesMatch(
      rows.filter(({ table_id }) => table_id === "sessions"),
      window.dates,
    )
  )
    return undefined;
  if (bound.role === "regime")
    return macroTrace(trace, rows, bound, window) ? { rows, returns: [] } : undefined;
  if (!traceReceipts(trace, bound, sides)) return undefined;
  for (const leg of sides) {
    const closes = rows.filter(({ table_id }) => table_id === leg + "_closes");
    const symbol =
      leg === "left"
        ? bound.binding.selection.commodity_symbol
        : bound.binding.selection.technology_symbol;
    if (
      !datesMatch(closes, window.dates) ||
      !closes.every((row) => isStoryPriceRow(row, symbol))
    )
      return undefined;
  }
  // A volatility spread joins both legs' rows. The dated returns belong to each leg's volatility trace.
  const returns = trace.intermediate_values.filter(({ name }) =>
    name.startsWith("simple_return."),
  );
  if (
    metric === "volatility" &&
    (returns.length !== windowSize - 1 ||
      !returns.every(
        (value, index) =>
          value.period_start === window.dates[index] &&
          value.period_end === window.dates[index + 1] &&
          value.name === "simple_return." + value.period_end &&
          value.unit === "ratio" &&
          value.currency === null &&
          value.scale === 0 &&
          exactDecimalSign(value.value) !== undefined,
      ))
  )
    return undefined;
  return { rows, returns };
}
