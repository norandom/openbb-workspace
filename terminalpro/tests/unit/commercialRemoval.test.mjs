import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../src", import.meta.url));
function files(dir) { return readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(join(dir,e.name)) : [join(dir,e.name)]); }
test("all source imports and initialization paths exclude commercial renderers", () => {
 const forbidden = /(?:from\s*|import\s*(?:\(\s*)?)["'](?:ag-grid-enterprise|ag-charts-enterprise|highcharts(?:-react-official)?)(?:[\/"'])|LicenseManager|AllEnterpriseModule|AgChartsEnterpriseModule|setLicenseKey/;
 const violations = files(root).filter(p => /\.[cm]?[jt]sx?$/.test(p)).filter(p => forbidden.test(readFileSync(p,"utf8"))).map(p => p.slice(root.length));
 assert.deepEqual(violations, []);
});
test("unsupported registry entries have no lazy implementation imports", () => {
 const registry=readFileSync(join(root,"components/Widgets/index.ts"),"utf8");
 for (const removed of ["AgChartFromTable", "AgGridSSRM", "AgGridSSRMAdvanced", "ChartHighcharts"]) {
  assert.doesNotMatch(registry,new RegExp(`import\\([^\\n]*${removed}`));
  assert.match(registry,new RegExp(`${removed}: communityWidget\\(`));
 }
 assert.match(registry,/AgChart: communityWidget\(AgChartFC/);
 assert.match(registry,/Chart: ChartFC/);
});
