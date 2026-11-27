import { currentSessionFetch } from "../api";
import { projectCalendar, type CalendarProjection } from "./calendar";
import {
  canReadEventsDocuments,
  createEventsDocumentsReader,
  eventsDocumentsBindings,
  type EventsDocumentsAccess,
  type Failure,
  type KnownEvidence,
  type Read,
  type Receipt,
  type Scope,
} from "./reader";
import {
  normalizeListingSymbol,
  validateListingSymbol,
  validateSelection,
  type ChartDisplay,
  type ChartMeasure,
  type Choices,
  type SelectionIssue,
  type Slot,
} from "./selection";

export type SlotState<E, K extends Slot> =
  | { status: "idle" }
  | { status: "invalid"; issue: SelectionIssue }
  | { status: "pending"; scope: Scope<K> }
  | Receipt<E, K>;

export type ControlsProps = {
  choices: Choices;
  issues: Partial<Record<Slot | "symbol", SelectionIssue>>;
  onApplySymbol(symbol: string): void;
  onApplyBounds<K extends Slot>(slot: K, bounds: Choices[K]): void;
  onChartDisplayChange(measure: ChartMeasure, display: ChartDisplay): void;
};

export type Controller<E> = {
  controls: ControlsProps;
  slots: { [K in Slot]: SlotState<E, K> };
  onRetry(slot: Slot): void;
};

export type EventsDocumentsSnapshot = Controller<KnownEvidence> & {
  calendar?: CalendarProjection;
};

export type EventsDocumentsController = {
  getSnapshot(): EventsDocumentsSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  syncAccess(): void;
};

type Authorization = {
  id: string;
  url: string;
  isCurrent(): boolean;
};

function authorize(access: EventsDocumentsAccess, slot: Slot): Authorization | undefined {
  try {
    const source = access.getSource();
    const session = currentSessionFetch();
    if (!source || !session) return;
    const scopedAccess: EventsDocumentsAccess = {
      getSource: () => source,
      hasDashboardAccess: () => access.hasDashboardAccess(),
      hasSourceAccess: (id) => access.hasSourceAccess(id),
      hasWidgetAccess: (id, widget) => access.hasWidgetAccess(id, widget),
    };
    if (canReadEventsDocuments(scopedAccess, slot) && session.isCurrent()) {
      return { id: source.id, url: source.url, isCurrent: session.isCurrent };
    }
  } catch {
    return undefined;
  }
}

function sameAuthorization(captured?: Authorization, current?: Authorization): boolean {
  if (!captured || !current) return captured === current;
  return captured.id === current.id && captured.url === current.url && captured.isCurrent();
}

function failure<K extends Slot>(scope: Scope<K>, code: "permission_denied" | "invalid_evidence" | "transport"): Failure<K> {
  return { status: "failure", scope, code, httpStatus: null, retryable: code === "transport" };
}

function queryKey(scope: Scope): string {
  const parameters = Object.entries(scope.query.parameters).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([scope.provider, scope.dataset, scope.route, scope.query.slot, parameters]);
}

type Environment = {
  access: EventsDocumentsAccess;
  read: Read<KnownEvidence>;
  syncAccess(): void;
  publish(): void;
};

class Acquisition<K extends Slot> {
  state: SlotState<KnownEvidence, K> = { status: "idle" };
  private generation = 0;
  private key?: string;
  private authorization?: Authorization;
  private request?: AbortController;

  constructor(private slot: K) {}

  private clear() {
    this.generation++;
    this.key = undefined;
    this.authorization = undefined;
    this.request?.abort();
    this.request = undefined;
  }

  stop() {
    this.clear();
    this.state = { status: "idle" };
  }

  private invalidate(issue: SelectionIssue) {
    if (this.state.status === "invalid" &&
        this.state.issue.field === issue.field && this.state.issue.bounds === issue.bounds) return;
    this.clear();
    this.state = { status: "invalid", issue };
  }

