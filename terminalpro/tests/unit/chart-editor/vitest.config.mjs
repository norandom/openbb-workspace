export default {
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/chart*Panel.test.tsx",
      "tests/unit/chartEditorDock.test.tsx",
      "tests/unit/chartTypeGallery.test.tsx",
    ],
    maxWorkers: 1,
    fileParallelism: false,
  },
};
