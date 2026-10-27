import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { exportChart } from "./actions";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { openEditor, saveDashboard } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import {
  chartWidget, chooseTab, connectGallery, contract, financialTooltip,
  gallery, galleryCard, observeGalleryPaint, resizeChart, settle,
  snapshot, verifyLineDates, verifySaved,
} from "./historical-gallery-helpers";
import { collapse } from "./hierarchy-controls";

const viewport = { width: 2400, height: 2100 };
const phase = process.env.QOPENBB_GALLERY_PHASE ?? "initial";
const retention = process.env.QOPENBB_GALLERY_RETENTION;
type Diagnostics = Awaited<ReturnType<typeof observeApplication>>;

async function darkTheme(page: Page) {
  if ((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark")) return;
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/pro/display-settings");
  await page.keyboard.press("Control+m");
  expect((await saved).ok()).toBe(true);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
}

async function readDashboard(page: Page, url: string) {
  const read = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname.endsWith("/pro/dash/validate-and-sync"));
  await page.goto(url);
  const response = await read;
  expect(response.ok()).toBe(true);
  const id = new URL(url).pathname.split("/").at(-1)!;
  return (await response.json()).owned[id].content;
}

function observeSnapshot(page: Page) {
  const reads: Promise<unknown>[] = [];
  const requested: string[] = [];
  const completed: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/data/")) requested.push(path);
  });
  page.on("response", (response) => {
    const match = /^\/data\/gallery\/data\/([^/]+)$/.exec(new URL(response.url()).pathname);
    if (!match) return;
    reads.push((async () => {
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(snapshot.datasets[match[1]]);
      completed.push(match[1]);
      return { dataset: match[1], rows: snapshot.datasets[match[1]].results.length };
    })());
    // Retain assertion failures for the final joined check without creating an
    // unhandled rejection while the browser continues collecting diagnostics.
    void reads.at(-1)!.catch(() => undefined);
  });
  return { reads, requested, completed };
}