  prepare(choices: Choices, environment: Environment, retry: boolean) {
    const { dataset, route, queryPolicy } = eventsDocumentsBindings[this.slot];
    const result = validateSelection(this.slot, choices, { ...queryPolicy, required: [...queryPolicy.required] });
    if (!result.valid) return this.invalidate(result.issue);

    const scope: Scope<K> = {
      provider: "fmp", dataset, route, query: result.query, generation: this.generation + 1,
    };
    const key = queryKey(scope);
    const authorization = authorize(environment.access, this.slot);
    if ((!retry || !authorization) && key === this.key && sameAuthorization(this.authorization, authorization)) return;

    this.clear();
    this.key = key;
    this.authorization = authorization;
    if (!authorization) {
      this.state = failure(scope, "permission_denied");
      return;
    }

    const request = new AbortController();
    this.request = request;
    this.state = { status: "pending", scope };
    return () => this.acquire(scope, key, request, authorization, environment);
  }

  private async acquire(scope: Scope<K>, key: string, request: AbortController, authorization: Authorization, environment: Environment) {
    if (!this.isCurrent(request, authorization, environment)) return;
    let receipt: SlotState<KnownEvidence, K>;
    try {
      const result = await environment.read(scope, request.signal);
      receipt = result.scope.generation === scope.generation && queryKey(result.scope) === key
        ? result
        : failure(scope, "invalid_evidence");
    } catch {
      receipt = failure(scope, "transport");
    }
    if (!this.isCurrent(request, authorization, environment)) return;
    this.request = undefined;
    this.state = receipt;
    environment.publish();
  }

  private isCurrent(request: AbortController, authorization: Authorization, environment: Environment): boolean {
    if (this.request !== request) return false;
    if (sameAuthorization(authorization, authorize(environment.access, this.slot))) return true;
    environment.syncAccess();
    return false;
  }
}

function slotStates(acquisitions: Acquisitions): EventsDocumentsSnapshot["slots"] {
  return {
    calendar: acquisitions.calendar.state,
    filings: acquisitions.filings.state,
    transcript: acquisitions.transcript.state,
    news: acquisitions.news.state,
  };
}

type Acquisitions = { [K in Slot]: Acquisition<K> };

function sameSlots(a: EventsDocumentsSnapshot["slots"], b: EventsDocumentsSnapshot["slots"]) {
  return a.calendar === b.calendar && a.filings === b.filings && a.transcript === b.transcript && a.news === b.news;
}

function calendarFor(slots: EventsDocumentsSnapshot["slots"], symbol: string, previous?: CalendarProjection) {
  const receipt = slots.calendar;
  if (receipt.status !== "success" && receipt.status !== "empty") return;
  if (receipt === previous?.receipt && previous.symbol === symbol) return previous;
  return projectCalendar(receipt, symbol);
}

function copyChoices(choices: Choices): Choices {
  return {
    ...choices,
    calendar: { ...choices.calendar },
    filings: { ...choices.filings },
    transcript: { ...choices.transcript },
    news: { ...choices.news },
    charts: { ...choices.charts },
  };
}

class ControllerStore {
  private choices: Choices;
  private symbolIssue?: SelectionIssue;
  private active = false;
  private listeners = new Set<() => void>();
  private acquisitions: Acquisitions = {
    calendar: new Acquisition("calendar"),
    filings: new Acquisition("filings"),
    transcript: new Acquisition("transcript"),
    news: new Acquisition("news"),
  };
  private snapshot: EventsDocumentsSnapshot;
  private environment: Environment;

