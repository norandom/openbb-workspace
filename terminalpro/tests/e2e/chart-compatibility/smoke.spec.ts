import { expect, test } from "@playwright/test";

test("real ECharts renders known USD observations and disposes", async ({ page }, testInfo) => {
  const diagnostics: { kind: string; status?: number }[] = [];
  const session = await page.context().newCDPSession(page);
  await session.send("Runtime.enable");
  await session.send("Network.enable");
  session.on("Runtime.exceptionThrown", () => diagnostics.push({ kind: "exception" }));
  session.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") diagnostics.push({ kind: "console" });
  });
  session.on("Network.loadingFailed", () => diagnostics.push({ kind: "network" }));
  session.on("Network.responseReceived", (event) => {
    if (event.response.status >= 400)
      diagnostics.push({ kind: "http", status: event.response.status });
  });
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== "127.0.0.1")
      diagnostics.push({ kind: "external" });
  });
  try {
    await page.goto("/fixture.html");
    const svg = page.locator("#chart svg");
    for (const text of ["SYNTH_A", "SYNTH_B", "USD", "123.45", "67.89"])
      await expect(svg.getByText(text, { exact: true })).toBeVisible();
    const actual = await page.evaluate(() => {
      const fixture = (window as unknown as {
        chartFixture: { version: string; values(): number[] };
      }).chartFixture;
      return { version: fixture.version, values: fixture.values() };
    });
    expect(actual).toEqual({ version: "6.0.0", values: [123.45, 67.89] });
    expect(await svg.locator("path").count()).toBeGreaterThan(2);
    await page.screenshot({ path: testInfo.outputPath("known-observations.png") });
    await page.getByRole("button", { name: "Dispose fixture" }).click();
    await expect(page.locator("#status")).toHaveText("disposed");
    await expect(page.locator("#chart svg")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as {
      chartFixture: { disposed(): boolean };
    }).chartFixture.disposed())).toBe(true);
    expect(diagnostics).toEqual([]);
  } finally {
    await testInfo.attach("cdp-diagnostics", {
      body: JSON.stringify(diagnostics), contentType: "application/json",
    });
    await session.detach();
  }
});
