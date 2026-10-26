import type { Locator, Page } from "@playwright/test";
import { expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expand, openEditor } from "./editor";
import { expect } from "./fixtures";
import { collapse } from "./hierarchy-controls";
import { nativeTooltip } from "./hierarchy-observer";
import { stablePie, toggle } from "./pie-observer";

type Hit = { x: number; y: number; text: string };
type Pixels = { width: number; height: number; scale: number; data: number[] };
const expected = {
  Revenue: 111184000000,
  "Gross profit": 54781000000,
  "Net income": 29578000000,
};

export async function directionEffect(
  page: Page,
  widget: Locator,
  direction: "horizontal" | "vertical",
) {
  await stablePie(page, widget);
  const box = await widget.locator("canvas").first().boundingBox();
  expect(box).not.toBeNull();
  const hits: Record<string, Hit> = {};
  for (let i = 0; i < 21 && Object.keys(hits).length < 3; i++)
    for (const cross of [0.5, 0.4, 0.6]) {
      const axis = (i + 0.5) / 21;
      const x = direction === "horizontal" ? axis : cross;
      const y = direction === "vertical" ? axis : cross;
      await page.mouse.move(0, 0);
      await expect(nativeTooltip(widget)).toHaveCount(0);
      await page.mouse.move(box!.x + box!.width * x, box!.y + box!.height * y);
      const tip = nativeTooltip(widget).last();
      try {
        await tip.waitFor({ state: "visible", timeout: 120 });
        const text = await tip.innerText();
        for (const [stage, usd] of Object.entries(expected))
          if (
            !hits[stage] &&
            text.includes(stage) &&
            text.includes("Level USD") &&
            text.includes(expectedBoxTooltipNumber(usd))
          )
            hits[stage] = { x, y, text };
      } catch {
        /* Only positively identified financial tooltips count as hits. */
      }
      if (Object.keys(hits).length === 3) break;
    }
  for (const stage of Object.keys(expected))
    expect(hits[stage], `${direction} actual ${stage} hit`).toBeDefined();
  const dx = hits["Net income"].x - hits.Revenue.x;
  const dy = hits["Net income"].y - hits.Revenue.y;
  expect(
    direction === "horizontal" ? dx : dy,
    "financial stages progress along selected axis",
  ).toBeGreaterThan(0.3);
  expect(
    direction === "horizontal" ? dx : dy,
    "selected axis dominates cross-axis motion",
  ).toBeGreaterThan(2 * (direction === "horizontal" ? Math.abs(dy) : Math.abs(dx)));
  expect(direction === "horizontal" ? Math.abs(dy) : Math.abs(dx)).toBeLessThan(0.21);
  await page.mouse.move(0, 0);
  return hits;
}

async function pixels(page: Page, widget: Locator): Promise<Pixels> {
  await stablePie(page, widget);
  await expect(nativeTooltip(widget)).toHaveCount(0);
  return widget
    .locator("canvas")
    .first()
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return {
        width: canvas.width,
        height: canvas.height,
        scale: canvas.width / canvas.getBoundingClientRect().width,
        data: [
          ...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
            .data,
        ],
      };
    });
}
const rgba = (p: Pixels, x: number, y: number) =>
  p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4);
const distance = (a: number[], b: number[]) =>
  Math.max(...a.map((channel, i) => Math.abs(channel - b[i])));
function sameSize(a: Pixels, b: Pixels) {
  expect([a.width, a.height, a.scale]).toEqual([b.width, b.height, b.scale]);
}
function patch(on: Pixels, off: Pixels, x: number, y: number) {
  const background = rgba(off, 0, 0);
  let onInk = 0;
  let offInk = 0;
  let unchanged = 0;
  const radius = Math.max(1, Math.round(2 * off.scale));
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const a = rgba(on, x + dx, y + dy);
      const b = rgba(off, x + dx, y + dy);
      onInk += Number(distance(a, background) > 8);
      offInk += Number(distance(b, background) > 8);
      unchanged += Number(distance(a, b) <= 2);
    }
  return { x, y, count: (radius * 2 + 1) ** 2, onInk, offInk, unchanged };
}
async function seriesEditor(page: Page, widget: Locator) {
  const editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  return editor;
}

