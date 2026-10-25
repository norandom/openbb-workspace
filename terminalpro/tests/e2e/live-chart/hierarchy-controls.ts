import type { Locator, Page } from "@playwright/test";
import { expand, openEditor } from "./editor";
import { expect } from "./fixtures";
import { toggle } from "./pie-observer";

export async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}
export async function hierarchySetup(
  editor: Locator,
  categories: readonly string[],
  numeric: readonly string[],
) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  for (const label of categories)
    await editor
      .getByRole("combobox", { name: "Add a category", exact: true })
      .selectOption({ label });
  for (const label of numeric)
    await editor
      .getByRole("combobox", { name: "Add a series", exact: true })
      .selectOption({ label });
  if (categories.length) await toggle(editor, "Aggregate", false);
  await expect(
    editor.getByRole("switch", { name: "Switch Category / Series", exact: true }),
  ).toHaveCount(0);
}
export async function draftNumber(scope: Locator, label: string, value: number) {
  const input = scope.getByRole("textbox", { name: `${label} value`, exact: true });
  await input.fill(String(value));
  await input.blur();
  await expect(input).toHaveValue(String(value));
  await expect(input).toHaveAttribute("aria-invalid", "false");
}
export async function customize(page: Page, widget: Locator, section: string) {
  const editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, section);
  return editor;
}
export async function spacing(
  page: Page,
  widget: Locator,
  values: Record<string, number>,
) {
  const editor = await customize(page, widget, "Series");
  const group = editor.getByRole("group", { name: "Tile Spacing", exact: true });
  for (const [label, value] of Object.entries(values))
    await draftNumber(group, label, value);
  await collapse(editor);
}
export async function reorder(
  editor: Locator,
  label: string,
  direction: "ArrowUp" | "ArrowDown",
) {
  const grip = editor.getByRole("button", { name: `Reorder ${label}`, exact: true });
  await grip.focus();
  await grip.press(direction);
}
export async function tooltipControls(
  page: Page,
  widget: Locator,
  mode: "single" | "shared" | "compact",
  enabled = true,
) {
  const editor = await customize(page, widget, "Series");
  const group = editor.getByRole("group", { name: "Tooltips", exact: true });
  await toggle(group, "Tooltips", enabled);
  if (enabled)
    await group
      .getByRole("combobox", { name: "Tooltip Mode", exact: true })
      .selectOption(mode);
  await collapse(editor);
}
export const defaultSpacing = {
  "Group Padding": 4,
  "Group Spacing": 2,
  "Tile Padding": 3,
  "Tile Spacing": 1,
};
export const measurementSpacing = {
  "Group Padding": 0,
  "Group Spacing": 0,
  "Tile Padding": 0,
  "Tile Spacing": 0,
};
