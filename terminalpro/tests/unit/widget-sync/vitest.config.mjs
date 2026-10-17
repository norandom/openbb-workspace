import { fileURLToPath } from "node:url";
export default {
  resolve: { alias: { "~": fileURLToPath(new URL("../../../src", import.meta.url)) } },
  test: {
    include: ["tests/unit/widget-sync/**/*.test.tsx"],
    maxWorkers: 1,
    environment: "jsdom",
  },
};
