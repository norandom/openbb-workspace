import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

export type ThemeMode = "light" | "dark";
export type Settings = Record<
  ThemeMode,
  {
    chartTheme?: {
      baseTheme: string;
      palette: { fills: string[]; strokes: string[] };
      params: Record<string, unknown>;
    } | null;
    tableTheme?: unknown;
    appTheme?: unknown;
  } | null
>;

export async function openCharts(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname === "/api/pro/theme-settings",
  );
  await page.goto("/admin/theme-settings");
  const read = await response;
  expect(read.ok()).toBe(true);
  const settings: Settings = await read.json();
  await page.getByRole("tab", { name: "Charts", exact: true }).click();
  const charts = page.getByRole("tabpanel", { name: "Charts", exact: true });
  const preview = charts.getByTestId("chart-theme-preview");
  await expect(preview.locator("canvas")).toHaveCount(1);
  await expect(
    preview.getByRole("img", { name: /^Dolphin Interaction Data:/ }),
  ).toHaveCount(1);
  return { charts, preview, settings };
}

export async function mode(charts: Locator, value: ThemeMode) {
  await charts
    .getByRole("tab", {
      name: value === "light" ? "Light Mode" : "Dark Mode",
      exact: true,
    })
    .click();
  await expect(
    charts.getByRole("tab", {
      name: value === "light" ? "Light Mode" : "Dark Mode",
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
  // The existing form debounces the renderer by 300 ms; assertions then poll its output.
  await charts.page().waitForTimeout(350);
}

export async function section(charts: Locator, title: string) {
  const header = charts
    .getByRole("button")
    .filter({
      has: charts.page().getByRole("heading", { name: title, exact: true }),
    });
  if ((await header.getAttribute("aria-expanded")) !== "true")
    await header.click();
  return header.locator("..");
}

export async function parameter(charts: Locator, group: string, label: string) {
  const panel = await section(charts, group);
  // Existing labels are separate grid cells rather than HTML input labels.
  return panel
    .locator("label")
    .filter({ hasText: new RegExp(`^${label}:$`) })
    .locator("xpath=following-sibling::*[1]")
    .locator("input");
}

export async function setParameter(
  charts: Locator,
  group: string,
  label: string,
  value: string,
) {
  const input = await parameter(charts, group, label);
  await input.fill(value);
  await input.press("Tab");
  await charts.page().waitForTimeout(350);
  await expect(input).toHaveValue(value);
}

export async function saveTheme(
  page: Page,
  charts: Locator,
): Promise<Settings> {
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

export async function focusPoint(preview: Locator, expected: string) {
  const plot = preview.getByRole("img", { name: /^Dolphin Interaction Data:/ });
  await plot.focus();
  await expect(plot).toHaveAccessibleName(
    `Dolphin Interaction Data: ${expected}`,
  );
  await expect(
    preview.locator('[data-chart-keyboard="outline"]'),
  ).toBeVisible();
  const tooltip = preview.locator("[data-chart-theme-tooltip]");
  await expect(tooltip).toBeVisible();
  for (const part of expected.split(", "))
    await expect(tooltip).toContainText(part);
  return plot;
}

export async function pointGeometry(preview: Locator) {
  const host = await preview.boundingBox();
  const bar = await preview
    .locator('[data-chart-keyboard="outline"]')
    .boundingBox();
  expect(host).not.toBeNull();
  expect(bar).not.toBeNull();
  return {
    x: bar!.x - host!.x,
    y: bar!.y - host!.y,
    width: bar!.width,
    height: bar!.height,
  };
}

export async function pointerPoint(preview: Locator, expected: string) {
  await focusPoint(preview, expected);
  const bar = await preview
    .locator('[data-chart-keyboard="outline"]')
    .boundingBox();
  expect(bar).not.toBeNull();
  await preview.page().keyboard.press("Tab");
  await expect(preview.locator('[data-chart-keyboard="outline"]')).toBeHidden();
  await preview
    .page()
    .mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  const tip = preview.locator("[data-chart-theme-tooltip]");
  await expect(tip).toBeVisible();
  for (const part of expected.split(", "))
    await expect(tip).toContainText(part);
  return tip;
}

export function otherThemes(settings: Settings) {
  return Object.fromEntries(
    (["light", "dark"] as const).map((key) => [
      key,
      {
        tableTheme: settings[key]?.tableTheme ?? null,
        appTheme: settings[key]?.appTheme ?? null,
      },
    ]),
  );
}

// Observe actual public canvas text calls, as the retained widget observers do.
// The title anchor lets Padding assertions distinguish geometry from stored input.
export async function observePreviewTitle(page: Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      themePreviewTitle?: { x: number; y: number; font: string };
    };
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      if (
        String(args[0]) === "Dolphin Interaction Data" &&
        this.canvas.closest('[data-testid="chart-theme-preview"]')
      ) {
        const p = this.getTransform().transformPoint(
          new DOMPoint(args[1], args[2]),
        );
        const scale =
          this.canvas.getBoundingClientRect().width / this.canvas.width;
        target.themePreviewTitle = {
          x: p.x * scale,
          y: p.y * scale,
          font: this.font,
        };
      }
      return Reflect.apply(original, this, args);
    };
  });
}

export async function titleGeometry(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { themePreviewTitle?: unknown })
            .themePreviewTitle !== undefined,
      ),
    )
    .toBe(true);
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          themePreviewTitle: { x: number; y: number; font: string };
        }
      ).themePreviewTitle,
  );
}

export async function previewPaint(preview: Locator, colors: string[]) {
  return preview.locator("canvas").evaluate((element, colors) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const rgb = colors.map((color) =>
      [1, 3, 5].map((offset) =>
        Number.parseInt(color.slice(offset, offset + 2), 16),
      ),
    );
    const counts = rgb.map(() => 0);
    for (let i = 0; i < pixels.length; i += 4)
      for (let c = 0; c < rgb.length; c++)
        if (
          pixels[i + 3] === 255 &&
          rgb[c].every((value, channel) => pixels[i + channel] === value)
        )
          counts[c]++;
    return { background: [...pixels.slice(0, 4)], counts };
  }, colors);
}
