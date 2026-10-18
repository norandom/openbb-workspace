import { fileURLToPath } from "node:url";
export default {
  resolve: { alias: { "~": fileURLToPath(new URL("../../../src", import.meta.url)) } },
  test: {
    include: ["tests/unit/chart-application/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
    environment: "jsdom",
  },
};
