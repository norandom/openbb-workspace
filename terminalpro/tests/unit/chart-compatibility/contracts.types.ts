import type { DetachedStateInput, DetachedStateReducer, IntegratedStateInput, IntegratedStateReducer, JsonObject, ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { ChartLifecycle, ChartRenderRequest, CreateChartLifecycle } from "../../../src/components/General/Table/Chart/echarts/lifecycle";
import { integratedFixture, detachedFixture } from "./contracts.fixtures";

const integrated: IntegratedStateInput = integratedFixture;
const detached: DetachedStateInput = detachedFixture;
// @ts-expect-error A detached event cannot supply the integrated address/baseline.
const missingAddress: IntegratedStateInput = detachedFixture;
// @ts-expect-error Undefined is a runtime option value, never an unknown saved value.
const invalidStorage: JsonObject = { unknown: undefined };
// @ts-expect-error Function values cannot enter serialized storage.
const invalidFunction: JsonObject = { unknown: () => 1 };
const applyIntegrated: IntegratedStateReducer = (_input) => ({ chartModel: { chartOptions: { nested: undefined } } } as unknown as ChartStorageOutput);
const applyDetached: DetachedStateReducer = (_input) => ({ chartOptions: undefined } as unknown as ChartStorageOutput);
const output: ChartStorageOutput = applyIntegrated(integrated);
const detachedOutput: ChartStorageOutput = applyDetached(detached);
applyIntegrated({ ...integrated, storage: output });
applyDetached({ ...detached, storage: detachedOutput });
const request: ChartRenderRequest = { options: { series: [{ type: "bar", data: [123.45] }] }, revision: 3 };
// @ts-expect-error Revisions are numeric at the renderer boundary.
const invalidRequest: ChartRenderRequest = { options: {}, revision: "3" };
function consumeHost(create: CreateChartLifecycle, container: HTMLDivElement): ChartLifecycle {
  const owner = create(container);
  owner.mount(request);
  owner.update({ ...request, revision: 4 });
  owner.resize();
  const image: string = owner.exportImage({ pixelRatio: 2 });
  owner.dispose();
  void image;
  // @ts-expect-error The ECharts instance is private to the implementation.
  owner.instance;
  return owner;
}
void [missingAddress, invalidStorage, invalidFunction, output, detachedOutput, invalidRequest, consumeHost];
