import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import type { FunnelFamily } from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
import type { ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import { sessionFixture } from "../chart-application/applicationSessionFixture";

export function funnelFixture(
  family: FunnelFamily = "funnel",
  storage: ChartStorageOutput = {},
): ApplicationSessionContext<FunnelFamily> {
  const source = sessionFixture();
  const inputs = {
    ...source.inputs,
    family,
    rangePolicy: {
      generatedColumnIds: ["period", "revenue", "income"],
      definitionColumnIds: ["period", "revenue", "income"],
      configuredColumnIds: ["period", "revenue", "income"],
    },
    funnelThemePaint: {
      family,
      fills: ["#112233", "#445566"],
      strokes: ["#778899"],
      numericLabelColor: "#ffffff",
      stageLabelColor: "#222222",
      dropOffFill: "#aaaaaa",
      dropOffStroke: "#bbbbbb",
    },
  };
  const state = initialApplicationSession(storage, inputs, 1);
  return { inputs, local: state.local, capture: source.capture };
}
export function funnelState(
  context = funnelFixture(),
  storage: ChartStorageOutput = {},
) {
  return {
    ...initialApplicationSession(storage, context.inputs, 1),
    local: context.local,
    capture: context.capture,
    viewport: { width: 800, height: 500 },
  };
}
