import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { communityWidgetSchema } from "../../src/components/DataConnectors/WidgetsBuilder/communityWidgetSchema.ts";
test("new-widget editor never advertises legacy Highcharts and preserves original import schema", () => {
 const schema=JSON.parse(readFileSync(new URL("../../src/components/DataConnectors/WidgetsBuilder/widget-schema.json",import.meta.url),"utf8"));
 const before=structuredClone(schema);
 const projected=communityWidgetSchema(schema);
 assert.ok(JSON.stringify(schema).includes('"chart-highcharts"'));
 assert.ok(!JSON.stringify(projected).includes('"chart-highcharts"'));
 assert.ok(JSON.stringify(projected).includes('"chart"'));
 assert.deepEqual(schema,before);
});
