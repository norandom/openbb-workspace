import { expect, test, type Page } from "@playwright/test";

async function image(page: Page) {
  return page.evaluate(async () => {
    const fixture = (window as unknown as { hostFixture: { exportImage(): string } }).hostFixture;
    const data = fixture.exportImage();
    const bitmap = await createImageBitmap(await (await fetch(data)).blob());
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing PNG decoder context");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0; let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 240 && pixels[i + 1] < 20 && pixels[i + 2] < 20) red++;
      if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150) dark++;
    }
    bitmap.close(); return { data, width: canvas.width, height: canvas.height, red, dark };
  });
}
test("actual host renders, updates, recovers and releases owned charts", async ({ page }, testInfo) => {
  const diagnostics: string[] = [];
  const session = await page.context().newCDPSession(page);
  await session.send("Runtime.enable"); await session.send("Network.enable");
  session.on("Runtime.exceptionThrown", () => diagnostics.push("exception"));
  session.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") diagnostics.push("console"); });
  session.on("Network.loadingFailed", () => diagnostics.push("network"));
  session.on("Network.responseReceived", (event) => { if (event.response.status >= 400) diagnostics.push("http"); });
  page.on("request", (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== "127.0.0.1") diagnostics.push("external"); });
  try {
    await page.goto("/host.html");
    const values = () => page.evaluate(() => ((window as unknown as { hostFixture: { values(): { data: number[] }[] } }).hostFixture.values()?.[0]?.data));
    await expect.poll(values).toEqual([123.45, 67.89]);
    const initial = await image(page);
    expect(initial).toMatchObject({ width: 640, height: 400 });
    expect(initial.red).toBeGreaterThan(10000); expect(initial.dark).toBeGreaterThan(100);
    await testInfo.attach("initial.png", { body: Buffer.from(initial.data.split(",")[1], "base64"), contentType: "image/png" });
    await page.getByRole("button", { name: "Update values", exact: true }).click();
    await expect.poll(values).toEqual([180, 40]);
    const updated = await image(page); expect(updated.data).not.toBe(initial.data); expect(updated.red).not.toBe(initial.red);
    await page.getByRole("button", { name: "Resize", exact: true }).click();
    await expect.poll(async () => (await image(page)).width).toBe(800);
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(page.locator(".owned-chart")).toHaveCSS("width", "0px");
    expect(await page.evaluate(() => { try { (window as unknown as { hostFixture: { exportImage(): string } }).hostFixture.exportImage(); return false; } catch { return true; } })).toBe(true);
    await page.getByRole("button", { name: "Toggle mount" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle mount" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect.poll(values).toEqual([180, 40]);
    await page.getByRole("button", { name: "Fail update" }).click();
    await expect(page.locator("#error")).toContainText("synthetic formatter failure");
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "Recover", exact: true }).click();
    await expect.poll(values).toEqual([180, 40]);
    expect((await image(page)).red).toBeGreaterThan(10000);
    await page.getByRole("button", { name: "Toggle mount" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(diagnostics).toEqual([]);
  } finally {
    await testInfo.attach("cdp-diagnostics", { body: JSON.stringify(diagnostics), contentType: "application/json" });
    await session.detach();
  }
});
