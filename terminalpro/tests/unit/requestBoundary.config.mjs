export default {
  resolve: { alias: { "~": new URL("../../src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["tests/unit/requestBoundary.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};
