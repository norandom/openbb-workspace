export default {
  test: {
    include: ["tests/unit/chart-application/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
    environment: "jsdom",
  },
};
