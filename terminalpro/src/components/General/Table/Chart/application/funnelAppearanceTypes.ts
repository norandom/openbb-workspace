import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { ApplicationThemeInput } from "./appearanceModel";
import type { FunnelThemePaint } from "./funnelRenderTypes";
export interface FunnelAppearanceInput {
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
  readonly theme: ApplicationThemeInput;
  readonly themePaint: FunnelThemePaint;
  readonly precision: number;
}
