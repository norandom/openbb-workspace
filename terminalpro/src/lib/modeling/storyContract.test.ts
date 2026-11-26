import { describe, expect, it } from "vitest";
import {
  compareStoryDecimals,
  decodeStoryRun,
  exactDecimalSign,
  type StoryBinding,
} from "./storyContract";

export const binding: StoryBinding = {
  selection: {
    commodity_symbol: "DBC",
    technology_symbol: "XLK",
    observation_date: "2024-04-03",
  },
  schedule: { calendar_id: "NYSE_ARCA", schedule_revision: "synthetic.2024r1" },
  cutoff: {
    observation_date: "2024-04-03",
    decision_at: "2024-04-04T03:59:59.999999Z",
    evaluated_at: "2024-05-03T16:00:00Z",
    session_timezone: "America/New_York",
  },
};

describe("story run contract", () => {
  it("rejects invalid payloads and unknown identities", () => {
    expect(decodeStoryRun({}, "comparison", binding)).toBeUndefined();
    expect(
      decodeStoryRun({ run_id: "x".repeat(32) }, "regime", binding),
    ).toBeUndefined();
  });

  it("compares risk levels using wire precision", () => {
    expect(compareStoryDecimals("20.00000000000000000001", "20")).toBe(1);
    expect(compareStoryDecimals("-1e-999", "-9e-1000")).toBe(-1);
    expect(compareStoryDecimals("1.20", "+12e-1")).toBe(0);
  });

  it("classifies signed decimals before display rounding", () => {
    expect(exactDecimalSign("-1e-400")).toBe(-1);
    expect(exactDecimalSign("+1.0e-400")).toBe(1);
    expect(exactDecimalSign("-0.0e+9")).toBe(0);
    expect(exactDecimalSign("NaN")).toBeUndefined();
    expect(exactDecimalSign("1\n")).toBeUndefined();
  });
});
