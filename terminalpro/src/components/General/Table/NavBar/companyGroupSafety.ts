import {
  isSourceKey,
  type CompanyContext,
  type GroupDecision,
} from "./companySelection.contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function blocked(reason: string): GroupDecision {
  return { kind: "blocked", reason };
}

function contextFailure(context: CompanyContext): string | null {
  if (!isRecord(context)) return "Company context is unavailable. Refresh the widget.";
  if (!isId(context.widgetUuid)) return "The widget identity is unavailable. Reopen the widget.";
  if (context.provider !== "fmp") return "Company selection requires the FMP provider.";
  if (!isSourceKey(context.sourceKey)) return "Reconnect the widget's company data source.";
  if (context.immediate !== true) return "Company selection requires an eligible immediate-query widget.";
  if (typeof context.symbol !== "string") return "The effective Symbol is unavailable. Refresh the widget.";
  if (typeof context.isPreview !== "boolean" || typeof context.dashboardMember !== "boolean") {
    return "The widget's preview/dashboard context is unavailable. Reopen the widget.";
  }
  if (!isRecord(context.group)) return "The Symbol group is unavailable. Refresh its membership.";
  return null;
}

function memberFailure(member: unknown, context: CompanyContext, groupId: string): string | null {
  if (!isRecord(member) || !isId(member.widgetId)) {
    return "A Symbol group member has no valid widget identity. Check group membership.";
  }
  if (member.eligible !== true) {
    return "Every Symbol group member must be an eligible immediate-query company widget.";
  }
  if (member.provider !== "fmp") return "Every Symbol group member must use the FMP provider.";
  if (member.sourceKey !== context.sourceKey) return "Every Symbol group member must use the same connected source.";
  if (!Array.isArray(member.symbolBindingIds) || member.symbolBindingIds.length !== 1 ||
      member.symbolBindingIds[0] !== groupId) {
    return "Every member needs exactly one Symbol binding to this group. Check the group bindings.";
  }
  if (member.hasCompetingTickerBinding !== false) {
    return "Remove competing ticker or endpoint-Symbol bindings before selecting a grouped company.";
  }
  return null;
}

export function checkCompanyGroup(context: CompanyContext): GroupDecision {
  const invalidContext = contextFailure(context);
  if (invalidContext) return blocked(invalidContext);
  const group = context.group;
  // Preview and detached widgets keep their local editing path without a live group ID.
  if (group.kind === "ungrouped") return { kind: "allowed", groupId: null };
  if (group.kind === "unavailable") {
    return blocked(isId(group.reason) ? group.reason : "The Symbol group is unavailable. Refresh its membership.");
  }
  if (group.kind !== "bound" || !isId(group.id) || !Array.isArray(group.members)) {
    return blocked("The Symbol group is invalid. Refresh its membership and bindings.");
  }
  if (context.isPreview) return blocked("Preview company selection cannot write a live Symbol group. Use local editing.");
  if (!context.dashboardMember || !isId(context.dashboardId)) {
    return blocked("The widget is not a member of the active dashboard. Reopen it before changing the group.");
  }
  // Existing comparison lists and empty required values may be explicitly replaced.
  if (typeof group.value !== "string" || group.value !== context.symbol) {
    return blocked("The effective Symbol group value changed. Refresh before selecting a company.");
  }
  const seen = new Set<string>();
  for (const member of group.members) {
    const failure = memberFailure(member, context, group.id);
    if (failure) return blocked(failure);
    if (seen.has(member.widgetId)) return blocked("The Symbol group has duplicate members. Check its membership.");
    seen.add(member.widgetId);
  }
  if (!seen.has(context.widgetUuid)) {
    return blocked("The current widget is absent from this Symbol group. Refresh its membership.");
  }
  return { kind: "allowed", groupId: group.id };
}
