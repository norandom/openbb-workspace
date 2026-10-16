import assert from "node:assert/strict";
import { test } from "node:test";
import { communitySeries, unsupportedChartReason } from "../../src/components/Widgets/communityCharts.ts";
test("all eight installed Community series remain available", () => {
 assert.deepEqual(communitySeries, ["area", "bar", "bubble", "line", "scatter", "donut", "pie", "histogram"]);
 for(const chartType of communitySeries) assert.equal(unsupportedChartReason({chartType}), undefined);
});
test("legacy Enterprise and unknown standalone series remain unchanged and unavailable", () => {
 for(const chartType of ["waterfall", "radar-line", "treemap", "heatmap", "unknown", undefined]) {
  const params={chartType, xKey:"date", yKey:["income"], legacy:{retained:true}};
  const before=structuredClone(params);
  assert.ok(unsupportedChartReason(params));
  assert.deepEqual(params,before);
 }
});
