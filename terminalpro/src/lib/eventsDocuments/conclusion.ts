import { projectCalendar, type CalendarProjection, type CalendarRow } from "./calendar";
import type { EventsDocumentsSnapshot } from "./controller";
import { projectDocuments, type DocumentProjection } from "./evidence";
import type { Failure, KnownEvidence, Scope } from "./reader";
import type { SelectionIssue, Slot } from "./selection";

type ConclusionSource = {
  scope: Scope;
  httpStatus?: number | null;
  providerRetrievedAt?: string | null;
  respondedAt?: string;
  effectiveQuery?: KnownEvidence["metadata"]["value"]["effective_query"];
  bounds?: KnownEvidence["metadata"]["value"]["bounds"];
};

type DocumentCitation = {
  ordinal: number;
  generation: number;
  field: "filing_date" | "content" | "title";
  date: string;
  title?: string;
  contentStatus: DocumentProjection["items"][number]["content_status"];
};

type InputCondition = "available" | "empty" | "idle" | "invalid" | "pending" | "failure" |
  NonNullable<CalendarProjection["reason"]>;

export type ConclusionInput = {
  condition: InputCondition;
  usable: boolean;
  source?: ConclusionSource;
  coverage?: "unknown";
  clipped: boolean;
  marketCount?: number;
  calendarRows: readonly CalendarRow[];
  documents: readonly DocumentCitation[];
  failure?: Failure;
  issue?: SelectionIssue;
};

export type EventsDocumentsConclusion = {
  status: "Evidence available" | "Partial evidence" | "Pending" | "Insufficient evidence";
  usableCount: number;
  inputs: Record<Slot, ConclusionInput>;
};

type CurrentState = EventsDocumentsSnapshot["slots"][Slot];

function sourceFor(state: Exclude<CurrentState, { status: "idle" | "invalid" }>): ConclusionSource {
  const { scope } = state;
  if (state.status === "pending") return { scope };
  const { httpStatus } = state;
  if (state.status === "failure") return { scope, httpStatus };
  const { providerRetrievedAt } = state;
  if (httpStatus === 204) return { scope, httpStatus, providerRetrievedAt, respondedAt: state.respondedAt };
  const { bounds, effective_query: effectiveQuery } = state.evidence.metadata.value;
  return { scope, httpStatus, providerRetrievedAt, bounds, effectiveQuery };
}

function inputSummary(condition: InputCondition): ConclusionInput {
  return { condition, usable: condition === "available", clipped: false, calendarRows: [], documents: [] };
}

function unresolvedInput(state: Exclude<CurrentState, { status: "success" | "empty" }>): ConclusionInput {
  const summary = inputSummary(state.status);
  switch (state.status) {
    case "idle": return summary;
    case "invalid": return { ...summary, issue: state.issue };
    case "pending": return { ...summary, source: sourceFor(state) };
    case "failure": return { ...summary, source: sourceFor(state), failure: state };
  }
}

function calendarInput(snapshot: EventsDocumentsSnapshot): ConclusionInput {
  const state = snapshot.slots.calendar;
  if (!("providerRetrievedAt" in state)) return unresolvedInput(state);
  const { symbol } = snapshot.controls.choices;
  const current = snapshot.calendar;
  // The market receipt can outlive a listing selection. Reuse only a projection for both current inputs.
  const projection = current?.receipt === state && current.symbol === symbol ? current : projectCalendar(state, symbol);
  return {
    ...inputSummary(projection.reason ?? "available"),
    source: sourceFor(state), coverage: projection.coverage, clipped: projection.clipped,
    marketCount: projection.marketCount, calendarRows: projection.rows,
  };
}

function citeDocument(item: DocumentProjection["items"][number]): DocumentCitation {
  const { ordinal, generation, content_status: contentStatus } = item;
  if ("filing_date" in item) {
    return { ordinal, generation, contentStatus, field: "filing_date", date: item.filing_date, title: item.report_type ?? undefined };
  }
  if ("content" in item) {
    return { ordinal, generation, contentStatus, field: "content", date: item.date };
  }
  return { ordinal, generation, contentStatus, field: "title", date: item.date, title: item.title };
}

type DocumentSlot = Exclude<Slot, "calendar">;

function documentInput(state: EventsDocumentsSnapshot["slots"][DocumentSlot]): ConclusionInput {
  if (!("providerRetrievedAt" in state)) return unresolvedInput(state);
  const projection = projectDocuments<DocumentSlot>(state);
  const documents = projection.items.map(citeDocument);
  return {
    ...inputSummary(documents.length ? "available" : "empty"),
    source: sourceFor(state), coverage: projection.coverage, clipped: projection.clipped, documents,
  };
}

export function deriveConclusion(snapshot: EventsDocumentsSnapshot): EventsDocumentsConclusion {
  const { slots } = snapshot;
  const inputs = {
    calendar: calendarInput(snapshot),
    filings: documentInput(slots.filings),
    transcript: documentInput(slots.transcript),
    news: documentInput(slots.news),
  };
  const summaries = Object.values(inputs);
  const usableCount = summaries.filter(({ usable }) => usable).length;
  if (usableCount === summaries.length) return { status: "Evidence available", usableCount, inputs };
  if (usableCount) return { status: "Partial evidence", usableCount, inputs };
  const pending = summaries.some(({ condition }) => condition === "pending");
  return { status: pending ? "Pending" : "Insufficient evidence", usableCount, inputs };
}
