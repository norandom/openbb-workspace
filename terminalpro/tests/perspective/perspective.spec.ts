import { expect, type Page, test } from "@playwright/test";

async function observe(page: Page, failWorker = false) {
  await page.addInitScript(
    ({ failWorker }) => {
      const NativeWorker = window.Worker;
      const state = { created: 0, active: 0, terminated: 0, fail: failWorker };
      Object.assign(window, { workerEvidence: state });
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (state.fail) throw new Error("Synthetic worker creation failure");
          super(url, options);
          state.created++;
          state.active++;
          let stopped = false;
          const terminate = this.terminate.bind(this);
          this.terminate = () => {
            if (!stopped) {
              stopped = true;
              state.active--;
              state.terminated++;
            }
            terminate();
          };
        }
      };
    },
    { failWorker },
  );
  const session = await page.context().newCDPSession(page);
  const diagnostics: { kind: string; status?: number }[] = [];
  const targets: string[] = [];
  const activeTargets = new Set<string>();
  await session.send("Runtime.enable");
  await session.send("Network.enable");
  await session.send("Target.setDiscoverTargets", { discover: true });
  session.on("Runtime.exceptionThrown", () => diagnostics.push({ kind: "exception" }));
  session.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") diagnostics.push({ kind: "console" });
  });
  session.on("Network.loadingFailed", () => diagnostics.push({ kind: "network" }));
  session.on("Network.responseReceived", (event) => {
    if (event.response.status >= 400)
      diagnostics.push({ kind: "http", status: event.response.status });
  });
  session.on("Target.targetCreated", (event) => {
    if (event.targetInfo.type === "worker") {
      targets.push("worker");
      activeTargets.add(event.targetInfo.targetId);
    }
  });
  session.on("Target.targetDestroyed", (event) => activeTargets.delete(event.targetId));
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      external.push("external");
  });
  return { session, diagnostics, targets, activeTargets, external };
}
async function workers(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          workerEvidence: { active: number; created: number; terminated: number };
        }
      ).workerEvidence,
  );
}
async function rows(page: Page, index = 0) {
  const host = page.getByTestId("host").nth(index);
  await expect(host.getByText("SYNTH_A", { exact: true })).toBeVisible();
  await expect(host.getByText("123.45", { exact: true })).toBeVisible();
  await expect(host.getByText("SYNTH_B", { exact: true })).toBeVisible();
  await expect(host.getByText("67.89", { exact: true })).toBeVisible();
}
test("displayed rows, shared dedicated worker, theme and resize survive StrictMode cleanup", async ({
  page,
}, testInfo) => {
  const evidence = await observe(page);
  await page.goto("/fixture.html");
  await rows(page);
  await expect.poll(async () => (await workers(page)).active).toBe(1);
  await expect.poll(() => evidence.activeTargets.size).toBe(1);
  await page.getByRole("button", { name: "Add host", exact: true }).click();
  await rows(page, 1);
  expect((await workers(page)).active).toBe(1);
  expect(evidence.activeTargets.size).toBe(1);
  const cell = page.getByTestId("host").first().getByText("SYNTH_A", { exact: true });
  const lightColor = await cell.evaluate((element) => getComputedStyle(element).color);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("perspective-viewer").first()).toHaveAttribute(
    "theme",
    "Pro Dark",
  );
  await rows(page);
  await expect
    .poll(() => cell.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(lightColor);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("perspective-viewer").first()).toHaveAttribute(
    "theme",
    "Pro Light",
  );
  await expect
    .poll(() => cell.evaluate((element) => getComputedStyle(element).color))
    .toBe(lightColor);
  const width = (await page.locator("perspective-viewer").first().boundingBox())!.width;
  await page.getByRole("button", { name: "Resize hosts" }).click();
  await expect
    .poll(
      async () =>
        (await page.locator("perspective-viewer").first().boundingBox())!.width,
    )
    .toBeLessThan(width);
  await page.getByRole("button", { name: "Hide hosts" }).click();
  await expect(page.getByTestId("host").first()).toBeHidden();
  await page.getByRole("button", { name: "Show hosts" }).click();
  await rows(page);
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole("button", { name: "Remove hosts" }).click();
    await expect.poll(async () => (await workers(page)).active).toBe(0);
    await page.getByRole("button", { name: "Add host", exact: true }).click();
    await rows(page);
    expect((await workers(page)).active).toBe(1);
  }
  await page.getByRole("button", { name: "Remove hosts" }).click();
  await expect.poll(async () => (await workers(page)).active).toBe(0);
  await expect.poll(() => evidence.activeTargets.size).toBe(0);
  expect(evidence.targets.length).toBeGreaterThan(0);
  expect(evidence.external).toEqual([]);
  expect(evidence.diagnostics).toEqual([]);
  await testInfo.attach("cdp-worker-evidence", {
    body: JSON.stringify({
      workers: await workers(page),
      targets: evidence.targets,
      diagnostics: evidence.diagnostics,
    }),
    contentType: "application/json",
  });
  await evidence.session.detach();
});
test("missing same-origin WASM reports failure and Retry recovers", async ({
  page,
}) => {
  const evidence = await observe(page);
  await page.route("**/*.wasm*", (route) =>
    route.request().resourceType() === "script"
      ? route.continue()
      : route.abort("failed"),
  );
  await page.goto("/fixture.html");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(evidence.diagnostics.filter((event) => event.kind === "exception")).toEqual(
    [],
  );
  expect(
    evidence.diagnostics.filter((event) => event.kind === "network").length,
  ).toBeGreaterThan(0);
  const expectedFailureCount = evidence.diagnostics.length;
  await page.unroute("**/*.wasm*");
  await page.getByRole("button", { name: /retry/i }).click();
  await rows(page);
  expect((await workers(page)).active).toBe(1);
  expect(evidence.diagnostics.length).toBe(expectedFailureCount);
  expect(evidence.external).toEqual([]);
});
test("failed Worker cannot silently fall back to main thread and Retry recovers", async ({
  page,
}) => {
  const evidence = await observe(page, true);
  await page.goto("/fixture.html");
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await workers(page)).active).toBe(0);
  await page.evaluate(() => {
    (window as unknown as { workerEvidence: { fail: boolean } }).workerEvidence.fail =
      false;
  });
  await page.getByRole("button", { name: /retry/i }).click();
  await rows(page);
  expect((await workers(page)).active).toBe(1);
  expect(evidence.diagnostics).toEqual([]);
  expect(evidence.external).toEqual([]);
});
test("unmount during deferred WASM initialization does not leak an owned worker", async ({
  page,
}) => {
  await observe(page);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const pending = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/*.wasm*", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.continue();
      return;
    }
    requested();
    await barrier;
    await route.continue();
  });
  await page.goto("/fixture.html", { waitUntil: "domcontentloaded" });
  await pending;
  await page.getByRole("button", { name: "Remove hosts" }).click();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Add host", exact: true }).click();
  await rows(page);
  expect((await workers(page)).active).toBe(1);
  await page.getByRole("button", { name: "Remove hosts" }).click();
  await expect.poll(async () => (await workers(page)).active).toBe(0);
});
