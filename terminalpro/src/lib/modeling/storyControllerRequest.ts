import {
  normalizedStoryTimestamp,
  storyMethods,
  storyPriceBasis,
  type StoryBinding,
  type StoryRole,
} from "./storyContract";
import {
  decodeStoryState,
  type StorySchedule,
  type StorySelection,
  type StoryState,
} from "./storyState";

export type StorySelectionInputs = {
  schedule: StorySchedule;
  evaluatedAt: string;
};

const listingZone = "America/New_York";
const listingOffset = new Intl.DateTimeFormat("en-US", {
  timeZone: listingZone,
  timeZoneName: "longOffset",
});

function endOfObservationDay(day: string) {
  const nextMidnight = Date.parse(day + "T00:00:00Z") + 86_400_000;
  const offset = listingOffset
    .formatToParts(nextMidnight)
    .find(({ type }) => type === "timeZoneName")?.value;
  // New York's clock changes in the morning, so midnight UTC and midnight local
  // at the end of this observation day share the same offset.
  const end = Date.parse(day + "T23:59:59" + offset?.slice(3));
  return new Date(end).toISOString().replace(".000Z", ".999999Z");
}

export function prepareStorySelection(
  saved: StoryState,
  selection: StorySelection,
  inputs: StorySelectionInputs,
) {
  const next = decodeStoryState({
    ...saved,
    selection,
    schedule: inputs.schedule,
    cutoff: {
      observation_date: selection.observation_date,
      decision_at: inputs.evaluatedAt,
      evaluated_at: inputs.evaluatedAt,
      session_timezone: listingZone,
    },
    run_refs: { comparison: null, regime: null },
  });
  if (!next?.cutoff)
    throw new Error("Invalid research story selection or evaluation time.");
  const decisionAt = endOfObservationDay(next.selection.observation_date);
  if (normalizedStoryTimestamp(next.cutoff.evaluated_at) < decisionAt) {
    throw new Error("Select a completed observation day in New York.");
  }
  return { ...next, cutoff: { ...next.cutoff, decision_at: decisionAt } };
}

export function encodeStoryEvaluation(role: StoryRole, binding: StoryBinding) {
  const { selection, schedule, cutoff } = binding;
  const method = storyMethods[role];
  const parameters =
    role === "comparison"
      ? {
          left_proxy: selection.commodity_symbol,
          right_proxy: selection.technology_symbol,
          ...schedule,
        }
      : schedule;
  const assumptions =
    role === "comparison"
      ? {
          ...parameters,
          left_calendar: schedule.calendar_id,
          right_calendar: schedule.calendar_id,
          price_basis: storyPriceBasis,
          leg_methods: "etf_momentum@1, etf_realized_volatility@1",
        }
      : parameters;
  return JSON.stringify({
    model_id: method.model,
    method_version: method.version,
    assumptions: {
      version: "1",
      effective_date: selection.observation_date,
      assumptions: Object.entries(assumptions).map(
        ([assumption_id, value]) => ({
          assumption_id,
          value_type: "text",
          value,
          origin: "method_default",
          rationale: "Research story method and frozen selection binding.",
        }),
      ),
    },
    acquisition: {
      dataset_id: method.dataset,
      parameters: Object.entries(parameters),
      cutoff,
    },
  });
}
