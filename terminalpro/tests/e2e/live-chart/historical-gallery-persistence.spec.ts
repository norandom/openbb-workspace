import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { exportChart } from "./actions";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { openEditor, saveDashboard } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { collapse } from "./hierarchy-controls";
import {
  chartWidget,
  chooseTab,
  connectGallery,
  contract,
  financialTooltip,
  gallery,
  galleryCard,
  observeGalleryPaint,
  resizeChart,
  settle,
  snapshot,
  verifySaved,
} from "./historical-gallery-helpers";

const viewport = { width: 2400, height: 2100 };
const snapshotSha256 = createHash("sha256")
  .update(JSON.stringify(snapshot))
  .digest("hex");

// Compare every native saved chart model and assignment, including family-only
// storage, while excluding unrelated account and connection configuration.
function retainedState(content: any) {
  return {
    gridLayout: content.data.gridLayout,
    widgets: content.data.widgets
      .filter((w: any) => w.widgetId.startsWith("qopenbb_gallery_"))
      .map((w: any) => ({
        id: w.id,
        widgetId: w.widgetId,
        chartView: w.storage.chartView,
        chartState: w.storage.default,
        filterModel: w.data.table.filterModel,
      }))
      .sort((a: any, b: any) => a.widgetId.localeCompare(b.widgetId)),
  };
}

async function readDashboard(page: Page, url: string) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname.endsWith("/pro/dash/validate-and-sync"),
  );
  await page.goto(url);
  const read = await response;
  expect(read.ok()).toBe(true);
  return (await read.json()).owned[new URL(url).pathname.split("/").at(-1)!].content;
}

function observeData(page: Page) {
  const requests: string[] = [];
  const reads: Promise<{ dataset: string; rows: number }>[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/data/")) requests.push(path);
  });
  page.on("response", (response) => {
    const match = /^\/data\/gallery\/data\/([^/]+)$/.exec(
      new URL(response.url()).pathname,
    );
    if (!match) return;
    const check = (async () => {
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(snapshot.datasets[match[1]]);
      return { dataset: match[1], rows: snapshot.datasets[match[1]].results.length };
    })();
    reads.push(check);
    void check.catch(() => undefined);
  });
  return { requests, reads };
}

