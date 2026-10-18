import type { Locator, Page } from "@playwright/test";
import { chartMenu, expand } from "./editor";
import { expect, test } from "./fixtures";
import { expectVerticalAxisStroke } from "./diagnostics";

type Anchor = { text: string; x: number; y: number };
type Drawing = Window & {
  chartCategoryAnchors: Anchor[];
  chartDrawnAnchors: Record<string, { x: number; y: number }>;
};

async function categories(page: Page) {
  return page.evaluate(() => (window as unknown as Drawing).chartCategoryAnchors);
}

async function clearCategories(page: Page) {
  // Keep title and value observations for the surrounding persistence journey.
  await page.evaluate(() => { (window as unknown as Drawing).chartCategoryAnchors = []; });
}

async function chartQuickAction(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}

async function canvasGeometry(widget: Locator) {
  const canvas = widget.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const width = await canvas.evaluate((element) => (element as HTMLCanvasElement).width);
  return { ...box!, scale: box!.width / width };
}

async function tooltipAtRenderedPoint(page: Page, widget: Locator) {
  const box = await canvasGeometry(widget);
  const label = await page.evaluate(() => (window as unknown as Drawing).chartDrawnAnchors["20"]);
  expect(label).toBeDefined();
  const tooltip = widget.getByText("Revenue: 20", { exact: true });
  // The rendered value label sits above its marker; inspect only that local hit area.
  for (const offset of [5, 10, 15, 20, 25, 30]) {
    await page.mouse.move(box.x + label.x * box.scale, box.y + label.y * box.scale + offset);
    if (await tooltip.isVisible()) return;
    try { await expect(tooltip).toBeVisible({ timeout: 250 }); return; } catch { /* Try the next part of the marker hit area. */ }
  }
  await expect(tooltip).toBeVisible();
}

export async function exerciseActualChartActions(page: Page, widget: Locator, editor: Locator) {
  // Final line uses series width 5 and category width 4; its vertical axis is 7.
  await expectVerticalAxisStroke(page, 7);
  await tooltipAtRenderedPoint(page, widget);
  await page.mouse.move(0, 0);
  for (const mini of [false, true]) {
    await clearCategories(page);
    await chartQuickAction(page, widget, mini ? "Show mini chart" : "Show navigator");
    await expect.poll(async () => (await categories(page)).some((a) => a.text === "C")).toBe(true);
    const box = await canvasGeometry(widget);
    const initial = await categories(page);
    const a = initial.filter((p) => p.text === "A").at(-1)!;
    const c = initial.filter((p) => p.text === "C").at(-1)!;
    // The final line family has ordinal endpoints -0.1 and 2.1 for A..C.
    const left = a.x - (c.x - a.x) * 0.05;
    const right = c.x + (c.x - a.x) * 0.05;
    await expand(editor, "Chart Style");
    const padding = editor.getByRole("group", { name: "Padding", exact: true });
    const rightPadding = Number(await padding.getByRole("textbox", { name: "Right value", exact: true }).inputValue());
    const bottomPadding = Number(await padding.getByRole("textbox", { name: "Bottom value", exact: true }).inputValue());
    // The final fixture's left legend leaves right/bottom padding unchanged.
    // Main-axis outer bounds inset its labels, so they cannot locate slider handles.
    const x = box.x + box.width - rightPadding;
    const destinationX = x - (right - left) * box.scale * 0.4;
    const y = box.y + box.height - bottomPadding - (mini ? 37 : 9);
    const beforeDrag = await widget.screenshot();
    await clearCategories(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(destinationX, y, { steps: 12 });
    await page.mouse.up();
    try {
      await expect.poll(async () => {
        const after = await categories(page);
        return after.some((p) => p.text === "B" && (!mini || p.y < a.y - 20) &&
          Math.abs(p.x - (a.x + c.x) / 2) > 5 / box.scale);
      }).toBe(true);
    } catch (error) {
      const stage = mini ? "miniature" : "navigator";
      await test.info().attach(`${stage}-drag-observations`, {
        body: JSON.stringify({ stage, box, initial, after: await categories(page),
          pointer: { from: { x, y }, to: { x: destinationX, y } },
          topElement: await page.evaluate(({ x, y }) => {
            const element = document.elementFromPoint(x, y);
            return element ? { tag: element.tagName, bounds: element.getBoundingClientRect().toJSON() } : null;
          }, { x, y }),
        }), contentType: "application/json",
      });
      await test.info().attach(`${stage}-before-drag`, { body: beforeDrag, contentType: "image/png" });
      await test.info().attach(`${stage}-after-drag`, { body: await widget.screenshot(), contentType: "image/png" });
      throw error;
    }
    if (mini) {
      const after = await categories(page);
      for (const endpoint of [a, c]) {
        expect(after.some((p) => p.text === endpoint.text && Math.abs(p.x - endpoint.x) < 1 && Math.abs(p.y - endpoint.y) < 1)).toBe(true);
      }
    }
    await clearCategories(page);
    await chartQuickAction(page, widget, mini ? "Hide mini chart" : "Hide navigator");
    await expect.poll(async () => (await categories(page)).some((p) =>
      p.text === "B" && Math.abs(p.x - (a.x + c.x) / 2) < 1,
    )).toBe(true);
  }
  await expand(editor, "Titles");
  await expect(editor).toBeVisible();
}
