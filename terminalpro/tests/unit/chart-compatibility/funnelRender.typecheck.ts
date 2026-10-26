import type { ResolvedApplicationSeries } from "../../../src/components/General/Table/Chart/application/appearanceModel";
import type {
  FunnelCommonStyle,
  FunnelFont,
  FunnelRenderInput,
  FunnelStageLabel,
  ResolvedFunnelStyle,
  TranslateFunnel,
} from "../../../src/components/General/Table/Chart/application/funnelRenderTypes";
import type { CartesianTranslationResult } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Variant<F extends ResolvedFunnelStyle["family"]> = Extract<
  ResolvedFunnelStyle,
  { family: F }
>;
export type ContractChecks = [
  Assert<Equal<FunnelFont, ResolvedApplicationSeries["labels"]>>,
  Assert<Equal<Parameters<TranslateFunnel>, [input: FunnelRenderInput]>>,
  Assert<Equal<ReturnType<TranslateFunnel>, CartesianTranslationResult>>,
  Assert<Equal<FunnelStageLabel["placement"], "before" | "after">>,
  Assert<Equal<keyof Variant<"coneFunnel">, keyof FunnelCommonStyle | "family">>,
];

export function checkVariants(
  common: FunnelCommonStyle,
  funnel: Variant<"funnel">,
  pyramid: Variant<"pyramid">,
) {
  const variants: readonly ResolvedFunnelStyle[] = [
    {
      ...common,
      family: "funnel",
      shadow: funnel.shadow,
      dropOff: funnel.dropOff,
      spacingRatio: 0.25,
    },
    { ...common, family: "coneFunnel" },
    {
      ...common,
      family: "pyramid",
      shadow: pyramid.shadow,
      reverse: false,
      spacing: 2,
      aspectRatio: 1,
    },
  ];
  const coneShadow: ResolvedFunnelStyle = {
    ...common,
    family: "coneFunnel",
    // @ts-expect-error Cone has no shadow capability.
    shadow: funnel.shadow,
  };
  const coneDropOff: ResolvedFunnelStyle = {
    ...common,
    family: "coneFunnel",
    // @ts-expect-error Cone has no drop-off capability.
    dropOff: funnel.dropOff,
  };
  // @ts-expect-error Pyramid has no drop-off capability.
  const pyramidDropOff: ResolvedFunnelStyle = { ...pyramid, dropOff: funnel.dropOff };
  // @ts-expect-error Funnel requires its spacing and connector settings.
  const incomplete: ResolvedFunnelStyle = {
    ...common,
    family: "funnel",
    shadow: funnel.shadow,
  };
  return { variants, coneShadow, coneDropOff, pyramidDropOff, incomplete };
}

export function checkReadonly(input: FunnelRenderInput) {
  // @ts-expect-error Viewport is an immutable render input.
  input.context.viewport.width = 500;
  // @ts-expect-error Renderer cannot append theme paints.
  input.style.paint.fills.push("red");
  // @ts-expect-error Dash arrays retain the resolved native values.
  input.style.series.lineDash.push(2);
  // @ts-expect-error Numeric label typography remains immutable.
  input.style.label.fontWeight = "bold";
  // @ts-expect-error Stage-label placement cannot be centered.
  input.style.stageLabel.placement = "center";
}
