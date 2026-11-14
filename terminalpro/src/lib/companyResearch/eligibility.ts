import { z } from "zod";

export type EvidenceStatus = "unverified" | "incompatible" | "not_meaningful";
export type EvidenceReference = { source: string; definition: string; location: string };
export type BasisKey = "share_count" | "debt" | "cash" | "lease" | "minority_interest" | "forecast_period" | "market_date";
type Referenced<T> = { value: T; reference: EvidenceReference | null };
export type MeasureApplicability =
  | { kind: "unknown" }
  | { kind: "equity" | "other"; reference: EvidenceReference }
  | { kind: "enterprise_value"; reference: EvidenceReference; requiredBasis: readonly BasisKey[] };
export type EligibilityInput = {
  applicability: MeasureApplicability;
  denominator?: Referenced<number | null>;
  bridge?: Partial<Record<BasisKey, Referenced<string | number | null> & { date: string | null }>>;
  comparison?: { reference: EvidenceReference | null; requirements: readonly {
    fact: string; required: boolean; left: string | number | null; right: string | number | null;
  }[] };
};
export type EligibilityResult = { status: EvidenceStatus; reasons: string[]; evidence: EligibilityInput };
export type SbcTreatment = { treatment: "added_back" | "retained_expense" | "unknown"; reference: EvidenceReference | null };

function hasReference(reference: EvidenceReference | null | undefined): reference is EvidenceReference {
  return !!reference && [reference.source, reference.definition, reference.location].every(value => typeof value === "string" && value.trim().length > 0);
}

function bridgeReasons(input: EligibilityInput): string[] {
  if (input.applicability.kind !== "enterprise_value" || !hasReference(input.applicability.reference)) return [];
  if (!input.applicability.requiredBasis.length) return ["bridge_requirements_unknown"];
  return input.applicability.requiredBasis.flatMap(key => {
    const item = input.bridge?.[key];
    return item?.value != null && hasReference(item.reference) && z.iso.date().safeParse(item.date).success
      ? [] : [`bridge_${key}_missing`];
  });
}

function comparisonReasons(input: EligibilityInput): { missing: string[]; conflicts: string[] } {
  const missing: string[] = [];
  const conflicts: string[] = [];
  if (!input.comparison) return { missing, conflicts };
  if (!hasReference(input.comparison.reference)) return { missing: ["comparison_requirements_unknown"], conflicts };
  for (const requirement of input.comparison.requirements) {
    if (!requirement.required) continue;
    if (requirement.left == null || requirement.right == null) missing.push(`${requirement.fact}_missing`);
    else if (requirement.left !== requirement.right) conflicts.push(`${requirement.fact}_conflict`);
  }
  return { missing, conflicts };
}

export function assessEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const applicabilityKnown = input.applicability.kind !== "unknown" && hasReference(input.applicability.reference);
  if (!applicabilityKnown) reasons.push("measure_applicability_unknown");
  const denominator = input.denominator;
  const knownDenominator = denominator?.value != null && Number.isFinite(denominator.value) && hasReference(denominator.reference);
  if (!knownDenominator) reasons.push("denominator_missing");
  reasons.push(...bridgeReasons(input));
  const comparison = comparisonReasons(input);
  reasons.push(...comparison.missing, ...comparison.conflicts);
  if (knownDenominator && denominator.value! <= 0) {
    reasons.push("denominator_nonpositive");
    return { status: "not_meaningful", reasons, evidence: input };
  }
  if (comparison.conflicts.length) return { status: "incompatible", reasons, evidence: input };
  return { status: "unverified", reasons: [...reasons, "aggregation_not_validated"], evidence: input };
}

export function assessSbcTreatment(evidence?: SbcTreatment): SbcTreatment {
  return evidence && (evidence.treatment === "added_back" || evidence.treatment === "retained_expense") && hasReference(evidence.reference)
    ? evidence : { treatment: "unknown", reference: null };
}
