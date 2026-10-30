import { useEffect, useRef, useState } from "react";
import { checkCompanyGroup } from "./companyGroupSafety";
import {
  type CommitResult,
  type CompanyContext,
  type CompanyRequestContext,
  type CompanySearchPort,
  type CompanySelectionV1,
  decodeListingChoice,
  decodeSelection,
  hasContradictoryListings,
  isSelectionValid,
  isSingleSymbol,
  type ListingChoice,
  resolveExactSymbol,
  type SearchMode,
  type SearchOutcome,
  type SearchState,
  type SelectionPorts,
} from "./companySelection.contract";
import { useCompanySearch } from "./useCompanySearch";

type Ready = Extract<SearchOutcome, { kind: "ready" }>;
export type CompanySelectionInput = Readonly<{
  source: CompanyRequestContext | null;
  context: CompanyContext;
  metadata: unknown;
  ports: SelectionPorts;
  searchPort?: CompanySearchPort;
}>;
type Session = {
  identity: string;
  kind: "idle" | "user" | "auto";
  initialState?: SearchState;
};
type Failure = {
  identity: string;
  metadataKey: string;
  reason: string;
  unresolved: boolean;
};

function blocked(reason: string): CommitResult {
  return { kind: "blocked", reason };
}
function selectionFor(choice: ListingChoice, result: Ready): CompanySelectionV1 | null {
  return decodeSelection({
    ...choice,
    version: 1,
    sourceKey: result.request.sourceKey,
    retrievedAt: result.retrievedAt,
    selectedAt: new Date().toISOString(),
  });
}

// The caller proves private request freshness; this port checks listing and context.
export function commitChoice(
  choice: ListingChoice,
  result: Ready,
  ports: SelectionPorts,
): CommitResult {
  let groupWritten = false;
  let localStarted = false;
  try {
    const context = ports.readContextNow();
    if (
      !result.rows.includes(choice) ||
      !decodeListingChoice(choice) ||
      result.request.sourceKey !== context.sourceKey ||
      hasContradictoryListings(result.rows, choice.symbol)
    ) {
      return blocked(
        "Choose an unambiguous listing from the current connected-source results.",
      );
    }
    const decision = checkCompanyGroup(context);
    if (decision.kind === "blocked") return decision;
    const selection = selectionFor(choice, result);
    if (!selection)
      return blocked("The selected listing metadata is invalid. Search again.");
    // An unchanged financial symbol only needs origin metadata persistence.
    if (decision.groupId !== null && context.symbol !== selection.symbol) {
      ports.writeBoundSymbol(decision.groupId, selection.symbol);
      groupWritten = true;
    }
    localStarted = true;
    ports.commitLocal(selection);
    return { kind: "applied", scope: groupWritten ? "symbol_group" : "widget" };
  } catch {
    if (groupWritten)
      return blocked(
        "The Symbol group was updated, but the local company metadata could not be saved. Refresh this widget.",
      );
    return blocked(
      localStarted
        ? "The local company selection could not be saved. Refresh this widget."
        : "The Symbol group or current context could not be updated. Refresh before selecting again.",
    );
  }
}

function contextIdentity(context: CompanyContext): string {
  return JSON.stringify([
    context.widgetUuid,
    context.dashboardId,
    context.sourceKey,
    context.provider,
    context.symbol,
    context.immediate,
    context.isPreview,
    context.dashboardMember,
  ]);
}

function canResolve(input: CompanySelectionInput): boolean {
  return (
    input.source?.sourceKey === input.context.sourceKey &&
    input.context.provider === "fmp" &&
    input.context.immediate &&
    isSingleSymbol(input.context.symbol)
  );
}

