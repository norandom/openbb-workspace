export const previewCategories = ["Peter", "Mary", "Mercutio", "Ada"] as const;

const sample = [
  { name: "Number of Looks (TM)", values: [60, 57, 238, 237] },
  { name: "Number of Looks (YM)", values: [64, 93, 217, 217] },
  { name: "Interaction Duration (TM)", values: [120, 135, 140, 110] },
  { name: "Interaction Duration (YM)", values: [86, 259, 145, 147] },
];

/** Synthetic observations retain the original preview's ordering and alternating extension. */
export function previewSample(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `theme-preview-series-${index}`,
    name: sample[index]?.name ?? `Series ${index + 1}`,
    values: sample[index]
      ? [...sample[index].values]
      : previewCategories.map((_, category) =>
          (category + index - 3) % 2 === 1
            ? 30 + (index - 3) * 10
            : 50 + (index - 3) * 10,
        ),
  }));
}
