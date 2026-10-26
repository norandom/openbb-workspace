import { expect, it } from "vitest";
import {
  isLineFamily,
  isStackedLineFamily,
  LineStackOverflowError,
} from "../../../src/components/General/Table/Chart/echarts/cartesianLineTypes";
import {
  isCartesianFamily,
  isNormalizedFamily,
} from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";

it("identifies integrated line families without using bar normalization admission", () => {
  expect(isLineFamily("line")).toBe(true);
  expect(isStackedLineFamily("line")).toBe(false);
  for (const family of ["stackedLine", "normalizedLine"]) {
    expect(isLineFamily(family)).toBe(true);
    expect(isStackedLineFamily(family)).toBe(true);
    expect(isCartesianFamily(family)).toBe(true);
    expect(isNormalizedFamily(family)).toBe(false);
  }
  expect(isLineFamily("stackedArea")).toBe(false);
  expect(isStackedLineFamily("normalizedBar")).toBe(false);
});

it("distinguishes unrepresentable stacks from style failures", () => {
  const error = new LineStackOverflowError();
  expect(error).toBeInstanceOf(RangeError);
  expect(error.code).toBe("line-stack-overflow");
});
