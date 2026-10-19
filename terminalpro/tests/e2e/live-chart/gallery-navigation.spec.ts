import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { openEditor } from "./editor";

test("gallery retains its position across chart family changes", async ({ page }, info) => {
  await loginDisposableWorkspace(page);
  const { widget } = await importOrdinaryTable(page);
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  const gallery = editor.getByRole("region", { name: "Chart types" });
  const area = gallery.getByRole("button", { name: "Area", exact: true });
  await area.scrollIntoViewIfNeeded();
  await gallery.evaluate(element => {
    const section = [...element.querySelectorAll("section")].find(item => item.querySelector("h3")?.textContent === "Area")!;
    element.scrollTop += section.getBoundingClientRect().top - element.getBoundingClientRect().top;
  });
  const before = await gallery.evaluate(element => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  await area.click();
  await expect(gallery.getByRole("button", { name: "Area. Selected", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => gallery.evaluate(element => element.scrollTop)).toBe(before);
  await widget.screenshot({ path: info.outputPath("gallery-area-dark.png") });
  await gallery.getByRole("button", { name: "Stacked Area", exact: true }).click();
  await expect(gallery.getByRole("button", { name: "Stacked Area. Selected", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => gallery.evaluate(element => element.scrollTop)).toBe(before);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("tab", { name: "Chart", exact: true }).click();
  await expect.poll(() => gallery.evaluate(element => element.scrollTop)).toBe(before);
  await page.keyboard.press("Control+m");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => gallery.evaluate(element => element.scrollTop)).toBe(before);
  await widget.screenshot({ path: info.outputPath("gallery-area-light.png") });
});
