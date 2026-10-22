import { describe, expect, it } from "vitest";
import { rangeNavigationPolicy } from "../../../src/components/General/Table/Chart/echarts/rangeNavigationPolicy";
import { rangeLiveInput } from "./rangeLive.fixtures";
describe("Range retained navigation policies", () => {
  it("defaults pagination off and does not infer autoscale from navigator visibility", () => {
    const policy = rangeNavigationPolicy(rangeLiveInput());
    expect(policy).toMatchObject({
      pagination: false,
      autoScale: { enabled: false, padding: 0.05, minVisibleItems: 2 },
    });
    expect(policy.clickRange).toBe("exact");
    expect(rangeNavigationPolicy(rangeLiveInput("rangeArea")).clickRange).toBe(
      "nearest",
    );
  });
  it("applies family over common after saved/generated collapse, including series flags", () => {
    const base = rangeLiveInput();
    const policy = rangeNavigationPolicy({
      ...base,
      theme: {
        ...base.theme,
        overrides: {
          common: { tooltip: { pagination: true }, zoom: { enabled: true } },
          "range-bar": {
            series: { showInMiniChart: false, tooltip: { enabled: false } },
            zoom: { autoScaling: { padding: 0.1 } },
          },
        },
      },
    });
    expect(policy).toMatchObject({
      pagination: true,
      showInMiniChart: false,
      seriesTooltipEnabled: false,
      autoScale: { enabled: true, padding: 0.1, minVisibleItems: 2 },
    });
  });
});
