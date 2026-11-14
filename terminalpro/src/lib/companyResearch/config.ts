import { z } from "zod";
import { decodeListingChoice, decodeSelection, hasContradictoryListings, isSourceKey,
  type ListingChoice, type CompanySelectionV1 } from "../../components/General/Table/NavBar/companySelection.contract";

export const COMPANY_RESEARCH_RENDERER_ID = "company_research" as const;
export const COMPANY_RESEARCH_DECLARATION = Object.freeze({
  widgetId: COMPANY_RESEARCH_RENDERER_ID, type: COMPANY_RESEARCH_RENDERER_ID,
});
export type ResearchListing = ListingChoice & Readonly<{ sourceKey: string }>;
export type ResearchPeer = Readonly<{ identity: ResearchListing; rationale: string }>;
export type CompanyResearchConfig = Readonly<{
  version: 1; peers: readonly ResearchPeer[]; period: "annual" | "quarter"; limit: number;
}>;

export function researchListingFromChoice(choice: ListingChoice, sourceKey: string): ResearchListing | null {
  const listing = decodeListingChoice(choice);
  return listing && isSourceKey(sourceKey) ? { ...listing, sourceKey } : null;
}

const listingSchema = z.unknown().transform((raw, ctx) => {
  const source = z.object({ sourceKey: z.string().refine(isSourceKey) }).safeParse(raw);
  const choice = decodeListingChoice(raw);
  if (!source.success || !choice) {
    ctx.addIssue({ code: "custom", message: "Unresolved source-qualified listing." });
    return z.NEVER;
  }
  return { ...choice, sourceKey: source.data.sourceKey };
});

// The native endpoint cannot distinguish two listings sharing this request identity.
export function researchListingKey(identity: ResearchListing): string {
  return JSON.stringify([identity.sourceKey, identity.provider, identity.symbol]);
}

function peerIssues(peers: readonly ResearchPeer[], ctx: z.RefinementCtx): void {
  const keys = peers.map((peer) => researchListingKey(peer.identity));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Duplicate source-qualified peer." });
  for (const peer of peers) {
    const sameSource = peers.filter((other) => other.identity.sourceKey === peer.identity.sourceKey).map((other) => other.identity);
    if (hasContradictoryListings(sameSource, peer.identity.symbol)) {
      ctx.addIssue({ code: "custom", message: "Ambiguous company listing for this source and symbol." });
      return;
    }
  }
}

export const companyResearchConfigSchema = z.object({
  version: z.literal(1),
  peers: z.array(z.object({ identity: listingSchema, rationale: z.string().max(2000) })).max(20).superRefine(peerIssues),
  period: z.enum(["annual", "quarter"]),
  limit: z.number().int().min(1).max(20),
});
export type ResearchConfigResolution =
  | { kind: "valid"; config: CompanyResearchConfig }
  | { kind: "unresolved"; raw: unknown; reason: string };

export function decodeResearchConfig(raw: unknown): ResearchConfigResolution {
  const result = companyResearchConfigSchema.safeParse(raw);
  return result.success ? { kind: "valid", config: result.data }
    : { kind: "unresolved", raw, reason: "Saved research configuration is unsupported or invalid. Review the saved choices." };
}

function decodedSourcePath(address: string): string | null {
  let path = new URL(address).pathname;
  for (let round = 0; round < 3; round += 1) {
    const decoded = decodeURIComponent(path);
    if (decoded === path) return path;
    path = decoded;
  }
  // Deeper encoding remains unresolved rather than escaping the bounded classifier.
  return /%[0-9a-f]{2}/iu.test(path) ? null : path;
}

function publicIdentity(sourceKey: string): boolean {
  if (!isSourceKey(sourceKey)) return false;
  const [, address] = JSON.parse(sourceKey) as [string, string];
  try {
    const path = decodedSourcePath(address);
    if (path === null) return false;
    const credential = "(?:api[\\s_/-]*key|(?:(?:access|refresh|id)[\\s_-]*)?token|password|secret|authorization)";
    const assignedCredential = new RegExp(`${credential}[=:]`, "iu");
    const credentialSegment = new RegExp(`(?:^|/)${credential}(?:/|$)`, "iu");
    // Refuse a credential-dependent connector; removing its path would rebind identity.
    return !assignedCredential.test(path) && !credentialSegment.test(path);
  } catch {
    return false;
  }
}

export type ResearchExport = Readonly<{
  storage: { companySelection?: CompanySelectionV1; companyResearch?: CompanyResearchConfig };
  params: { symbol?: string; period?: "annual" | "quarter" };
}>;

export function safeResearchExport(input: { companySelection?: unknown; companyResearch?: unknown; period?: unknown }): ResearchExport {
  const storage: ResearchExport["storage"] = {};
  const params: ResearchExport["params"] = {};
  const selection = decodeSelection(input.companySelection);
  if (selection && publicIdentity(selection.sourceKey)) {
    storage.companySelection = selection;
    params.symbol = selection.symbol;
    if (input.period === "annual" || input.period === "quarter") params.period = input.period;
  }
  const research = decodeResearchConfig(input.companyResearch);
  if (research.kind === "valid" && research.config.peers.every((peer) => publicIdentity(peer.identity.sourceKey))) {
    storage.companyResearch = research.config;
  }
  return { storage, params };
}
