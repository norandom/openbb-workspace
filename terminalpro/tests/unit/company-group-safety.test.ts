import { describe, expect, it } from "vitest";
import { checkCompanyGroup } from "../../src/components/General/Table/NavBar/companyGroupSafety";
import type {
  CompanyContext, CompanyMember, GroupSnapshot,
} from "../../src/components/General/Table/NavBar/companySelection.contract";

const sourceKey = JSON.stringify(["connected-fmp", "https://example.test/data"]);
const otherSource = JSON.stringify(["independent-fmp", "https://example.test/data"]);
const member = (widgetId = "origin"): CompanyMember => ({
  widgetId, sourceKey, provider: "fmp", eligible: true,
  symbolBindingIds: ["company-group"], hasCompetingTickerBinding: false,
});
const bound = (): Extract<GroupSnapshot, { kind: "bound" }> => ({
  kind: "bound", id: "company-group", value: "AAPL",
  members: [member(), member("income")],
});
const context = (patch: Partial<CompanyContext> = {}): CompanyContext => ({
  widgetUuid: "origin", dashboardId: "active-dashboard", sourceKey,
  provider: "fmp", symbol: "AAPL", immediate: true,
  isPreview: false, dashboardMember: true, group: bound(), ...patch,
});
const unsafe = (value: unknown): CompanyContext => value as CompanyContext;
const expectBlocked = (value: CompanyContext, reason: RegExp) => {
  const result = checkCompanyGroup(value);
  expect(result.kind).toBe("blocked");
  if (result.kind === "blocked") expect(result.reason).toMatch(reason);
};
const withMember = (patch: Record<string, unknown>): CompanyContext => context({
  group: { ...bound(), members: [member(), { ...member("income"), ...patch } as CompanyMember] },
});

describe("exact company Symbol group", () => {
  it("allows only the supplied compatible group ID", () => {
    expect(checkCompanyGroup(context())).toEqual({ kind: "allowed", groupId: "company-group" });
    const group = bound();
    expect(checkCompanyGroup(context({ group: { ...group, members: [member()] } })))
      .toEqual({ kind: "allowed", groupId: "company-group" });
  });
  it("allows explicit replacement of an existing comparison list", () => {
    expect(checkCompanyGroup(context({ symbol: "AAPL,MSFT", group: { ...bound(), value: "AAPL,MSFT" } })))
      .toEqual({ kind: "allowed", groupId: "company-group" });
  });
  it("allows selecting a required symbol that is currently empty", () => {
    expect(checkCompanyGroup(context({ symbol: "", group: { ...bound(), value: "" } })))
      .toEqual({ kind: "allowed", groupId: "company-group" });
  });
  it("does not mutate membership, bindings or an independent group", () => {
    const current = context();
    const independent = { id: "independent", value: "GDP", members: ["fred"] };
    const before = JSON.stringify({ current, independent });
    for (const currentMember of current.group.kind === "bound" ? current.group.members : []) {
      Object.freeze(currentMember.symbolBindingIds);
      Object.freeze(currentMember);
    }
    if (current.group.kind === "bound") Object.freeze(current.group.members);
    Object.freeze(current.group);
    Object.freeze(current);
    expect(checkCompanyGroup(current)).toEqual({ kind: "allowed", groupId: "company-group" });
    expect(JSON.stringify({ current, independent })).toBe(before);
  });
  it.each([
    [{ eligible: false }, /eligible|immediate/i],
    [{ provider: "fred" }, /provider|fmp/i],
    [{ provider: "yfinance" }, /provider|fmp/i],
    [{ sourceKey: otherSource }, /source/i],
    [{ sourceKey: JSON.stringify(["connected-fmp", "https://other.test/data"]) }, /source/i],
    [{ symbolBindingIds: [] }, /binding/i],
    [{ symbolBindingIds: ["independent-group"] }, /binding/i],
    [{ symbolBindingIds: ["company-group", "independent-group"] }, /binding/i],
    [{ symbolBindingIds: ["company-group", "company-group"] }, /binding/i],
    [{ hasCompetingTickerBinding: true }, /competing|ticker/i],
  ])("rejects incompatible member %j", (patch, reason) => {
    expectBlocked(withMember(patch as Record<string, unknown>), reason as RegExp);
  });
  it("checks the origin's binding and eligibility as well as peers", () => {
    expectBlocked(context({ group: { ...bound(), members: [
      { ...member(), eligible: false }, member("income"),
    ] } }), /eligible|immediate/i);
    expectBlocked(context({ group: { ...bound(), members: [
      { ...member(), symbolBindingIds: ["other"] }, member("income"),
    ] } }), /binding/i);
  });
  it.each([
    { provider: "fred" }, { provider: "FMP" }, { immediate: false },
    { sourceKey: otherSource }, { sourceKey: "unresolved" },
  ])("rechecks the effective initiating context %j", (patch) => {
    expectBlocked(context(patch), /provider|fmp|immediate|source/i);
  });
  it.each([
    { isPreview: true }, { dashboardMember: false }, { dashboardId: "" },
    { dashboardId: " active-dashboard" }, { widgetUuid: "missing" },
  ])("prevents live group writes from preview/detached context %j", (patch) => {
    expectBlocked(context(patch), /preview|dashboard|member/i);
  });
  it("does not infer dashboard membership from UUID shape", () => {
    expectBlocked(context({
      widgetUuid: "ea786512-2993-49dd-9c3c-575d3618ede1", dashboardMember: false,
    }), /dashboard|member/i);
  });
  it.each([
    { members: [] }, { members: [member("peer-only")] },
    { members: [member(), member()] },
  ])("requires exact origin membership and unique member UUIDs %j", (patch) => {
    expectBlocked(context({ group: { ...bound(), ...patch } }), /member/i);
  });
  it("rejects a stale group value rather than using a different effective symbol", () => {
    expectBlocked(context({ group: { ...bound(), value: "MSFT" } }), /symbol|changed|refresh/i);
  });
  it("blocks unavailable groups with an actionable reason", () => {
    expectBlocked(context({ group: { kind: "unavailable", reason: "Widget removed from dashboard" } }),
      /Widget removed from dashboard/);
  });
});

