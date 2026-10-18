import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import type { ApplicationAxisId } from "./appearanceModel";
import type { CartesianFamily } from "../echarts/cartesianTypes";
import type { ApplicationAxisStructureEvent, AxisBinding } from "../compatibility/editorBindings/types";

export type ApplicationAxisOptionType = AxisBinding["optionType"];
/** Runtime axis options are not an additional serialized ChartModel field. */
export interface ApplicationConcreteAxis {
  readonly id: ApplicationAxisId;
  readonly direction: "x" | "y";
  readonly type: ApplicationAxisOptionType;
  readonly position: "top" | "bottom" | "left" | "right";
  /** Preserve unknown original concrete-option siblings when changing a finite leaf. */
  readonly options: RuntimeOptions;
}
export interface ApplicationAxisRuntime {
  readonly axes: readonly ApplicationConcreteAxis[];
  /** Original ChartDataModel runtime value; getChartModel does not serialize it. */
  readonly categoryAxisType: ApplicationAxisOptionType | undefined;
}
export interface AxisStructureInput {
  readonly event: ApplicationAxisStructureEvent;
  readonly family: CartesianFamily;
  /** Fresh source-equivalent runtime options, derived inside the latest-state transaction. */
  readonly runtime: ApplicationAxisRuntime;
  /** Latest original theme overrides, not generated/resolved options. */
  readonly savedOptions: RuntimeOptions;
}
export interface AxisStructureTransition {
  readonly runtime: ApplicationAxisRuntime;
  /** Only original theme override writes from retained-style transfer; may be empty. */
  readonly eventOptions: RuntimeOptions;
}
export type TransitionApplicationAxisStructure = (
  input: AxisStructureInput,
) => ValidationResult<AxisStructureTransition>;
// Implementation export: transitionApplicationAxisStructure: TransitionApplicationAxisStructure.