export function useCompanySelection(input: CompanySelectionInput) {
  const { source, context, metadata, ports, searchPort } = input;
  const remote = useCompanySearch(source, searchPort);
  const identity = contextIdentity(context);
  const latest = useRef(input);
  latest.current = input;
  const session = useRef<Session>({ identity, kind: "idle" });
  const attempts = useRef(new Map<string, "attempted" | "resolved">());
  const [failure, setFailure] = useState<Failure | null>(null);
  const decoded = decodeSelection(metadata);
  const metadataKey = JSON.stringify(decoded);
  const activeFailure =
    failure?.identity === identity && failure.metadataKey === metadataKey
      ? failure
      : null;
  const selection =
    !activeFailure?.unresolved &&
    source?.sourceKey === context.sourceKey &&
    isSelectionValid(decoded, context)
      ? decoded
      : null;

  function fail(reason: string, unresolved = false) {
    setFailure((previous) => ({
      identity,
      metadataKey,
      reason,
      unresolved:
        unresolved ||
        (previous?.identity === identity &&
          previous.metadataKey === metadataKey &&
          previous.unresolved),
    }));
  }
  function search(mode: SearchMode, query: string) {
    session.current = { identity, kind: "user" };
    if (!activeFailure?.unresolved) setFailure(null);
    remote.search(mode, query);
  }
  function cancel() {
    session.current = { identity, kind: "idle" };
    attempts.current.set(identity, "attempted");
    remote.cancel();
  }
  function choose(choice: ListingChoice): CommitResult {
    const state = remote.state;
    if (
      session.current.identity !== identity ||
      session.current.kind !== "user" ||
      state.kind !== "ready" ||
      !remote.isCurrent(state.result)
    ) {
      return blocked("These company results are no longer current. Search again.");
    }
    // No asynchronous operation may separate this freshness proof and the commit.
    let localFailed = false;
    const result = commitChoice(choice, state.result, {
      ...ports,
      readContextNow: () => {
        const now = ports.readContextNow();
        if (contextIdentity(now) !== identity)
          throw new Error("Company context changed.");
        return now;
      },
      commitLocal: (next) => {
        try {
          ports.commitLocal(next);
        } catch (error) {
          localFailed = true;
          throw error;
        }
      },
    });
    if (result.kind === "blocked") fail(result.reason, localFailed);
    else {
      setFailure(null);
      cancel();
    }
    return result;
  }

  useEffect(() => {
    if (session.current.identity !== identity) {
      // Failed or cancelled attempts stay suppressed when their context returns.
      if (attempts.current.get(session.current.identity) === "resolved")
        attempts.current.delete(session.current.identity);
      session.current = { identity, kind: "idle" };
      remote.cancel();
    }
    if (selection && session.current.kind === "auto") {
      session.current = { identity, kind: "idle" };
      remote.cancel();
    }
    if (
      selection ||
      !canResolve(latest.current) ||
      attempts.current.has(identity) ||
      session.current.kind !== "idle" ||
      activeFailure?.unresolved
    )
      return;
    attempts.current.set(identity, "attempted");
    session.current = { identity, kind: "auto", initialState: remote.state };
    remote.search("symbol", context.symbol);
  }, [
    identity,
    selection !== null,
    activeFailure?.unresolved,
    context.symbol,
    source,
    remote.cancel,
    remote.search,
  ]);

  useEffect(() => {
    if (
      session.current.identity !== identity ||
      session.current.kind !== "auto" ||
      selection
    )
      return;
    const state = remote.state;
    if (state === session.current.initialState) return;
    if (state.kind === "failed") {
      session.current = { identity, kind: "idle" };
      fail(state.result.failure.message);
      remote.cancel();
      return;
    }
    if (state.kind !== "ready" || !remote.isCurrent(state.result)) return;
    session.current = { identity, kind: "idle" };
    const choice = resolveExactSymbol(state.result.rows, context.symbol);
    try {
      const current = latest.current;
      const now = current.ports.readContextNow();
      const next = choice && selectionFor(choice, state.result);
      if (
        next &&
        contextIdentity(now) === identity &&
        canResolve(current) &&
        state.result.request.mode === "symbol" &&
        state.result.request.query === now.symbol &&
        isSelectionValid(next, now) &&
        remote.isCurrent(state.result)
      ) {
        // Same effective symbol: the host takes its metadata-only persistence path.
        current.ports.commitLocal(next);
        attempts.current.set(identity, "resolved");
      }
    } catch {
      fail(
        "The resolved company metadata could not be saved. Refresh this widget.",
        true,
      );
    }
    remote.cancel();
  }, [
    identity,
    remote.state,
    selection !== null,
    context.symbol,
    remote.cancel,
    remote.isCurrent,
  ]);

  const userActive =
    session.current.identity === identity && session.current.kind === "user";
  const resolving =
    session.current.identity === identity && session.current.kind === "auto";
  const status = activeFailure
    ? "error"
    : selection
      ? "resolved"
      : context.symbol.includes(",")
        ? "multiple"
        : resolving
          ? "resolving"
          : "unresolved";
  return {
    selection,
    status,
    error: activeFailure?.reason ?? null,
    searchState: userActive ? remote.state : { kind: "idle" as const },
    search,
    cancel,
    choose,
  };
}
