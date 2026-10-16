export default {
  resolve: { alias: { "~": new URL("../../src", import.meta.url).pathname } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/unit/communityMount.test.tsx", "tests/unit/communityRealGrid.test.tsx"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};
