import type { Locator } from "@playwright/test";
import { expand } from "./editor";
import { expect } from "./fixtures";

type Family = "groupedColumn" | "stackedColumn" | "line";
type SavedContent = {
  data: { widgets: { widgetId: string; storage: unknown }[] };
};

export function customizeLeaves(family: Family) {
  const offset = family === "groupedColumn" ? 0 : family === "stackedColumn" ? 1 : 2;
  return {
    padding: { top: 37 + offset },
    legend: { enabled: true, position: family === "line" ? "left" : "right" },
    tooltip: { enabled: true, mode: "compact" },
    series: {
      strokeWidth: 3 + offset,
      label: { enabled: true, fontSize: 18 + offset * 2 },
      ...(family === "line"
        ? { marker: { enabled: true, size: 13 } }
        : { shadow: { enabled: true, blur: 7 + offset } }),
    },
    axes: {
      category: {
        bottom: { line: { enabled: true, width: 2 + offset }, label: { autoRotate: false, rotation: 45 } },
        top: { line: { enabled: true, width: 2 + offset }, label: { autoRotate: false, rotation: 45 } },
      },
      number: {
        left: { line: { enabled: true, width: 5 + offset } },
        right: { line: { enabled: true, width: 5 + offset } },
      },
    },
  };
}

async function enable(scope: Locator, name: string) {
  const toggle = scope.getByRole("switch", { name, exact: true });
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
}

async function number(scope: Locator, name: string, value: number) {
  const control = scope.getByRole("spinbutton", { name: `${name} value`, exact: true });
  await control.fill(String(value));
  await control.blur();
  await expect(control).toHaveValue(String(value));
  await expect(control).toHaveAttribute("aria-invalid", "false");
}

export async function exerciseCustomize(editor: Locator, family: Family) {
  const leaves = customizeLeaves(family);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Chart Style");
  const padding = editor.getByRole("group", { name: "Padding", exact: true });
  const top = padding.getByRole("textbox", { name: "Top value", exact: true });
  await top.fill(String(leaves.padding.top));
  await top.blur();
  await expect(top).toHaveValue(String(leaves.padding.top));

  await expand(editor, "Legend");
  const legend = editor.getByRole("group", { name: "Legend", exact: true });
  await enable(legend, "Enabled");
  const position = legend.getByRole("combobox", { name: "Position", exact: true });
  await position.selectOption(leaves.legend.position);
  await expect(position).toHaveValue(leaves.legend.position);

  await expand(editor, "Series");
  const series = editor.getByRole("region", { name: "Series", exact: true });
  await number(series, family === "line" ? "Line Width" : "Stroke Width", leaves.series.strokeWidth);
  const tooltips = series.getByRole("group", { name: "Tooltips", exact: true });
  await enable(tooltips, "Tooltips");
  const mode = tooltips.getByRole("combobox", { name: "Tooltip Mode", exact: true });
  await mode.selectOption("compact");
  await expect(mode).toHaveValue("compact");
  const labels = series.getByRole("group", { name: "Labels", exact: true });
  await enable(labels, "Labels");
  const size = labels.getByRole("combobox", { name: "Size", exact: true });
  await size.selectOption(String(leaves.series.label.fontSize));
  await expect(size).toHaveValue(String(leaves.series.label.fontSize));
  if (family === "line") {
    const markers = series.getByRole("group", { name: "Markers", exact: true });
    await enable(markers, "Markers");
    await number(markers, "Size", 13);
    await expect(series.getByRole("group", { name: "Shadow", exact: true })).toHaveCount(0);
  } else {
    const shadow = series.getByRole("group", { name: "Shadow", exact: true });
    await enable(shadow, "Shadow");
    await number(shadow, "Blur", leaves.series.shadow!.blur);
    await expect(series.getByRole("group", { name: "Markers", exact: true })).toHaveCount(0);
  }
  await expand(editor, "Horizontal Axis");
  await number(editor.getByRole("region", { name: "Horizontal Axis", exact: true }).locator(":scope > div"), "Thickness", leaves.axes.category.bottom.line.width);
  const horizontalLabels = editor.getByRole("region", { name: "Horizontal Axis", exact: true }).getByRole("group", { name: "Labels", exact: true });
  await horizontalLabels.getByRole("checkbox", { name: "Auto Rotate", exact: true }).uncheck();
  const rotation = horizontalLabels.getByRole("spinbutton", { name: "Label rotation", exact: true });
  await rotation.fill("45");
  await rotation.blur();
  await expect(rotation).toHaveValue("45");
  await expand(editor, "Vertical Axis");
  await number(editor.getByRole("region", { name: "Vertical Axis", exact: true }).locator(":scope > div"), "Thickness", leaves.axes.number.left.line.width);
  return leaves;
}

export function expectSavedCustomize(
  content: SavedContent,
  branches: Partial<Record<"bar" | "line", ReturnType<typeof customizeLeaves>>>,
) {
  const widget = content.data.widgets.find((item) => item.widgetId.startsWith("file-"));
  expect(widget).toMatchObject({
    storage: { default: { chartModel: { chartOptions: branches } } },
  });
}