export async function dropOffEffect(page: Page, widget: Locator) {
  let editor = await seriesEditor(page, widget);
  await toggle(editor, "Shadow", false);
  await toggle(editor, "Drop-Off", true);
  await collapse(editor);
  const on = await pixels(page, widget);
  editor = await seriesEditor(page, widget);
  await toggle(editor, "Drop-Off", false);
  await collapse(editor);
  const off = await pixels(page, widget);
  sameSize(on, off);
  editor = await seriesEditor(page, widget);
  await toggle(editor, "Shadow", true);
  await collapse(editor);
  const x = Math.round(off.width * 0.6);
  const background = rgba(off, 0, 0);
  const runs: { start: number; end: number }[] = [];
  for (let y = 0; y < off.height; y++) {
    if (distance(rgba(off, x, y), background) > 20) {
      if (!runs.length || runs.at(-1)!.end !== y - 1) runs.push({ start: y, end: y });
      else runs.at(-1)!.end = y;
    }
  }
  const bands = runs.filter((run) => run.end - run.start > 10 * off.scale);
  expect(bands, "five painted Funnel bands in off-image central slice").toHaveLength(5);
  const gap = patch(on, off, x, Math.round((bands[0].end + bands[1].start) / 2));
  expect(gap.onInk).toBe(gap.count);
  expect(gap.offInk).toBe(0);
  const neighbors = bands
    .slice(0, 2)
    .map((band) => patch(on, off, x, Math.round((band.start + band.end) / 2)));
  for (const neighbor of neighbors) {
    expect(neighbor.offInk).toBe(neighbor.count);
    expect(neighbor.unchanged).toBe(neighbor.count);
  }
  return { gap, neighbors, bands };
}

async function shadowNumbers(group: Locator, values: string[]) {
  for (const [index, label] of ["X Offset", "Y Offset", "Blur"].entries()) {
    const input = group.getByRole("spinbutton", {
      name: `${label} value`,
      exact: true,
    });
    await input.fill(values[index]);
    await input.blur();
    await expect(input).toHaveAttribute("aria-invalid", "false");
  }
}
export async function shadowEffect(page: Page, widget: Locator, gross: Hit) {
  let editor = await seriesEditor(page, widget);
  let group = editor.getByRole("group", { name: "Shadow", exact: true });
  const prior = await Promise.all(
    ["X Offset", "Y Offset", "Blur"].map((label) =>
      group
        .getByRole("spinbutton", { name: `${label} value`, exact: true })
        .inputValue(),
    ),
  );
  try {
    await shadowNumbers(group, ["10", "0", "0"]);
    await collapse(editor);
    const on = await pixels(page, widget);
    editor = await seriesEditor(page, widget);
    await toggle(editor, "Shadow", false);
    await collapse(editor);
    const off = await pixels(page, widget);
    sameSize(on, off);
    const y = Math.round(gross.y * off.height);
    const background = rgba(off, 0, 0);
    let edge = -1;
    for (let x = Math.round(off.width * 0.4); x < off.width; x++)
      if (distance(rgba(off, x, y), background) > 20) edge = x;
    expect(edge, "Gross profit interior edge avoids plot clipping").toBeGreaterThan(
      off.width * 0.5,
    );
    expect(edge).toBeLessThan(off.width - 20 * off.scale);
    const outside = patch(on, off, edge + Math.round(5 * off.scale), y);
    const inside = patch(on, off, edge - Math.round(6 * off.scale), y);
    expect(outside.offInk).toBe(0);
    expect(outside.onInk).toBeGreaterThan(outside.count * 0.8);
    expect(inside.offInk).toBe(inside.count);
    expect(inside.unchanged).toBe(inside.count);
    return { outside, inside, gross };
  } finally {
    editor = await seriesEditor(page, widget);
    await toggle(editor, "Shadow", true);
    group = editor.getByRole("group", { name: "Shadow", exact: true });
    await shadowNumbers(group, prior);
    await collapse(editor);
  }
}
