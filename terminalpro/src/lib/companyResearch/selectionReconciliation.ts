import { decodeSelection, isSingleSymbol, isSourceKey, type CompanyContext, type CompanySelectionV1 } from "../../components/General/Table/NavBar/companySelection.contract";
import { checkCompanyGroup } from "../../components/General/Table/NavBar/companyGroupSafety";

export type ReconciliationInput = Readonly<{
  eligible: boolean;
  metadata: unknown;
  context: CompanyContext;
  connectedSourceKey: string | null;
  previousContext?: CompanyContext;
}>;
export type SelectionReconciliation = Readonly<{
  kind: "resolved" | "absent-default" | "linked-change" | "unresolved" | "empty";
  selection: CompanySelectionV1 | null;
  savedDisplay: Readonly<{ name: string | null; symbol: string | null }>;
  reason: string | null;
  allowAutomaticResolution: boolean;
  allowRequest: boolean;
}>;

function savedDisplay(raw: unknown): SelectionReconciliation["savedDisplay"] {
  if (typeof raw !== "object" || raw === null) return { name: null, symbol: null };
  const value = raw as Record<string, unknown>;
  return { name: typeof value.name === "string" ? value.name : null,
    symbol: typeof value.symbol === "string" ? value.symbol : null };
}

function observedLinkedChange(current: CompanyContext, previous?: CompanyContext): boolean {
  if (!previous || current.widgetUuid !== previous.widgetUuid ||
      current.dashboardId !== previous.dashboardId || current.sourceKey !== previous.sourceKey ||
      current.provider !== previous.provider || current.symbol === previous.symbol) return false;
  if (current.group.kind !== "bound" || previous.group.kind !== "bound" ||
      current.group.id !== previous.group.id || current.group.value === previous.group.value) return false;
  return checkCompanyGroup(current).kind === "allowed" && checkCompanyGroup(previous).kind === "allowed";
}

export function reconcileCompanySelection(input: ReconciliationInput): SelectionReconciliation {
  const { context, metadata } = input;
  const base = { selection: null, savedDisplay: savedDisplay(metadata),
    allowAutomaticResolution: false, allowRequest: false };
  if (!isSingleSymbol(context.symbol)) return { ...base, kind: "empty", reason: "Select one company symbol." };
  if (!isSourceKey(context.sourceKey) || context.sourceKey !== input.connectedSourceKey || context.provider !== "fmp") {
    return { ...base, kind: "unresolved", reason: "Reconnect the saved company data source." };
  }
  const selection = decodeSelection(metadata);
  if (selection && selection.sourceKey === context.sourceKey &&
      selection.provider === context.provider && selection.symbol === context.symbol) {
    return { ...base, kind: "resolved", selection, reason: null, allowRequest: true };
  }
  if (observedLinkedChange(context, input.previousContext)) {
    return { ...base, kind: "linked-change", reason: null, allowAutomaticResolution: true, allowRequest: true };
  }
  if (metadata == null) {
    return { ...base, kind: "absent-default", reason: null, allowAutomaticResolution: true, allowRequest: true };
  }
  return { ...base, kind: "unresolved", reason: "Saved company identity does not resolve against the current source and symbol. Select from the current source." };
}

// Unrelated widgets retain their native request behavior; company consumers share one guard.
export function companyRequestAllowed(input: ReconciliationInput): boolean {
  return !input.eligible || reconcileCompanySelection(input).allowRequest;
}
