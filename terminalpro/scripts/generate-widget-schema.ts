import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { z } from "zod";

// Load the same aliases and schemas as Workspace without starting an HTTP listener.
const server = await createServer({
  configFile: false,
  resolve: { alias: { "~": resolve("src") } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { specificationSchema } = await server.ssrLoadModule(
    "/src/utils/zodForms.ts",
  );
  const schema = z.toJSONSchema(specificationSchema, {
    reused: "inline",
    target: "draft-7",
    io: "input",
  });
  const output = `${JSON.stringify(schema, null, 2)}\n`;
  const path = resolve(
    "src/components/DataConnectors/WidgetsBuilder/widget-schema.json",
  );
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== output)
      throw new Error(
        "Widget schema is stale; run scripts/generate-widget-schema.ts",
      );
    console.log("Widget schema matches specificationSchema");
  } else {
    writeFileSync(path, output);
    console.log(`Generated ${path}`);
  }
} finally {
  await server.close();
}
