import { decodeSelection } from "~/components/General/Table/NavBar/companySelection.contract";
import { safeResearchExport } from "../companyResearch/config";

export class ResearchTemplateError extends Error {}

type ResearchStorage = {
  companySelection?: unknown;
  companyResearch?: unknown;
  params?: Record<string, unknown>;
};

// Export configuration only; request payloads and connector authentication stay local.
export function researchTemplateState(
  storage: ResearchStorage | undefined,
  defaults: readonly { paramName: string; value?: unknown }[] = [],
) {
  const effective = (name: string) =>
    storage?.params?.[name] ??
    defaults.find((param) => param.paramName === name)?.value;
  const selection = decodeSelection(storage?.companySelection);
  if (selection && effective("symbol") !== selection.symbol) {
    throw new ResearchTemplateError(
      "Saved company identity does not match this widget's symbol. Reselect the company before exporting.",
    );
  }
  return safeResearchExport({
    companySelection: storage?.companySelection,
    companyResearch: storage?.companyResearch,
    period: effective("period"),
  });
}
