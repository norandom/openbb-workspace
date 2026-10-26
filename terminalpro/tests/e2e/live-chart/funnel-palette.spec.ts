import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { exportChart } from "./actions";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
import {
  expectApplicationDiagnostics,
  observeApplication,
  observeDrawnText,
} from "./diagnostics";
import { openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { collapse } from "./hierarchy-controls";
import { nativeTooltip } from "./hierarchy-observer";
import { importOrdinaryTable } from "./journey";
import {
  currentPie,
  growPieWidget,
  observePie,
  stablePie,
  toggle,
} from "./pie-observer";
import { chartModel } from "./xy-observer";

const colors = ["#D81B60", "#00897B"];
const stages = [
  "Revenue",
  "Gross profit",
  "Operating income",
  "Pretax income",
  "Net income",
];
const amounts = [111184000000, 54781000000, 35885000000, 35833000000, 29578000000];
const title = "AAPL retained USD custom Cone palette";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function themeNullEquivalent(settings: Record<string, unknown> | null | undefined) {
  // Backend ThemeSettings declares these three nullable fields with None defaults.
  // Response serialization may materialize omitted keys; unknown keys still count.
  return Object.fromEntries(
    Object.entries(settings ?? {}).filter(
      ([key, value]) =>
        !["chartTheme", "tableTheme", "appTheme"].includes(key) || value != null,
    ),
  );
}

async function paletteUI(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname === "/api/pro/theme-settings",
  );
  await page.goto("/admin/theme-settings");
  const read = await response;
  expect(read.ok()).toBe(true);
  const settings = await read.json();
  await page.getByRole("tab", { name: "Charts", exact: true }).click();
  const charts = page.getByRole("tabpanel", { name: "Charts", exact: true });
  await charts.getByRole("tab", { name: "Light Mode", exact: true }).click();
  const palette = charts
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "Palette", exact: true }) });
  if ((await palette.getAttribute("aria-expanded")) !== "true") await palette.click();
  return {
    charts,
    hex: palette.locator("..").getByRole("textbox", { name: "Hex color", exact: true }),
    settings,
  };
}

async function saveTheme(page: Page, charts: Locator) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      new URL(r.url()).pathname === "/api/admin/theme-settings",
  );
  await charts.getByRole("button", { name: "Save Theme", exact: true }).click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).success).not.toBe(false);
  return saved.request().postDataJSON();
}

async function userMode(page: Page, dark: boolean) {
  await page.goto("/app/settings");
  const radio = page.getByRole("radio", { name: dark ? /^Dark mode/ : /^Light mode/ });
  await expect(radio).toBeVisible();
  if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(
      async () =>
        (await page.locator("html").getAttribute("class"))
          ?.split(" ")
          .includes("dark") ?? false,
    )
    .toBe(dark);
}

async function financial(page: Page, widget: Locator) {
  const drawing = await currentPie(page, widget);
  expect(drawing.text.map((t) => t.text)).toEqual(
    expect.arrayContaining([title, ...stages]),
  );
  const box = await widget.locator("canvas").first().boundingBox();
  expect(box).not.toBeNull();
  const texts = new Set<string>();
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(
      box!.x + box!.width / 2,
      box!.y + (box!.height * (i + 0.5)) / 15,
    );
    const tip = nativeTooltip(widget).last();
    try {
      await tip.waitFor({ state: "visible", timeout: 180 });
      texts.add(await tip.innerText());
    } catch {
      /* Require the two retained endpoint observations below. */
    }
  }
  for (const index of [0, 4])
    expect(
      [...texts].some(
        (text) =>
          text.includes(stages[index]) &&
          text.includes("Level USD") &&
          text.includes(expectedBoxTooltipNumber(amounts[index])),
      ),
      `${stages[index]} formatted retained USD tooltip`,
    ).toBe(true);
  await page.mouse.move(0, 0);
  return { drawing, tooltips: [...texts] };
}