  constructor(initialChoices: Choices, access: EventsDocumentsAccess, read: Read<KnownEvidence>) {
    this.choices = copyChoices(initialChoices);
    this.choices.symbol = normalizeListingSymbol(this.choices.symbol) ?? this.choices.symbol;
    this.snapshot = this.makeSnapshot(slotStates(this.acquisitions));
    this.environment = { access, read, syncAccess: this.syncAccess, publish: this.publish };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  start = () => {
    if (this.active) return;
    this.active = true;
    // A synchronous React setup/cleanup replay can invalidate the prepared requests before they send.
    this.reconcile(undefined, true);
  };

  stop = () => {
    if (!this.active) return;
    this.active = false;
    for (const acquisition of Object.values(this.acquisitions)) acquisition.stop();
    this.publish();
  };

  syncAccess = () => this.reconcile();

  private applySymbol = (symbol: string) => {
    const normalized = normalizeListingSymbol(symbol);
    if (normalized === undefined) {
      this.symbolIssue ??= validateListingSymbol(symbol);
      this.reconcile();
      return;
    }
    this.symbolIssue = undefined;
    if (normalized !== this.choices.symbol) this.choices = { ...this.choices, symbol: normalized };
    this.reconcile();
  };

  private applyBounds = <K extends Slot>(slot: K, bounds: Choices[K]) => {
    if (!Object.hasOwn(this.acquisitions, slot)) return;
    const current = this.choices[slot];
    const next = { ...bounds };
    const fields = Object.keys(next) as (keyof Choices[K])[];
    if (Object.keys(current).length !== fields.length ||
        fields.some((field) => !Object.hasOwn(current, field) || !Object.is(current[field], next[field]))) {
      this.choices = { ...this.choices, [slot]: next };
    }
    this.reconcile();
  };

  private applyChart = (measure: ChartMeasure, display: ChartDisplay) => {
    if (!Object.hasOwn(this.choices.charts, measure) || (display !== "bar" && display !== "point")) return;
    if (display !== this.choices.charts[measure]) {
      this.choices = { ...this.choices, charts: { ...this.choices.charts, [measure]: display } };
    }
    this.reconcile();
  };

  private retry = (slot: Slot) => {
    if (this.acquisitions[slot]?.state.status === "failure") this.reconcile(slot);
  };

  private reconcile(retry?: Slot, defer = false) {
    if (!this.active) return;
    const { calendar, filings, transcript, news } = this.acquisitions;
    const requests = [
      calendar.prepare(this.choices, this.environment, retry === "calendar"),
      filings.prepare(this.choices, this.environment, retry === "filings"),
      transcript.prepare(this.choices, this.environment, retry === "transcript"),
      news.prepare(this.choices, this.environment, retry === "news"),
    ];
    this.publish();
    for (const send of requests) {
      if (!send) continue;
      if (defer) queueMicrotask(send);
      else void send();
    }
  }

  private publish = () => {
    const slots = slotStates(this.acquisitions);
    if (this.snapshot.controls.choices === this.choices &&
        this.snapshot.controls.issues.symbol === this.symbolIssue && sameSlots(this.snapshot.slots, slots)) return;
    this.snapshot = this.makeSnapshot(slots, this.snapshot.calendar);
    for (const listener of this.listeners) listener();
  };

  private makeSnapshot(slots: EventsDocumentsSnapshot["slots"], previous?: CalendarProjection): EventsDocumentsSnapshot {
    const issues: ControlsProps["issues"] = {};
    if (this.symbolIssue) issues.symbol = this.symbolIssue;
    for (const slot of Object.keys(slots) as Slot[]) {
      const state = slots[slot];
      if (state.status === "invalid") issues[slot] = state.issue;
    }
    return {
      controls: {
        choices: this.choices, issues,
        onApplySymbol: this.applySymbol,
        onApplyBounds: this.applyBounds,
        onChartDisplayChange: this.applyChart,
      },
      slots,
      onRetry: this.retry,
      calendar: calendarFor(slots, this.choices.symbol, previous),
    };
  }
}

/** Subscribe to Workspace access stores before start and call syncAccess synchronously on changes. */
export function createEventsDocumentsController(
  choices: Choices,
  access: EventsDocumentsAccess,
  read = createEventsDocumentsReader(access),
): EventsDocumentsController {
  return new ControllerStore(choices, access, read);
}
