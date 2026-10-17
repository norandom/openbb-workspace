import { expect, type Page, test } from "@playwright/test";

type State = {
  dataRevision: number;
  renderRevision: number;
  diagnostic: string;
  settings: { title: string };
  option: {
    series: {
      id: string;
      type: string;
      data: (number | null)[];
      stack?: string;
      connectNulls?: boolean;
      showSymbol?: boolean;
      symbol?: string;
      symbolSize?: number;
    }[];
    title: { text: string; show: boolean; textStyle: object }[];
    legend: { textStyle: object }[];
    xAxis: { data: string[]; axisLabel: object }[];
  };
};
type Fixture = {
  inspect(): State;
  exportImage(): string;
  point(index: number, value: number): number[];
};
const state = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { appearanceFixture: Fixture }).appearanceFixture.inspect(),
  );
const point = (page: Page, index: number, value: number) =>
  page.evaluate(
    ([i, v]) =>
      (window as unknown as { appearanceFixture: Fixture }).appearanceFixture.point(
        i,
        v,
      ),
    [index, value],
  );

// Decode the real host export, counting exact solid colors and their connected regions.
async function pixels(page: Page, color: string, region: number[]) {
  return page.evaluate(
    async ({ color, region }) => {
      const data = (
        window as unknown as { appearanceFixture: Fixture }
      ).appearanceFixture.exportImage();
      const bitmap = await createImageBitmap(await (await fetch(data)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing image context");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const rgb = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
      const hits = new Set<number>();
      for (let y = Math.ceil(region[1]); y < region[3]; y++)
        for (let x = Math.ceil(region[0]); x < region[2]; x++) {
          const offset = (y * canvas.width + x) * 4;
          if (
            rgb.every((value, i) => image[offset + i] === value) &&
            image[offset + 3] === 255
          )
            hits.add(y * canvas.width + x);
        }
      const count = hits.size;
      const components: {
        x: number;
        y: number;
        width: number;
        height: number;
        area: number;
      }[] = [];
      while (hits.size) {
        const first = hits.values().next().value as number;
        const queue = [first];
        hits.delete(first);
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          xs.push(item % canvas.width);
          ys.push(Math.floor(item / canvas.width));
          for (const next of [
            item - 1,
            item + 1,
            item - canvas.width,
            item + canvas.width,
          ])
            if (hits.delete(next)) queue.push(next);
        }
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        components.push({
          x: (left + right) / 2,
          y: (top + bottom) / 2,
          width: right - left + 1,
          height: bottom - top + 1,
          area: queue.length,
        });
      }
      return { data, width: canvas.width, height: canvas.height, count, components };
    },
    { color, region },
  );
}

test("explicit appearance renders gaps, circles, captions and recoverable updates", async ({
  page,
}, info) => {
  const diagnostics: string[] = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  cdp.on("Runtime.exceptionThrown", () => diagnostics.push("exception"));
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") diagnostics.push("console");
  });
  cdp.on("Network.loadingFailed", () => diagnostics.push("network"));
  cdp.on("Network.responseReceived", (event) => {
    if (event.response.status >= 400) diagnostics.push(`http:${event.response.status}`);
  });
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      diagnostics.push("external");
  });
  const capture = async (name: string) => {
    const image = await pixels(page, "#145da0", [0, 0, 1, 1]);
    await info.attach(`${name}-export.png`, {
      body: Buffer.from(image.data.split(",")[1], "base64"),
      contentType: "image/png",
    });
    await info.attach(`${name}-visible.png`, {
      body: await page.locator(".appearance-chart").screenshot(),
      contentType: "image/png",
    });
    return image;
  };
  const change = async (name: string) => {
    const before = await state(page);
    await page.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(async () => (await state(page)).renderRevision)
      .toBe(before.renderRevision + 1);
    const current = await state(page);
    expect(current.dataRevision).toBe(7);
    expect(current.option.series.map((s) => s.id)).toEqual(["revenue", "costs"]);
    expect(current.option.series.map((s) => s.data)).toEqual([
      [100, null, 140, 160],
      [40, null, 60, 70],
    ]);
    expect(current.option.xAxis[0].data).toEqual(["0", "1", "2", "3"]);
    return current;
  };
  try {
    await page.goto("/appearance.html");
    await expect(page.locator(".appearance-chart canvas")).toBeVisible();
    await expect.poll(async () => (await state(page)).renderRevision).toBe(1);
    const q2 = await point(page, 1, 120);
    const gap = [q2[0] - 12, q2[1] - 8, q2[0] + 12, q2[1] + 8];
    expect((await pixels(page, "#145da0", gap)).count).toBeGreaterThan(20);
    expect((await state(page)).option.series.map((s) => s.showSymbol)).toEqual([
      false,
      false,
    ]);
    await capture("connected-no-markers");
    await change("Disconnect missing");
    expect((await pixels(page, "#145da0", gap)).count).toBe(0);
    await capture("broken-gap");
    await change("Connect missing");
    expect((await pixels(page, "#145da0", gap)).count).toBeGreaterThan(20);
    await change("Distinct colors");
    await change("Markers on");
    const plot = [75, 55, 690, 410];
    for (const [color, values] of [
      ["#d62f86", [100, 140, 160]],
      ["#32b6c8", [40, 60, 70]],
    ] as const) {
      const marks = (await pixels(page, color, plot)).components.sort(
        (a, b) => a.x - b.x,
      );
      expect(marks).toHaveLength(3);
      for (const [i, index] of [0, 2, 3].entries()) {
        const position = await point(page, index, values[i]);
        expect(Math.abs(marks[i].x - position[0])).toBeLessThan(1);
        expect(Math.abs(marks[i].y - position[1])).toBeLessThan(1);
        expect(marks[i].width).toBeGreaterThanOrEqual(3);
        expect(marks[i].width).toBeLessThanOrEqual(7);
        expect(Math.abs(marks[i].width - marks[i].height)).toBeLessThanOrEqual(1);
        expect(marks[i].area).toBeLessThan(marks[i].width * marks[i].height);
      }
      expect(marks.every((mark) => Math.abs(mark.x - q2[0]) > 20)).toBe(true);
    }
    const marked = await capture("distinct-circles");
    await change("Markers off");
    expect((await pixels(page, "#d62f86", plot)).count).toBe(0);
    expect((await pixels(page, "#32b6c8", plot)).count).toBe(0);
    await change("Markers on");
    expect((await capture("restored-circles")).data).toBe(marked.data);
    const titleRegion = [0, 0, 760, 42];
    expect((await pixels(page, "#101010", titleRegion)).count).toBeGreaterThan(50);
    const hidden = await change("Hide title");
    expect(hidden.option.title[0]).toMatchObject({
      show: false,
      text: "Revenue and costs (USD millions)",
    });
    expect(hidden.settings.title).toBe("Revenue and costs (USD millions)");
    expect((await pixels(page, "#101010", titleRegion)).count).toBe(0);
    await capture("hidden-title");
    await change("Show title");
    expect((await pixels(page, "#101010", titleRegion)).count).toBeGreaterThan(50);
    const typography = await change("Typography");
    expect(typography.option.title[0].textStyle).toMatchObject({
      color: "#751515",
      fontFamily: "monospace",
      fontSize: 22,
    });
    expect(typography.option.legend[0].textStyle).toMatchObject({
      color: "#156015",
      fontFamily: "serif",
      fontSize: 14,
    });
    expect(typography.option.xAxis[0].axisLabel).toMatchObject({
      color: "#151575",
      fontFamily: "monospace",
      fontSize: 13,
    });
    for (const [color, region] of [
      ["#751515", titleRegion],
      ["#156015", [0, 420, 760, 480]],
      ["#151575", [0, 40, 760, 440]],
    ] as const)
      expect((await pixels(page, color, [...region])).count).toBeGreaterThan(10);
    const line = await capture("typography");
    for (const family of ["Grouped", "Stacked"]) {
      const columns = await change(family);
      expect(columns.option.series.map((s) => s.type)).toEqual(["bar", "bar"]);
      expect(columns.option.series.map((s) => s.stack)).toEqual(
        family === "Stacked" ? ["total", "total"] : [undefined, undefined],
      );
      expect(
        columns.option.series.every(
          (s) => s.connectNulls === undefined && s.showSymbol === undefined,
        ),
      ).toBe(true);
      for (const color of ["#f2b134", "#90be6d"])
        expect((await pixels(page, color, plot)).count).toBeGreaterThan(1000);
      expect((await pixels(page, "#d62f86", plot)).count).toBe(0);
      await capture(family.toLowerCase());
    }
    const restored = await change("Line");
    expect(
      restored.option.series.every(
        (s) =>
          s.stack === undefined &&
          s.type === "line" &&
          s.symbol === "circle" &&
          s.symbolSize === 7 &&
          s.connectNulls === true &&
          s.showSymbol === true,
      ),
    ).toBe(true);
    expect((await capture("line-roundtrip")).data).toBe(line.data);
    await page.getByRole("button", { name: "Resize", exact: true }).click();
    await expect
      .poll(async () => (await pixels(page, "#145da0", [0, 0, 1, 1])).width)
      .toBe(940);
    const resized = await capture("resized");
    expect(resized.height).toBe(480);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.locator("#exported-image")).toBeVisible();
    expect(await page.locator("#exported-image").getAttribute("src")).toBe(
      resized.data,
    );
    const accepted = await state(page);
    for (const [button, status] of [
      ["Invalid", "invalid"],
      ["Unsupported", "unsupported"],
    ]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(page.locator("#diagnostic")).toContainText(status);
      const rejected = await state(page);
      expect(rejected.option).toEqual(accepted.option);
      expect(rejected.renderRevision).toBe(accepted.renderRevision);
      expect(rejected.dataRevision).toBe(7);
      expect((await capture(button.toLowerCase())).data).toBe(resized.data);
    }
    await change("Recover");
    await expect(page.locator("#diagnostic")).toBeEmpty();
    expect((await capture("recovered")).data).not.toBe(resized.data);
    expect(diagnostics).toEqual([]);
  } finally {
    await info.attach("cdp-diagnostics", {
      body: JSON.stringify(diagnostics),
      contentType: "application/json",
    });
    await cdp.detach();
  }
});