async function paintedExport(page: Page, widget: Locator, info: TestInfo) {
  await stablePie(page, widget);
  const drawing = await currentPie(page, widget);
  const labels = drawing.text.filter((t) => [title, ...stages].includes(t.text));
  expect(new Set(labels.map((t) => t.text)).size).toBe(6);
  const source = await widget
    .locator("canvas")
    .first()
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return {
        url: canvas.toDataURL(),
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
      };
    });
  await exportChart(page, widget, info);
  const bytes = await readFile(info.outputPath("saved-ordinary-observations.png"));
  const result = await page.evaluate(
    async ({ source, exported, colors, labels }) => {
      const decode = async (url: string) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0, source.width, source.height);
        return context.getImageData(0, 0, source.width, source.height).data;
      };
      const [a, b] = await Promise.all([decode(source.url), decode(exported)]);
      const rgb = colors.map((color) =>
        [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)),
      );
      const colorAt = (data: Uint8ClampedArray, index: number, color: number[]) =>
        data[index + 3] > 240 &&
        color.every((channel, k) => Math.abs(data[index + k] - channel) <= 3);
      const colorCounts = rgb.map((color) => {
        let painted = 0;
        let exported = 0;
        for (let i = 0; i < a.length; i += 4) {
          painted += Number(colorAt(a, i, color));
          exported += Number(colorAt(b, i, color));
        }
        return { painted, exported };
      });
      const scale = source.width / source.cssWidth;
      const regions = labels.map((label) => ({
        kind: label.text,
        x: label.bounds.x - 1,
        y: label.bounds.y - 1,
        width: label.bounds.width + 2,
        height: label.bounds.height + 2,
      }));
      const text = regions.map((region) => {
        let ink = 0;
        let exportedInk = 0;
        let sameInk = 0;
        const background = [...a.slice(0, 4)];
        const isInk = (data: Uint8ClampedArray, i: number) =>
          data[i + 3] > 0 &&
          [0, 1, 2].some((c) => Math.abs(data[i + c] - background[c]) > 20);
        for (
          let y = Math.max(0, Math.floor(region.y * scale));
          y < Math.min(source.height, (region.y + region.height) * scale);
          y++
        )
          for (
            let x = Math.max(0, Math.floor(region.x * scale));
            x < Math.min(source.width, (region.x + region.width) * scale);
            x++
          ) {
            const i = (y * source.width + x) * 4;
            if (isInk(a, i)) {
              ink++;
              sameInk += Number(
                [0, 1, 2, 3].every((c) => Math.abs(a[i + c] - b[i + c]) <= 6),
              );
            }
            exportedInk += Number(isInk(b, i));
          }
        return { kind: region.kind, ink, exportedInk, sameInkFraction: sameInk / ink };
      });
      const interiors = rgb.map((color) => {
        for (let y = 4; y < source.height - 4; y += 4)
          for (let x = 4; x < source.width - 4; x += 4) {
            let filled = true;
            let same = 0;
            for (let dy = -3; dy <= 3; dy++)
              for (let dx = -3; dx <= 3; dx++) {
                const i = ((y + dy) * source.width + x + dx) * 4;
                filled &&= colorAt(a, i, color);
                same += Number(colorAt(b, i, color));
              }
            if (filled) return { x, y, pixels: 49, exportedMatches: same };
          }
        return null;
      });
      return { colorCounts, interiors, text };
    },
    {
      source,
      exported: `data:image/png;base64,${bytes.toString("base64")}`,
      colors,
      labels,
    },
  );
  for (const count of result.colorCounts) {
    expect(count.painted).toBeGreaterThan(500);
    expect(count.exported).toBeGreaterThan(500);
  }
  for (const interior of result.interiors) {
    expect(interior).not.toBeNull();
    expect(interior!.exportedMatches).toBe(49);
  }
  for (const text of result.text) {
    expect(text.ink, text.kind).toBeGreaterThan(5);
    expect(text.exportedInk, text.kind).toBeGreaterThan(5);
    expect(text.sameInkFraction, text.kind).toBeGreaterThan(0.95);
  }
  return result;
}

