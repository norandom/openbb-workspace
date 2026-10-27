import { readFileSync } from "node:fs";
import type { Locator, Page, Response } from "@playwright/test";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { expect, loginDisposableWorkspace, test } from "./fixtures";

const widgetId = "equity_fundamental_income_fmp_obb";
const incomePath = "/data/api/v1/equity/fundamental/income";

function isIncome(response: Response) {
  const url = new URL(response.url());
  return url.pathname === incomePath && url.searchParams.get("symbol") === "AAPL";
}

async function revenueCell(widget: Locator, field: string) {
  const cell = widget.locator(`.ag-row[row-index="0"] [col-id="${field}"]`).first();
  // Column virtualization requires moving the real viewport, not reading grid internals.
  for (let step = 0; step < 25 && !(await cell.count()); step++) {
    await widget
      .locator(".ag-body-horizontal-scroll-viewport")
      .evaluate((element, position) => {
        element.scrollLeft = position;
      }, step * 450);
    await widget.page().waitForTimeout(60);
  }
  await expect(cell).toBeVisible();
  return cell;
}

function displayedNumber(text: string) {
  const cleaned = text.replace(/[,$\s]/g, "").toUpperCase();
  const match = /^(-?[\d.]+)([KMBT])?$/.exec(cleaned);
  if (!match)
    throw new Error("Revenue cell must display an interpretable financial amount");
  const scales: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return Number(match[1]) * (scales[match[2]] ?? 1);
}

async function verifyIncome(widget: Locator, response: Response) {
  expect(
    response.status(),
    "Live FMP entitlement and installed route must succeed",
  ).toBe(200);
  const url = new URL(response.url());
  expect(url.searchParams.get("provider")).toBe("fmp");
  expect(url.searchParams.get("period")).toBe("annual");
  const payload = await response.json();
  expect(Array.isArray(payload.results)).toBe(true);
  const row = payload.results[0];
  expect(row.symbol).toBe("AAPL");
  expect(row.reported_currency).toBe("USD");
  expect(row.period_ending).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Number(row.revenue)).toBeGreaterThan(0);
  await expect(await revenueCell(widget, "symbol")).toHaveText(row.symbol);
  await expect(await revenueCell(widget, "reported_currency")).toHaveText(
    row.reported_currency,
  );
  const period = await (await revenueCell(widget, "period_ending")).innerText();
  expect(new Date(period).toISOString().slice(0, 10)).toBe(row.period_ending);
  const revenue = displayedNumber(
    await (await revenueCell(widget, "revenue")).innerText(),
  );
  expect(Math.abs(revenue - row.revenue) / row.revenue).toBeLessThan(0.0001);
  return {
    symbol: row.symbol,
    currency: row.reported_currency,
    period_ending: row.period_ending,
    revenue: row.revenue,
    endpoint: incomePath,
    parameters: { symbol: "AAPL", provider: "fmp", period: "annual" },
  };
}

async function connectInstalledCatalog(page: Page) {
  await page.goto("/app/connections");
  await page
    .getByRole("button", { name: "Connect Backend", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Connect backend", exact: true }),
  });
  await dialog.getByPlaceholder("OpenBB App").fill("Installed QOpenBB data API");
  await dialog
    .getByPlaceholder("http://127.0.0.1:5056")
    .fill(`${process.env.WORKSPACE_FRONTEND_ORIGIN}/data`);
  const catalog = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/data/widgets.json",
  );
  await dialog.getByRole("button", { name: "Test", exact: true }).click();
  const response = await catalog;
  expect(response.status()).toBe(200);
  const definition = (await response.json())[widgetId];
  expect(definition.endpoint).toBe("/api/v1/equity/fundamental/income");
  expect(definition.data.dataKey).toBe("results");
  expect(
    definition.params.find(
      (param: { paramName: string }) => param.paramName === "period",
    ).value,
  ).toBe("annual");
  await expect(dialog.getByText("Test successful", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /^add$/i }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Apps", exact: true }).click();
  const starter = page.getByRole("button").filter({
    has: page.getByText("QOpenBB starter", { exact: true }),
  });
  await expect(starter).toBeVisible();
  return starter;
}

test("published Compose supports first login and live FMP annual income through its installed widget", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  const runtime = JSON.parse(
    readFileSync(process.env.WORKSPACE_RUNTIME_PRIVATE!, "utf8"),
  );
  expect(runtime.name).toMatch(/^qopenbb-browser-compose-/);
  expect(runtime.release_image_verified).toBe(true);
  expect(runtime.source_overlay).toBeNull();
  expect(runtime.images.workspace).toContain("@sha256:");
  expect(runtime.images["data-api"]).toContain("@sha256:");
  const diagnostics = await observeApplication(page);
  const firstLoginPaths: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) firstLoginPaths.push(new URL(frame.url()).pathname);
  });
  const emptyQuestionnaire = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/pro/pro-developer-onboarding-info",
  );
  await loginDisposableWorkspace(page);
  expect(firstLoginPaths).toContain("/onboarding");
  const questionnaire = await emptyQuestionnaire;
  expect(questionnaire.status()).toBe(200);
  expect(await questionnaire.json()).toBeNull();
  const starter = await connectInstalledCatalog(page);
  const response = page.waitForResponse(isIncome);
  await starter.click();
  const widget = page.locator(`.widget-${widgetId}`).last();
  await expect(widget).toBeVisible();
  const observation = await verifyIncome(widget, await response);
  const refreshed = page.waitForResponse(isIncome);
  await widget
    .locator("button")
    .filter({ has: page.locator('svg use[href$="#timer-icon"]') })
    .click();
  await verifyIncome(widget, await refreshed);
  await widget.screenshot({ path: info.outputPath("installed-fmp-income.png") });
  await info.attach("first-session-diagnostics", {
    contentType: "application/json",
    body: JSON.stringify(diagnostics),
  });
  expectApplicationDiagnostics(diagnostics);
  const context = await browser.newContext();
  try {
    const later = await context.newPage();
    const laterDiagnostics = await observeApplication(later);
    const laterLoginPaths: string[] = [];
    later.on("framenavigated", (frame) => {
      if (frame === later.mainFrame())
        laterLoginPaths.push(new URL(frame.url()).pathname);
    });
    await loginDisposableWorkspace(later);
    await expect(later.locator("#tabs")).toBeVisible();
    expect(laterLoginPaths.some((path) => /^\/app(?:\/|$)/.test(path))).toBe(true);
    expect(laterLoginPaths.some((path) => /^\/onboarding(?:\/|$)/.test(path))).toBe(
      false,
    );
    await info.attach("later-session-diagnostics", {
      contentType: "application/json",
      body: JSON.stringify(laterDiagnostics),
    });
    expectApplicationDiagnostics(laterDiagnostics);
  } finally {
    await context.close();
  }
  await info.attach("compose-live-income", {
    contentType: "application/json",
    body: JSON.stringify({
      release: runtime.release,
      images: runtime.images,
      retrieved_at: new Date().toISOString(),
      observation,
      firstLogin: {
        visitedOnboarding: firstLoginPaths.includes("/onboarding"),
        questionnaireStatus: questionnaire.status(),
        questionnaire: null,
      },
      diagnostics,
      limitation:
        "One installed income widget; no expanded provider, recovery or owner-server claim",
    }),
  });
});
