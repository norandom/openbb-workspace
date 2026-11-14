import { fileURLToPath } from "node:url";
export default {
  resolve: { alias: { "~": fileURLToPath(new URL("../../../src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { include: ["tests/unit/peer-observations/*.test.tsx"], environment: "jsdom", maxWorkers: 1 },
};
