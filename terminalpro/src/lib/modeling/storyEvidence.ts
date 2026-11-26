import {
  compareStoryDecimals,
  exactDecimalSign,
  normalizedStoryTimestamp,
  storyMethods,
  storySides,
  type BoundStoryRun,
  type StoryCheck,
  type StoryOutput,
  type StoryTrace,
  type StoryTraceValue,
  type StoryVerification,
} from "./storyContract";
import {
  isStoryMacroEndpoint,
  storyRecords,
  storyWindow,
  traceEvidence,
  type StoryRecord,
} from "./storyEvidenceRows";

export type StoryOutputEvidence = Omit<StoryOutput, "reason" | "value" | "status"> & {
  status: StoryOutput["status"];
  value: string | null;
  reason: string | null;
  checks: StoryCheck[];
  reference?: StoryVerification;
  traces: StoryTrace[];
  rows: StoryRecord[];
  dailyReturns: StoryTraceValue[];
};

function matchingReference(bound: BoundStoryRun, output: StoryOutput) {
  const references = bound.run.verification.filter(
    ({ output_id }) => output_id === output.output_id,
  );
  if (
    references.length === 1 &&
    references[0].reference_version === bound.run.descriptor.reference_version
  ) {
    return references[0];
  }
  return undefined;
}

function validChecks(bound: BoundStoryRun, output: StoryOutput, checks: StoryCheck[]) {
  const required = "eligible_inputs." + output.output_id;
  const outcomeIds = new Set(checks.map((check) => check.rule_id));
  return (
    output.check_ids.includes(required) &&
    outcomeIds.size === checks.length &&
    checks.length === output.check_ids.length &&
    output.check_ids.every((id) => outcomeIds.has(id)) &&
    new Set(output.check_ids).size === output.check_ids.length &&
    checks.every(
      (check) =>
        check.rule_version === bound.run.descriptor.method_version &&
        (check.status === "pass" ||
          (check.rule_id !== required && check.severity !== "blocking")),
    )
  );
}

function validResult(bound: BoundStoryRun, output: StoryOutput) {
  const units: Record<string, string> = storyMethods[bound.role].outputUnits;
  if (
    output.unit !== units[output.output_id] ||
    output.value === null ||
    output.exception_ids.length
  )
    return false;
  if (output.output_id === "regime") {
    return (
      output.value_type === "text" &&
      ["rising", "falling", "flat"].includes(output.value)
    );
  }
  const sign = exactDecimalSign(output.value);
  return (
    output.value_type === "decimal" &&
    sign !== undefined &&
    (!output.output_id.endsWith("_volatility") || sign >= 0)
  );
}

function outputEvidence(
  bound: BoundStoryRun,
  output: StoryOutput,
  records: Map<string, StoryRecord>,
): StoryOutputEvidence {
  const checks = bound.run.checks.filter(({ output_ids }) =>
    output_ids.includes(output.output_id),
  );
  const reference = matchingReference(bound, output);
  const traces = bound.run.trace.filter(
    ({ output_id }) => output_id === output.output_id,
  );
  const evidence = {
    ...output,
    value: output.value ?? null,
    reason: output.reason ?? null,
    checks,
    reference,
    traces: [],
    rows: [],
    dailyReturns: [],
  };
  const failure = checks.find(({ status }) => status !== "pass")?.explanation;
  if (output.status !== "verified") {
    return {
      ...evidence,
      value: null,
      reason: failure ?? output.reason ?? "The saved output was not verified.",
    };
  }
  const unavailable = (reason: string): StoryOutputEvidence => ({
    ...evidence,
    status: "unverified",
    value: null,
    reason,
  });
  if (!validResult(bound, output))
    return unavailable("The saved output has an invalid value or unit.");
  if (!validChecks(bound, output, checks))
    return unavailable(failure ?? "The saved output has no passing required check.");
  if (reference?.status !== "match") {
    return unavailable(
      reference?.explanation ?? "Independent reference verification is missing.",
    );
  }
  if (
    !traces.length ||
    traces.length !== output.trace_ids.length ||
    traces.some(
      (trace) =>
        output.trace_ids.filter((id) => id === trace.trace_id).length !== 1 ||
        bound.run.trace.filter(({ trace_id }) => trace_id === trace.trace_id).length !==
          1 ||
        trace.formula_version !== bound.run.descriptor.method_version ||
        !trace.check_ids.includes("eligible_inputs." + output.output_id) ||
        trace.check_ids.some((id) => !output.check_ids.includes(id)),
    )
  ) {
    return unavailable("The saved output has no matching calculation trace.");
  }
  const datasets = traces.map((trace) => traceEvidence(trace, bound, records));
  if (datasets.some((data) => !data))
    return unavailable(
      "The saved output has incomplete or inconsistent dated trace evidence.",
    );
  return {
    ...evidence,
    traces,
    rows: [
      ...new Map(
        datasets.flatMap((data) => data?.rows ?? []).map((row) => [row.record_id, row]),
      ).values(),
    ],
    dailyReturns: datasets.flatMap((data) => data?.returns ?? []),
  };
}

