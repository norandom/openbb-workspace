import type {
  AppearanceColorTokens,
  AppearanceCompositionInput,
  ComposeAppearanceOptions,
  DeriveAppearanceColors,
  DerivedAppearanceColors,
} from "../../../src/components/General/Table/Chart/application/appearanceContracts";
import type {
  RuntimeOptions,
  ValidationResult,
} from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { SnapshotDiagnostic } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

function compositionContract(compose: ComposeAppearanceOptions) {
  const input: AppearanceCompositionInput = {
    baseline: {
      stateAddress: "synthetic",
      chartType: "groupedColumn",
      model: { chartOptions: { bar: { title: { text: "Stored model" } } } },
      options: { bar: { title: { text: "Selected baseline" } } },
    },
    generated: { common: { legend: { position: "top" } } },
  };
  const result: ValidationResult<RuntimeOptions> = compose(input);
  // @ts-expect-error The selected baseline is a required operand.
  compose({ generated: {} });
  // @ts-expect-error The input cannot replace its selected baseline.
  input.baseline = { ...input.baseline, stateAddress: "replacement" };
  // @ts-expect-error Executable formatting belongs outside data-only options.
  compose({ ...input, generated: { formatter: () => "USD" } });
  return result;
}

function colorContract(derive: DeriveAppearanceColors) {
  const tokens: AppearanceColorTokens = {
    base: "ag-default-dark",
    foregroundColor: "#123456",
    backgroundColor: "#26394a",
    textColor: "#ffffff",
    chartBackgroundColor: "#000000",
  };
  const result: DerivedAppearanceColors = derive(tokens);
  if (result.status === "resolved") {
    const colors: readonly string[] = [result.gridLineColor, result.subtleTextColor];
    // @ts-expect-error Resolved colors have no failure diagnostics.
    result.diagnostics;
    void colors;
  } else {
    const diagnostics: readonly SnapshotDiagnostic[] = result.diagnostics;
    // @ts-expect-error Diagnostics preserve immutable paths.
    diagnostics[0].path.push("guessed");
    // @ts-expect-error Failure cannot provide a guessed grid color.
    result.gridLineColor;
  }
  // @ts-expect-error Alias resolution must supply the chart background explicitly.
  derive({
    base: "ag-default",
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    textColor: "#123456",
  });
  // @ts-expect-error Only the captured base identities are admitted statically.
  derive({ ...tokens, base: "custom" });
  // @ts-expect-error Tokens cannot be reassigned by the consumer.
  tokens.textColor = "#000000";
  return result;
}
void [compositionContract, colorContract];