test("historical gallery actual Apps 36 charts screenshots and retained redeployment", async ({ page, browser }, info) => {
  test.setTimeout(900000);
  if (!retention || !["initial", "reopen"].includes(phase))
    throw Error("QOPENBB_GALLERY_PHASE initial|reopen and QOPENBB_GALLERY_RETENTION required");
  const allowedRoot = resolve("artifacts/historical-gallery/browser");
  if (!resolve(retention).startsWith(`${allowedRoot}/`) && !resolve(retention).startsWith(`${allowedRoot}\\`))
    throw Error("Retention record must stay in ignored gallery browser artifacts");
  await page.setViewportSize(viewport);
  const diagnostics: Diagnostics[] = [await observeApplication(page)];
  const data = [observeSnapshot(page)];
  await observeGalleryPaint(page);
  const records: unknown[] = [];
  const screenshots: unknown[] = [];
  const evidence: Record<string, unknown> = {
    phase, snapshotId: snapshot.snapshotId, diagnostics, records, screenshots,
    workspaceImage: process.env.QOPENBB_CANDIDATE_IMAGE,
    workspaceSource: process.env.QOPENBB_CANDIDATE_SOURCE,
    captureTheme: "dark", viewport,
    limitations: "Browser tooltips sample each actual chart; complete financial projection correctness is separately reviewed. Compose recreation is controller-owned between invocations.",
  };
  let savedURL = "";
  let expectedLayout: unknown;
  try {
    await loginDisposableWorkspace(page);
    if (phase === "initial") {
      await connectGallery(page);
      savedURL = page.url();
    } else {
      const previous = JSON.parse(await readFile(retention, "utf8"));
      expect(previous.snapshotId).toBe(snapshot.snapshotId);
      expect(previous.snapshotSha256).toBe(createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"));
      savedURL = `${process.env.WORKSPACE_FRONTEND_ORIGIN}${previous.dashboardPath}`;
      const restored = await readDashboard(page, savedURL);
      verifySaved(restored, true);
      expect(restored.data.gridLayout).toEqual(previous.gridLayout);
      expectedLayout = previous.gridLayout;
      records.push({ stage: "after-compose-recreation", widgetCount: restored.data.widgets.length, gridLayout: restored.data.gridLayout, nativeNumberOfChanges: restored.data.numberOfChanges ?? null });
    }
    await chooseTab(page, "Overview");
    if (phase === "initial") await darkTheme(page);
    else await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    const overview = gallery.tabs.Overview.layout;
    const overviewDatasets = [...new Set(overview.map((item: { i: string }) => contract.charts[item.i.replace("qopenbb_gallery_", "")].datasetId))];
    await expect.poll(() => overviewDatasets.every((id) => data[0].completed.includes(String(id)))).toBe(true);
    const boxes = [];
    for (const item of overview) {
      const type = item.i.replace("qopenbb_gallery_", "");
      const widget = chartWidget(page, type);
      const measured = await settle(page, widget);
      expect(measured.text.join(" ")).toContain(contract.charts[type].title);
      if (phase === "reopen" && type === "line") records.push({ stage: "restored-line-trading-session-axis", ...verifyLineDates(measured) });
      const box = await widget.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.width).toBeGreaterThan(450);
      expect(box!.height).toBeGreaterThan(350);
      boxes.push({ type, box });
    }
    expect(boxes).toHaveLength(12);
    expect(new Set(boxes.map(({ box }) => Math.round(box!.x / 10))).size).toBe(4);
    expect(new Set(boxes.map(({ box }) => Math.round(box!.y / 10))).size).toBe(3);
    // Other chart settles can overlap the last render of a sibling; require
    // one final stable pass across the complete overview before its capture.
    for (const item of overview) await settle(page, chartWidget(page, item.i.replace("qopenbb_gallery_", "")));
    await page.locator("main").screenshot({ path: info.outputPath("historical-gallery-overview.png") });
    screenshots.push({ file: "historical-gallery-overview.png", boxes });

    if (phase === "initial") {
      const visited = new Set<string>();
      for (const tab of Object.values(gallery.tabs) as { name: string; layout: { i: string }[] }[]) {
        if (tab.name === "Overview") continue;
        await chooseTab(page, tab.name);
        for (const item of tab.layout) {
          const type = item.i.replace("qopenbb_gallery_", "");
          const widget = chartWidget(page, type);
          const size = await resizeChart(page, widget);
          const measured = await settle(page, widget);
          expect(measured.text.join(" ")).toContain(contract.charts[type].title);
          if (type === "line") records.push({ stage: "line-trading-session-axis", ...verifyLineDates(measured) });
          const tooltip = await financialTooltip(page, widget, type);
          records.push({ stage: "chart", type, tab: tab.name, size, tooltip, drawnText: measured.text });
          await settle(page, widget);
          await widget.screenshot({ path: info.outputPath(`${type}.png`) });
          screenshots.push({ file: `${type}.png`, type, tab: tab.name, size });
          visited.add(type);
        }
      }
      expect([...visited].sort()).toEqual(Object.keys(contract.charts).sort());
    }
    await chooseTab(page, "Combinations");
    const combo = chartWidget(page, "customCombo");
    const editor = await openEditor(page, combo);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    const assignment = editor.getByRole("combobox", { name: /Net income.*series type/i });
    await expect(assignment).toHaveValue(phase === "initial" ? "line" : "area");
    await expect(editor.getByRole("switch", { name: /Basic EPS.*Secondary Axis/i })).toBeChecked();
    if (phase === "initial") await assignment.selectOption("area");
    await expect(assignment).toHaveValue("area");
    await collapse(editor);
    const fixed = page.waitForResponse((r) => new URL(r.url()).pathname === "/data/gallery/data/income-combinations");
    await combo.locator("button").filter({ has: page.locator('svg use[href$="#timer-icon"]') }).click();
    const refreshed = await fixed;
    expect(await refreshed.json()).toEqual(snapshot.datasets["income-combinations"]);
    await settle(page, combo);
    records.push({ stage: "edited-refreshed", tooltip: await financialTooltip(page, combo, "customCombo") });
    await settle(page, combo);
    await exportChart(page, combo, info);
    const id = new URL(savedURL).pathname.split("/").at(-1)!;
    // Native save posts only dirty dashboards. The initial journey edits the
    // layout and combo; recreation verifies the already persisted state.
    const content = phase === "initial"
      ? (await saveDashboard(page)).items[id]
      : await readDashboard(page, savedURL);
    verifySaved(content, true);
    records.push({ stage: "saved-native-counter", nativeNumberOfChanges: content.data.numberOfChanges ?? null });
    if (phase === "reopen") {
      expect(content.data.gridLayout).toEqual(expectedLayout);
      // Native template selection can reuse another zero-counter dashboard.
      // Preserve the edited original regardless of which gallery is opened.
      await galleryCard(page);
      await expect(page.locator("main").getByRole("button", { name: "Overview", exact: true })).toBeVisible();
      const openedId = new URL(page.url()).pathname.split("/").at(-1)!;
      const opened = await readDashboard(page, page.url());
      expect(opened.data.templateId).toBe(content.data.templateId);
      expect(opened.data.name.startsWith(gallery.name)).toBe(true);
      records.push({ stage: "native-template-card", originalNativeNumberOfChanges: content.data.numberOfChanges ?? null,
        openedId, openedOriginal: openedId === id, openedName: opened.data.name });
      const preserved = await readDashboard(page, savedURL);
      verifySaved(preserved, true);
      expect(preserved.data.gridLayout).toEqual(expectedLayout);
    }
    else {
      expectedLayout = content.data.gridLayout;
      await writeFile(retention, JSON.stringify({
        snapshotId: snapshot.snapshotId,
        snapshotSha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
        dashboardPath: new URL(savedURL).pathname,
        gridLayout: expectedLayout,
      }, null, 2));
    }
    const fresh = await browser.newContext({ baseURL: process.env.WORKSPACE_FRONTEND_ORIGIN, viewport, serviceWorkers: "block" });
    try {
      const later = await fresh.newPage();
      diagnostics.push(await observeApplication(later));
      data.push(observeSnapshot(later));
      await observeGalleryPaint(later);
      await loginDisposableWorkspace(later);
      await expect(later.locator("html")).toHaveClass(/\bdark\b/);
      const restored = await readDashboard(later, savedURL);
      verifySaved(restored, true);
      expect(restored.data.gridLayout).toEqual(expectedLayout);
      await chooseTab(later, "Combinations");
      const reopened = chartWidget(later, "customCombo");
      await settle(later, reopened);
      records.push({ stage: "fresh-reopen", tooltip: await financialTooltip(later, reopened, "customCombo") });
      const restoredEditor = await openEditor(later, reopened);
      await restoredEditor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await expect(restoredEditor.getByRole("combobox", { name: /Net income.*series type/i })).toHaveValue("area");
      await collapse(restoredEditor);
      await settle(later, reopened);
      await reopened.screenshot({ path: info.outputPath("customCombo-fresh-reopen.png") });
    } finally { await fresh.close(); }
  } catch (error) {
    const main = page.locator("main");
    if (/^\/app\/[^/]+/.test(new URL(page.url()).pathname) && await main.getByRole("button", { name: "Overview", exact: true }).isVisible()) {
      // Capture only the authenticated gallery surface, excluding login fields
      // and account chrome, so a render failure remains visually reviewable.
      try {
        await main.screenshot({ path: info.outputPath("gallery-failure.png") });
        evidence.failureScreenshot = "gallery-failure.png";
      } catch (captureError) { evidence.failureScreenshotError = String(captureError); }
    }
    throw error;
  } finally {
    evidence.snapshotResponses = await Promise.all(data.flatMap((d) => d.reads).map(async (p) => {
      try { return { ok: true, result: await p }; }
      catch (error) { return { ok: false, error: String(error) }; }
    }));
    evidence.dataRequests = data.flatMap((d) => d.requested);
    await writeFile(info.outputPath("historical-gallery-journey.json"), JSON.stringify(evidence, null, 2));
  }
  for (const item of diagnostics) expectApplicationDiagnostics(item);
  expect((evidence.snapshotResponses as { ok: boolean }[]).every((r) => r.ok)).toBe(true);
  const capturedDatasets = [...new Set((evidence.snapshotResponses as { result?: { dataset: string } }[]).map((r) => r.result?.dataset))].sort();
  if (phase === "initial") expect(capturedDatasets).toEqual(Object.keys(snapshot.datasets).sort());
  else expect(capturedDatasets).toEqual(expect.arrayContaining([...new Set([
    ...gallery.tabs.Overview.layout.map((item: { i: string }) => contract.charts[item.i.replace("qopenbb_gallery_", "")].datasetId),
    "income-combinations",
  ])]));
  expect((evidence.dataRequests as string[]).filter((p) => p.startsWith("/data/api/")), "snapshot charts do not call live providers").toEqual([]);
});
