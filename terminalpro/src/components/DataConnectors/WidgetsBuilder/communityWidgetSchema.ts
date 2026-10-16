// Keep the upstream import schema intact; new-widget autocomplete offers supported renderers.
export function communityWidgetSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(communityWidgetSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "enum" && Array.isArray(item)
        ? item.filter((option) => option !== "chart-highcharts")
        : communityWidgetSchema(item),
    ]),
  );
}
