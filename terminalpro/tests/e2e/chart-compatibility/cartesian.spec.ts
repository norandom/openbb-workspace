import { expect, type Page, test } from "@playwright/test";

async function state(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        cartesianFixture: {
          inspect(): {
            dataRevision: number;
            renderRevision: number;
            option: {
              series: {
                id: string;
                type: string;
                stack?: string;
                data: (number | null)[];
              }[];
              xAxis: { data: string[] }[];
            };
          };
        };
      }
    ).cartesianFixture.inspect(),
  );
}

async function png(page: Page) {
  return page.evaluate(async () => {
    const data = (
      window as unknown as { cartesianFixture: { exportImage(): string } }
    ).cartesianFixture.exportImage();
    const bitmap = await createImageBitmap(await (await fetch(data)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing PNG context");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0;
    let red = 0;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const y = Math.floor(i / 4 / canvas.width);
      if (y < 60 || y > 360) continue;
      if (
        pixels[i] < 60 &&
        pixels[i + 1] > 60 &&
        pixels[i + 1] < 130 &&
        pixels[i + 2] > 130
      )
        blue++;
      if (pixels[i] > 140 && pixels[i + 1] < 90 && pixels[i + 2] < 90) red++;
      if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) dark++;
    }
    bitmap.close();
    return { data, width: canvas.width, height: canvas.height, blue, red, dark };
  });
}

test("validated Cartesian composition preserves observations, revisions and rejected renders", async ({
  page,
}, testInfo) => {
  const diagnostics: string[] = [];
  const session = await page.context().newCDPSession(page);
  await session.send("Runtime.enable");
  await session.send("Network.enable");
  session.on("Runtime.exceptionThrown", () => diagnostics.push("exception"));
  session.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") diagnostics.push("console");
  });
  session.on("Network.loadingFailed", () => diagnostics.push("network"));
  session.on("Network.responseReceived", (event) => {
    if (event.response.status >= 400) diagnostics.push("http");
  });
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      diagnostics.push("external");
  });
  try {
    await page.goto("/cartesian.html");
    await expect(
      page.getByRole("heading", { name: "Synthetic Revenue/Costs (USD)" }),
    ).toBeVisible();
    const expected = [
      [123.456789, 0, -5.25],
      [-40.125, null, -12.75],
    ];
    const assertFamily = async (type: string, stacked: boolean) => {
      await expect
        .poll(async () =>
          (await state(page)).option.series.map((series) => series.type),
        )
        .toEqual([type, type]);
      const current = await state(page);
      expect(current.dataRevision).toBe(7);
      expect(current.option.series.map((series) => series.id)).toEqual([
        "revenue",
        "costs",
      ]);
      expect(current.option.series.map((series) => series.data)).toEqual(expected);
      expect(current.option.series.map((series) => series.stack)).toEqual(
        stacked ? ["total", "total"] : [undefined, undefined],
      );
      expect(current.option.xAxis[0].data).toEqual(["0", "1", "2"]);
    };
    await assertFamily("bar", false);
    const initial = await png(page);
    expect(initial).toMatchObject({ width: 720, height: 440 });
    expect(initial.blue).toBeGreaterThan(1000);
    expect(initial.red).toBeGreaterThan(1000);
    expect(initial.dark).toBeGreaterThan(100);
    await testInfo.attach("grouped.png", {
      body: Buffer.from(initial.data.split(",")[1], "base64"),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "Stacked", exact: true }).click();
    await assertFamily("bar", true);
    const stacked = await png(page);
    expect(stacked.data).not.toBe(initial.data);
    await testInfo.attach("negative-stacked.png", {
      body: Buffer.from(stacked.data.split(",")[1], "base64"),
      contentType: "image/png",
    });
    const beforeSettings = await state(page);
    await page.getByRole("button", { name: "Settings only", exact: true }).click();
    await expect
      .poll(async () => (await state(page)).renderRevision)
      .toBe(beforeSettings.renderRevision + 1);
    await assertFamily("bar", true);
    expect((await png(page)).data).not.toBe(stacked.data);
    await page.getByRole("button", { name: "Line", exact: true }).click();
    await assertFamily("line", false);
    const line = await png(page);
    expect(line.blue).toBeGreaterThan(20);
    expect(line.red).toBeGreaterThan(20);
    await testInfo.attach("line.png", {
      body: Buffer.from(line.data.split(",")[1], "base64"),
      contentType: "image/png",
    });
    for (const index of [0, 1]) {
      const point = await page.evaluate(
        (dataIndex) =>
          (
            window as unknown as {
              cartesianFixture: { point(index: number): number[] };
            }
          ).cartesianFixture.point(dataIndex),
        index,
      );
      const box = await page.locator(".cartesian-chart").boundingBox();
      if (!box) throw new Error("Missing chart");
      await page.mouse.move(box.x + point[0], box.y + point[1]);
      await expect(page.locator(".cartesian-chart")).toContainText("2026-03-31");
      await expect(page.locator(".cartesian-chart")).toContainText(
        index === 0 ? "Revenue: 123.457" : "Revenue: 0.000",
      );
      await expect(page.locator(".cartesian-chart")).toContainText(
        index === 0 ? "Costs: -40.125" : "Costs: —",
      );
    }
    await page.getByRole("button", { name: "Resize", exact: true }).click();
    await expect.poll(async () => (await png(page)).width).toBe(900);
    const accepted = await state(page);
    for (const [button, message] of [
      ["Invalid", "rows"],
      ["Unsupported", "unsupported-family"],
    ]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(page.locator("#diagnostic")).toContainText(message);
      expect(await state(page)).toEqual(accepted);
    }
    await page.getByRole("button", { name: "Recover", exact: true }).click();
    await assertFamily("bar", false);
    await expect(page.locator("#diagnostic")).toBeEmpty();
    expect((await state(page)).renderRevision).toBe(accepted.renderRevision + 1);
    expect(diagnostics).toEqual([]);
  } finally {
    await testInfo.attach("cdp-diagnostics", {
      body: JSON.stringify(diagnostics),
      contentType: "application/json",
    });
    await session.detach();
  }
});
