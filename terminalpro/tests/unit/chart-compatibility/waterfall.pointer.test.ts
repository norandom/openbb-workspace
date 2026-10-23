import { expect, it } from "vitest";
import { bars, engine, projected, waterfallInput } from "./waterfall.fixtures";

it("captures immutable source identities and consumes outsideMinor for cropped numeric visibility", () => {
  const input = waterfallInput([10, -3, 2]);
  input.navigation.hoverRange = "nearest";
  input.navigation.outsideMinor = true;
  const result = projected(input);
  input.snapshot.rows[0].id = "changed";
  input.snapshot.rows[0].values.revenue = 900;
  engine(result.options, () => {
    const plan = result.projectPointer!(result.options)!;
    expect(plan.present({ key: "source-0" })!.html).toContain("number:10");
    expect(plan.present({ key: "changed" })).toBeUndefined();
  });
});
it.each([
  false,
  true,
])("uses outsideMinor=%s for nearest picking beyond the numeric window", (outsideMinor) => {
  const input = waterfallInput([10, -8, 1]);
  input.navigation.hoverRange = "nearest";
  input.navigation.outsideMinor = outsideMinor;
  const result = projected(input);
  const options = result.projectNavigationWindow!(result.options, {
    dataZoom: [
      { id: "openbb-navigator", start: 0, end: 100 },
      { id: "openbb-waterfall-number-inside", start: 90, end: 100 },
    ],
  });
  engine(options, (chart) => {
    const coordinate = chart.convertToPixel({ gridIndex: 0 }, [2, 9.5]) as number[];
    const plan = result.projectPointer!(options)!;
    expect(
      plan.pick({ x: coordinate[0], y: coordinate[1] }, "hover")!.matches[0].key,
    ).toBe(outsideMinor ? "source-2" : "source-1");
  });
});

it("picks native rectangles by source row identity and presents escaped raw signed deltas", () => {
  const input = waterfallInput([10, -3, 0, null, 2]);
  input.snapshot.rows[1].category = "<same>";
  const result = projected(input);
  engine(result.options, (chart) => {
    const box = bars(chart)[1].shape;
    const plan = result.projectPointer!(result.options)!;
    const pick = plan.pick(
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      "hover",
    )!;
    expect(pick.matches).toMatchObject([{ key: "source-1", identityKey: "source-1" }]);
    expect(plan.present(pick.matches[0])).toMatchObject({
      html: "period:&lt;same&gt;<br/>Amount: number:-3",
      categoryPointer: { axis: "x", label: "cross:<same>" },
    });
    expect(plan.pick({ x: 0, y: 0 }, "hover")).toBeUndefined();
    expect(plan.present({ key: "source-2" })).toBeUndefined();
    expect(plan.present({ key: "source-3" })).toBeUndefined();
  });
});
it("uses post-crop engine geometry and independently consumes hover/click range, pagination and tooltip enable", () => {
  const input = waterfallInput([10, -3, 2, -1]);
  input.navigation.hoverRange = "nearest";
  input.navigation.clickRange = 0;
  input.navigation.pagination = false;
  input.appearance.series.tooltipEnabled = false;
  const result = projected(input);
  const options = result.projectNavigationWindow!(result.options, {
    dataZoom: [{ id: "openbb-navigator", start: 50, end: 100 }],
  });
  engine(options, (chart) => {
    const rect = bars(chart)[0].shape;
    const plan = result.projectPointer!(options)!;
    expect(plan.pagination).toBe(false);
    const off = { x: rect.x + rect.width / 2, y: rect.y - 20 };
    expect(plan.pick(off, "hover")!.matches[0].key).toBe("source-2");
    expect(plan.pick(off, "click")).toBeUndefined();
    expect(plan.present({ key: "source-2" })!.html).toBe("");
  });
});
it.each([
  "single",
  "shared",
  "compact",
])("consumes the reachable chart tooltip %s mode", (mode) => {
  const input = waterfallInput([10]);
  input.appearance.application.tooltip.mode = mode;
  const result = projected(input);
  engine(result.options, () => {
    const html = result.projectPointer!(result.options)!.present({
      key: "source-0",
    })!.html;
    expect(html).toBe(
      `${mode === "compact" ? "" : "period:same<br/>"}Amount: number:10`,
    );
  });
  input.appearance.application.tooltip.enabled = false;
  const disabled = projected(input);
  engine(disabled.options, () =>
    expect(
      disabled.projectPointer!(disabled.options)!.present({ key: "source-0" })!.html,
    ).toBe(""),
  );
});