describe("local company editing", () => {
  it.each([
    {}, { isPreview: true }, { dashboardMember: false, dashboardId: "" },
    { isPreview: true, dashboardMember: false, dashboardId: "" },
  ])("never grants a live group ID for ungrouped editing %j", (patch) => {
    expect(checkCompanyGroup(context({ ...patch, group: { kind: "ungrouped" } })))
      .toEqual({ kind: "allowed", groupId: null });
  });
  it("retains immediate FMP/source constraints for local editing", () => {
    expectBlocked(context({ group: { kind: "ungrouped" }, immediate: false }), /immediate/i);
    expectBlocked(context({ group: { kind: "ungrouped" }, sourceKey: "unresolved" }), /source/i);
  });
});

describe("malformed group boundaries fail closed", () => {
  it.each([
    null, [], {}, { ...context(), group: null }, { ...context(), group: { kind: "future" } },
    { ...context(), symbol: null }, { ...context(), widgetUuid: "" },
    { ...context(), isPreview: undefined }, { ...context(), dashboardMember: "true" },
    { ...context(), immediate: "true" },
  ])("returns a blocked decision for malformed context (%#)", (value) => {
    expectBlocked(unsafe(value), /context|group|symbol|widget|preview|dashboard|immediate/i);
  });
  it.each([
    { id: "" }, { id: " company-group" }, { value: null }, { members: null },
    { members: [null] }, { members: [{}] },
  ])("returns a blocked decision for malformed group %j", (patch) => {
    expectBlocked(unsafe({ ...context(), group: { ...bound(), ...patch } }), /group|member|symbol/i);
  });
  it.each([
    { widgetId: "" }, { widgetId: " income" }, { eligible: "true" },
    { symbolBindingIds: null }, { symbolBindingIds: "company-group" },
    { hasCompetingTickerBinding: undefined }, { hasCompetingTickerBinding: "false" },
  ])("returns a blocked decision for malformed member %j", (patch) => {
    expectBlocked(withMember(patch), /member|eligible|immediate|binding|competing|ticker/i);
  });
  it("uses a safe fallback if an unavailable snapshot has no reason", () => {
    expectBlocked(unsafe({ ...context(), group: { kind: "unavailable", reason: null } }), /group|refresh/i);
  });
});
