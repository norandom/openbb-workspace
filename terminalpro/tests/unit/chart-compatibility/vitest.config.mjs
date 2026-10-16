export default {
  test: {
    include: ["tests/unit/chart-compatibility/**/*.test.{ts,tsx}", "tests/e2e/chart-compatibility/toolchain.test.ts"],
    maxWorkers: 1,
    environment: "jsdom",
  },
};
