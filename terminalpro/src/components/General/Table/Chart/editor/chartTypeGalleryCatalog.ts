export interface ChartTypeGalleryItem {
  modelType: string;
  name: string;
}

export interface ChartTypeGalleryGroup {
  name: string;
  items: readonly ChartTypeGalleryItem[];
}

// Preview inventory only: the caller supplies entitlement and range/pivot visibility.
export const chartTypeGalleryGroups: readonly ChartTypeGalleryGroup[] = [
  { name: "Column", items: [
    { modelType: "groupedColumn", name: "Grouped Column" },
    { modelType: "stackedColumn", name: "Stacked Column" },
    { modelType: "normalizedColumn", name: "100% Stacked Column" },
  ] },
  { name: "Bar", items: [
    { modelType: "groupedBar", name: "Grouped Bar" },
    { modelType: "stackedBar", name: "Stacked Bar" },
    { modelType: "normalizedBar", name: "100% Stacked Bar" },
  ] },
  { name: "Pie", items: [
    { modelType: "pie", name: "Pie" }, { modelType: "donut", name: "Donut" },
  ] },
  { name: "Line", items: [
    { modelType: "line", name: "Line" }, { modelType: "stackedLine", name: "Stacked Line" },
    { modelType: "normalizedLine", name: "100% Stacked Line" },
  ] },
  { name: "Area", items: [
    { modelType: "area", name: "Area" }, { modelType: "stackedArea", name: "Stacked Area" },
    { modelType: "normalizedArea", name: "100% Stacked Area" },
  ] },
  { name: "X Y (Scatter)", items: [
    { modelType: "scatter", name: "Scatter" }, { modelType: "bubble", name: "Bubble" },
  ] },
  { name: "Polar", items: [
    { modelType: "radarLine", name: "Radar Line" }, { modelType: "radarArea", name: "Radar Area" },
    { modelType: "nightingale", name: "Nightingale" }, { modelType: "radialColumn", name: "Radial Column" },
    { modelType: "radialBar", name: "Radial Bar" },
  ] },
  { name: "Statistical", items: [
    { modelType: "boxPlot", name: "Box Plot" }, { modelType: "histogram", name: "Histogram" },
    { modelType: "rangeBar", name: "Range Bar" }, { modelType: "rangeArea", name: "Range Area" },
  ] },
  { name: "Hierarchical", items: [
    { modelType: "treemap", name: "Treemap" }, { modelType: "sunburst", name: "Sunburst" },
  ] },
  { name: "Specialized", items: [
    { modelType: "heatmap", name: "Heatmap" }, { modelType: "waterfall", name: "Waterfall" },
  ] },
  { name: "Funnel", items: [
    { modelType: "funnel", name: "Funnel" }, { modelType: "coneFunnel", name: "Cone Funnel" },
    { modelType: "pyramid", name: "Pyramid" },
  ] },
  { name: "Combination", items: [
    { modelType: "columnLineCombo", name: "Column & Line" },
    { modelType: "areaColumnCombo", name: "Area & Column" },
  ] },
];