test("Funnel Cone valid public palette save financial paint and PNG export", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  await observePie(page);
  await observeDrawnText(page);
  const csv = await readFile("artifacts/chart-funnel/fmp/levels.csv", "utf8");
  const provenance = JSON.parse(
    await readFile("artifacts/chart-funnel/fmp/provenance.json", "utf8"),
  );
  expect(createHash("sha256").update(csv).digest("hex")).toBe(provenance.csv_sha256);
  expect(
    csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((row) => row.split(",")),
  ).toEqual(stages.map((stage, i) => [stage, String(amounts[i])]));
  const evidence: Record<string, unknown> = {
    identity,
    diagnostics,
    fixture: { sha256: provenance.csv_sha256 },
    colors,
    limitations:
      "Retained FMP data and disposable runtime only. Requires prior chartTheme null in both modes; reset restores the light chart null semantic, not arbitrary custom configuration. Advanced/invalid palettes are not exercised.",
  };
  let edited = false;
  let priorDark = false;
  let darkHash = "";
  let priorDarkSettings: Record<string, unknown> = {};
  try {
    await loginDisposableWorkspace(page);
    priorDark =
      (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ??
      false;
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      csv,
      name: "FMP Cone public palette",
      expectedValue: "Net income",
    });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    const editor = await openEditor(page, widget);
    await selectFamily(editor, "Cone Funnel");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("Stage");
    const remove = editor.getByRole("button", { name: /^Remove / });
    while (await remove.count()) await remove.first().click();
    await editor
      .getByRole("combobox", { name: "Add a series", exact: true })
      .selectOption({ label: "Level USD" });
    await toggle(editor, "Aggregate", false);
    await setChartTitle(page, editor, title);
    await collapse(editor);
    const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    await saveDashboard(page);
    const ui = await paletteUI(page);
    expect(
      ui.settings.light?.chartTheme ?? null,
      "guard before edits: no prior custom light chart theme",
    ).toBeNull();
    expect(
      ui.settings.dark?.chartTheme ?? null,
      "guard before edits: no prior custom dark chart theme",
    ).toBeNull();
    priorDarkSettings = themeNullEquivalent(ui.settings.dark);
    darkHash = hash(priorDarkSettings);
    evidence.prior = {
      lightChartTheme: null,
      darkHash,
      palette: await ui.hex.evaluateAll((elements) =>
        elements.map((element) => (element as HTMLInputElement).value),
      ),
    };
    await ui.hex.nth(0).fill(colors[0]);
    await ui.hex.nth(0).press("Tab");
    await ui.hex.nth(2).fill(colors[1]);
    await ui.hex.nth(2).press("Tab");
    edited = true;
    const saved = await saveTheme(page, ui.charts);
    expect(saved.light.chartTheme.palette.fills.slice(0, 2)).toEqual(colors);
    await userMode(page, false);
    await page.goto(dashboardUrl);
    const restored = page
      .locator('[class*="widget-file-"]')
      .filter({ has: page.locator("#chart-view-button") })
      .last();
    evidence.financial = await financial(page, restored);
    evidence.export = await paintedExport(page, restored, info);
    const model = chartModel((await saveDashboard(page)).items[id]);
    expect(model.chartType).toBe("coneFunnel");
    expect(model.cellRange.columns).toEqual(["Stage", "LevelUSD"]);
    expect(model.chartOptions["cone-funnel"].title).toMatchObject({
      enabled: true,
      text: title,
    });
    await restored.screenshot({ path: info.outputPath("custom-cone-visible.png") });
  } finally {
    try {
      if (edited) {
        try {
          const ui = await paletteUI(page);
          await ui.charts.getByRole("button", { name: "Reset", exact: true }).click();
          const restored = await saveTheme(page, ui.charts);
          const teardown = {
            lightChartTheme: restored.light?.chartTheme ?? null,
            priorDarkHash: darkHash,
            savedDarkHash: hash(themeNullEquivalent(restored.dark)),
            savedDarkKeys: Object.keys(restored.dark ?? {}),
            reread: null as null | {
              lightChartTheme: unknown;
              darkHash: string;
              darkKeys: string[];
            },
            confirmedByRead: false,
          };
          evidence.restored = teardown;
          expect(restored.light.chartTheme).toBeNull();
          expect(themeNullEquivalent(restored.dark)).toEqual(priorDarkSettings);
          const reread = await paletteUI(page);
          teardown.reread = {
            lightChartTheme: reread.settings.light?.chartTheme ?? null,
            darkHash: hash(themeNullEquivalent(reread.settings.dark)),
            darkKeys: Object.keys(reread.settings.dark ?? {}),
          };
          expect(reread.settings.light?.chartTheme ?? null).toBeNull();
          expect(themeNullEquivalent(reread.settings.dark)).toEqual(priorDarkSettings);
          teardown.confirmedByRead = true;
        } finally {
          evidence.restoredUserMode = { dark: priorDark, completed: false };
          await userMode(page, priorDark);
          evidence.restoredUserMode = { dark: priorDark, completed: true };
        }
      }
      expectApplicationDiagnostics(diagnostics);
    } finally {
      await writeFile(
        info.outputPath("public-palette-journey.json"),
        JSON.stringify(evidence, null, 2),
      );
    }
  }
});
