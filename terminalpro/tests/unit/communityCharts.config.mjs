export default {
  resolve: { alias: { "~": new URL("../../src", import.meta.url).pathname } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/unit/communityCharts.test.tsx", "tests/unit/communityArtifactChart.test.tsx"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};
