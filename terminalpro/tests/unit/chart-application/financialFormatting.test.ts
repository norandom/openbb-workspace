import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import { round } from "lodash";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createChartDisplayPolicy } from "../../../src/components/General/Table/Chart/application/financialFormatting";
import type {
  FinancialFormattingHelpers,
  FinancialFormattingInput,
} from "../../../src/components/General/Table/Chart/application/types";

dayjs.extend(quarterOfYear);
// Test-only exact AST excerpts keep the original helpers independent of the application graph.
const fixture = JSON.parse(
  readFileSync("tests/unit/chart-application/financialFormatting.sources.json", "utf8"),
) as {
  pin: string;
  sources: { code: string; codeSha256: string; fullSourceSha256: string }[];
};
expect(fixture.pin).toBe("38dffc33389aca0e4a87e0e88d42f7067aa220df");
const source = fixture.sources
  .map(({ code, codeSha256 }) => {
    expect(createHash("sha256").update(code).digest("hex")).toBe(codeSha256);
    return code.replace(/^export /gm, "");
  })
  .join("\n");
const helpers = new Function(
  "dayjs",
  "round",
  ts.transpileModule(
    `${source}\nreturn {formatNumber,formatNumberMagnitude,getFiscalPeriodString,isValidDate:(value)=>dayjs(value).isValid()};`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText,
)(dayjs, round) as FinancialFormattingHelpers;
const policy = (overrides: Partial<FinancialFormattingInput> = {}) =>
  createChartDisplayPolicy({
    chartType: "groupedColumn",
    category: {},
    helpers,
    ...overrides,
  });

describe("owned financial display policy", () => {
  it.each([
    -1000000, -999999, 0, 0.125, 999999, 1000000,
  ])("retains axis observation %s", (value) =>
    expect(policy().numericAxis(value)).toBe(value));
  it.each([
    [1000001, "1.00 M"],
    [-1000001, "-1.00 M"],
    [1234567890, "1.23 B"],
    [1000000000000, "1.00 T"],
  ])("uses source axis precision for %s", (value, expected) =>
    expect(policy().numericAxis(value)).toBe(expected));
  it("keeps the three numeric precisions distinct and does not infer units", () => {
    const display = policy({ decimalDigits: 3 });
    expect(display.crosshair(1234567)).toBe("1 M");
    expect(display.crosshair(1234.56)).toBe("1,235");
    expect(display.seriesLabel(1234.56)).toBe("1,235");
    expect(display.tooltipNumber(1234.56)).toBe("1,234.560");
    expect(display.tooltipNumber(0.125)).toBe("0.125");
    expect(display.category(0.125)).toBe(0.125);
    expect(display.legend(0.125)).toBe(0.125);
  });
  it("regenerates current tooltip precision including zero, null fallback and helper default", () => {
    expect(
      policy({ decimalDigits: 0, globalDecimalDigits: 3 }).tooltipNumber(12.345),
    ).toBe("12");
    expect(
      policy({ decimalDigits: null, globalDecimalDigits: 2 }).tooltipNumber(12.345),
    ).toBe("12.35");
    expect(policy().tooltipNumber(12.345)).toBe("12.345");
    expect(policy({ decimalDigits: 0 }).tooltipNumber(0.125)).toBe("0.13");
  });
  it("preserves zero and nonfinite source behavior", () => {
    expect(policy().tooltipNumber(0)).toBe("0");
    expect(policy().tooltipNumber(Number.NaN)).toBe("N/A");
    expect(policy().numericAxis(Number.NaN)).toBeNaN();
    expect(policy().crosshair(Number.NaN)).toBe("N/A");
    expect(policy().seriesLabel(Number.POSITIVE_INFINITY)).toBe("Infinity T");
    expect(policy().tooltipNumber(Number.NEGATIVE_INFINITY)).toBe("-Infinity.000 T");
  });
  it("preserves quarter separators and date recognition boundaries", () => {
    const display = policy({
      period: "Quarterly",
      category: { cellDataType: "dateString" },
    });
    expect(display.category("2024-04-15")).toBe("Q2\n2024");
    expect(display.seriesLabel("2024-04-15 01:02:03")).toBe("Q2\n2024");
    expect(display.legend("2024-04-15")).toBe("Q2 2024");
    expect(
      policy({ period: "quarter", chartType: "line" }).seriesLabel("4/15/2024"),
    ).toBe("Q2 2024");
    expect(display.category("2024-04-15 00:00:00")).toBe("2024-04-15");
    expect(display.category("2024-04-15T01:02:03Z")).toBe("2024-04-15T01:02:03Z");
    expect(display.category(new Date("2024-04-15T00:00:00Z"))).toBe("2024-04-15");
    expect(display.legend(new Date("2024-04-15T01:02:03Z"))).toBe(
      "2024-04-15 01:02:03",
    );
  });
  it("uses exact period rules and only explicit category date metadata", () => {
    expect(policy({ period: "ANNUAL" }).legend("2024-04-15")).toBe("FY 2024");
    expect(policy({ period: "yearly" }).legend("2024-04-15")).toBe("2024-04-15");
    expect(policy({ period: "quarterly" }).category("2024-04-15")).toBe("2024-04-15");
    expect(
      policy({ period: "quarterly", category: { cellDataType: "date" } }).category(
        "2024-04-15",
      ),
    ).toBe("Q2\n2024");
    expect(policy({ period: "quarterly" }).legend("not a date")).toBe("not a date");
  });
  it("retains original invalid-date word wrapping including spaces and trailing newline", () => {
    expect(policy().seriesLabel("alpha beta gamma delta epsilon")).toBe(
      "alpha beta\n gamma delta\n epsilon\n",
    );
    expect(policy().seriesLabel("single")).toBe("single");
  });
  it("passes exact Index inputs and uses only truthy formatter results", () => {
    const indexColDef = Object.freeze({
      valueFormatter: ({ value, colDef }: { value: unknown; colDef: unknown }) => {
        expect(colDef).toBe(indexColDef);
        expect(value).toBe("2024-04-15");
        return "2024-07-15";
      },
    });
    const input = Object.freeze({
      chartType: "stackedColumn" as const,
      period: "quarterly",
      category: Object.freeze({ cellDataType: "date", indexColDef }),
      helpers,
    });
    expect(createChartDisplayPolicy(input).category("2024-04-15")).toBe("Q3\n2024");
    for (const result of [0, false, null, undefined, ""] as const)
      expect(
        policy({
          category: { indexColDef: { valueFormatter: () => result } },
        }).category("original"),
      ).toBe("original");
    expect(
      policy({ category: { indexColDef: { valueFormatter: () => 42 } } }).category(
        "original",
      ),
    ).toBe(42);
  });
  it("retains unguarded Index failures and nonnumeric callback passthrough", () => {
    for (const indexColDef of [{}, { valueFormatter: "value" }])
      expect(() => policy({ category: { indexColDef } }).category("original")).toThrow(
        TypeError,
      );
    const date = new Date("2024-01-01Z");
    expect(policy().numericAxis(date)).toBe(date);
    expect(policy().crosshair("raw")).toBe("raw");
  });
});
