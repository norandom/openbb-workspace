import type { WidgetT } from "~/components/types";
import { documentChoices, documentDefinition } from "~/lib/utils/documentTemplateState";

import {
  financialWidgetPolicy,
  validateFinancialQuery,
} from "~/lib/utils/financialQuery";

export function documentQuery(widget: WidgetT) {
  const definition = documentDefinition(widget);
  const policy = financialWidgetPolicy(widget).queryPolicy;
  if (!definition || !policy?.parameters || !Array.isArray(policy.required))
    throw new Error("Document query policy is unavailable.");
  const params = documentChoices(widget);
  validateFinancialQuery(params, policy);
  return { params, kind: definition.kind };
}