function priceSource(bound: BoundStoryRun) {
  if (!bound.legReceipts) return undefined;
  const legs = storySides.map((side) => {
    const symbol =
      side === "left"
        ? bound.binding.selection.commodity_symbol
        : bound.binding.selection.technology_symbol;
    const receipt = bound.legReceipts?.[side];
    const label = receipt?.retrievedAt
      ? symbol + " history retrieved " + receipt.retrievedAt.slice(0, 10)
      : null;
    return { side, symbol, ...receipt, label };
  });
  return {
    basis:
      "FMP history retrieved " + bound.run.inputs.provenance.retrieved_at.slice(0, 10),
    legs,
  };
}

export function projectStoryEvidence(bound: BoundStoryRun) {
  const records = storyRecords(bound);
  const window = storyWindow(bound);
  const outputs = Object.fromEntries(
    bound.run.outputs.map((output) => [
      output.output_id,
      outputEvidence(bound, output, records),
    ]),
  );
  const cutoff = normalizedStoryTimestamp(bound.binding.cutoff.decision_at);
  const macroEndpoints = new Set([window?.start, window?.end]);
  const availableMacroRows = [...records.values()].filter(
    (row) =>
      row.table_id === "dfii10" &&
      macroEndpoints.has(row.observation_date) &&
      isStoryMacroEndpoint(row, cutoff),
  );
  return {
    role: bound.role,
    runId: bound.run.run_id,
    createdAt: bound.run.created_at,
    selection: bound.binding.selection,
    schedule: bound.binding.schedule,
    cutoff: bound.binding.cutoff,
    window,
    outputs,
    availableMacroRows,
    source: bound.run.inputs.provenance,
    priceSource: priceSource(bound),
    freshness: "saved" as const,
  };
}

export type StoryEvidence = ReturnType<typeof projectStoryEvidence>;

export function storyVerdict(evidence?: StoryEvidence) {
  const spread = evidence?.outputs.momentum_spread;
  const sign =
    spread?.status === "verified" && spread.value !== null
      ? exactDecimalSign(spread.value)
      : undefined;
  if (sign === undefined) {
    return {
      verdict: "insufficient_data",
      reason:
        spread?.reason ??
        "A verified matched-window price-return spread is unavailable.",
    } as const;
  }
  const verdict =
    sign === 0 ? "tie" : sign > 0 ? "supported" : "technology_outperformance";
  const leftRisk = evidence?.outputs.left_volatility;
  const rightRisk = evidence?.outputs.right_volatility;
  const riskSign =
    leftRisk?.status === "verified" &&
    leftRisk.value !== null &&
    rightRisk?.status === "verified" &&
    rightRisk.value !== null &&
    compareStoryDecimals(leftRisk.value, rightRisk.value);
  return {
    verdict,
    spread: spread?.value,
    window: evidence?.window,
    selection: evidence?.selection,
    higherRiskWinner: sign !== 0 && riskSign === sign,
  } as const;
}