async function darkTheme(page: Page) {
  if ((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark"))
    return;
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/pro/display-settings",
  );
  await page.keyboard.press("Control+m");
  expect((await saved).ok()).toBe(true);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
}
async function comboProof(page: Page, edited: boolean) {
  await chooseTab(page, "Combinations");
  const widget = chartWidget(page, "customCombo");
  const drawing = await settle(page, widget);
  expect(drawing.text.join(" ")).toContain(contract.charts.customCombo.title);
  const tooltip = await financialTooltip(page, widget, "customCombo");
  const existing = widget.getByRole("complementary", { name: "Chart editor" });
  const editor = (await existing.isVisible())
    ? existing
    : await openEditor(page, widget);
  await settle(page, widget);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(
    editor.getByRole("combobox", { name: /Net income.*series type/i }),
  ).toHaveValue(edited ? "area" : "line");
  await expect(
    editor.getByRole("switch", { name: /Basic EPS.*Secondary Axis/i }),
  ).toBeChecked();
  return { widget, editor, tooltip };
}

test("historical gallery bounded native save fresh reopen and retained recreation", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  const phase = process.env.QOPENBB_GALLERY_PHASE;
  const retention = process.env.QOPENBB_GALLERY_RETENTION;
  if (!retention || !["initial", "reopen"].includes(phase ?? ""))
    throw Error("Explicit initial|reopen phase and retention required");
  const suffix = relative(
    resolve("artifacts/historical-gallery/persistence"),
    resolve(retention),
  );
  if (!suffix || suffix.startsWith("..") || isAbsolute(suffix))
    throw Error("Use ignored persistence retention path");
  if (phase === "initial")
    await readFile(retention).then(
      () => {
        throw Error("Initial retention path already exists; choose a new checkpoint");
      },
      (error) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
  const diagnostics = [await observeApplication(page)];
  const data = [observeData(page)];
  const records: unknown[] = [];
  const evidence: Record<string, unknown> = {
    phase,
    snapshotSha256,
    records,
    diagnostics,
    workspaceImage: process.env.QOPENBB_CANDIDATE_IMAGE,
    workspaceSource: process.env.QOPENBB_CANDIDATE_SOURCE,
    boundary:
      "Bounded persistence only; all-chart financial/capture evidence is separate. Compose recreation is controller-owned.",
  };
  let savedURL = "";
  let expected: ReturnType<typeof retainedState>;
  try {
    await page.setViewportSize(viewport);
    await observeGalleryPaint(page);
    await loginDisposableWorkspace(page);
    if (phase === "initial") {
      await connectGallery(page);
      savedURL = page.url();
      await darkTheme(page);
      await chooseTab(page, "Combinations");
      const widget = chartWidget(page, "customCombo");
      await settle(page, widget);
      records.push({
        stage: "native-layout-change",
        ...(await resizeChart(page, widget)),
      });
      // Keep the first mounted AppCard edit: no close/reopen workaround or retry.
      const proof = await comboProof(page, false);
      await proof.editor
        .getByRole("combobox", { name: /Net income.*series type/i })
        .selectOption("area");
      await expect(
        proof.editor.getByRole("combobox", { name: /Net income.*series type/i }),
      ).toHaveValue("area");
      await collapse(proof.editor);
      const refreshed = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/data/gallery/data/income-combinations",
      );
      await widget
        .locator("button")
        .filter({ has: page.locator('svg use[href$="#timer-icon"]') })
        .click();
      const response = await refreshed;
      expect(response.ok()).toBe(true);
      expect(await response.json()).toEqual(snapshot.datasets["income-combinations"]);
      await settle(page, widget);
      records.push({
        stage: "edited-native-refresh",
        tooltip: await financialTooltip(page, widget, "customCombo"),
      });
      await settle(page, widget);
      await exportChart(page, widget, info);
      const id = new URL(savedURL).pathname.split("/").at(-1)!;
      const saved = (await saveDashboard(page)).items[id];
      verifySaved(saved, true);
      expected = retainedState(saved);
      records.push({
        stage: "native-save",
        widgets: expected.widgets.length,
        nativeNumberOfChanges: saved.data.numberOfChanges ?? null,
        tooltip: proof.tooltip,
      });
    } else {
      const previous = JSON.parse(await readFile(retention, "utf8"));
      expect(previous.snapshotSha256).toBe(snapshotSha256);
      expect(previous.phase).toBe("initial-complete");
      expect(previous.workspaceImage).toBe(process.env.QOPENBB_CANDIDATE_IMAGE);
      expect(previous.workspaceSource).toBe(process.env.QOPENBB_CANDIDATE_SOURCE);
      savedURL = `${process.env.WORKSPACE_FRONTEND_ORIGIN}${previous.dashboardPath}`;
      expected = previous.state;
      const restored = await readDashboard(page, savedURL);
      verifySaved(restored, true);
      expect(retainedState(restored)).toEqual(expected);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      const proof = await comboProof(page, true);
      await collapse(proof.editor);
      records.push({
        stage: "after-controller-compose-recreation",
        tooltip: proof.tooltip,
      });
    }
    if (phase === "reopen") {
      const original = await readDashboard(page, savedURL);
      await galleryCard(page);
      await expect(
        page.locator("main").getByRole("button", { name: "Overview", exact: true }),
      ).toBeVisible();
      const openedURL = page.url();
      const opened = await readDashboard(page, openedURL);
      expect(opened.data.templateId).toBe(original.data.templateId);
      expect(opened.data.name.startsWith(gallery.name)).toBe(true);
      records.push({
        stage: "native-template-card",
        originalNativeNumberOfChanges: original.data.numberOfChanges ?? null,
        openedNativeNumberOfChanges: opened.data.numberOfChanges ?? null,
        openedOriginal: new URL(openedURL).pathname === new URL(savedURL).pathname,
        openedName: opened.data.name,
      });
      const preserved = await readDashboard(page, savedURL);
      verifySaved(preserved, true);
      expect(retainedState(preserved)).toEqual(expected);
    }
    const fresh = await browser.newContext({
      baseURL: process.env.WORKSPACE_FRONTEND_ORIGIN,
      viewport,
      serviceWorkers: "block",
    });
    try {
      const later = await fresh.newPage();
      diagnostics.push(await observeApplication(later));
      data.push(observeData(later));
      await observeGalleryPaint(later);
      await loginDisposableWorkspace(later);
      await expect(later.locator("html")).toHaveClass(/\bdark\b/);
      const restored = await readDashboard(later, savedURL);
      verifySaved(restored, true);
      expect(retainedState(restored)).toEqual(expected);
      const proof = await comboProof(later, true);
      await collapse(proof.editor);
      await settle(later, proof.widget);
      await proof.widget.screenshot({
        path: info.outputPath("customCombo-retained.png"),
      });
      records.push({
        stage: "fresh-authenticated-reopen",
        tooltip: proof.tooltip,
        widgets: expected.widgets.length,
      });
    } finally {
      await fresh.close();
    }
    for (const observed of diagnostics) expectApplicationDiagnostics(observed);
    const responses = await Promise.all(data.flatMap((d) => d.reads));
    expect(responses.map((r) => r.dataset)).toContain("income-combinations");
    expect(
      data.flatMap((d) => d.requests).filter((path) => path.startsWith("/data/api/")),
    ).toEqual([]);
    evidence.snapshotResponses = responses;
    // Failed initial runs never create an eligible recreation checkpoint.
    if (phase === "initial")
      await writeFile(
        retention,
        JSON.stringify(
          {
            phase: "initial-complete",
            snapshotSha256,
            workspaceImage: process.env.QOPENBB_CANDIDATE_IMAGE,
            workspaceSource: process.env.QOPENBB_CANDIDATE_SOURCE,
            dashboardPath: new URL(savedURL).pathname,
            state: expected,
          },
          null,
          2,
        ),
      );
  } finally {
    evidence.dataRequests = data.flatMap((d) => d.requests);
    evidence.snapshotResponses = await Promise.all(
      data
        .flatMap((d) => d.reads)
        .map(async (read) => {
          try {
            return { ok: true, result: await read };
          } catch (error) {
            return { ok: false, error: String(error) };
          }
        }),
    );
    await writeFile(
      info.outputPath("historical-gallery-persistence.json"),
      JSON.stringify(evidence, null, 2),
    );
  }
});
