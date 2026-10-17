import { describe, expect, it } from "vitest";
import { deriveAppearanceColors } from "../../../src/components/General/Table/Chart/application/appearanceColors";
import type {
  AppearanceColorTokens,
  DeriveAppearanceColors,
} from "../../../src/components/General/Table/Chart/application/appearanceContracts";
import fixtures from "./appearanceFixtures.json";

const derive: DeriveAppearanceColors = deriveAppearanceColors;
const tokens = (
  overrides: Partial<AppearanceColorTokens> = {},
): AppearanceColorTokens => ({
  base: "ag-default",
  foregroundColor: "#ffffff",
  backgroundColor: "#000000",
  textColor: "#ffffff",
  chartBackgroundColor: "#000000",
  ...overrides,
});
const fields = [
  "base",
  "foregroundColor",
  "backgroundColor",
  "textColor",
  "chartBackgroundColor",
] as const;

function rejected(
  input: unknown,
  status: "invalid" | "unresolved",
  path?: readonly string[],
) {
  const result = derive(input as AppearanceColorTokens);
  expect(result.status).toBe(status);
  expect(result).not.toHaveProperty("gridLineColor");
  expect(result).not.toHaveProperty("subtleTextColor");
  if (result.status === "resolved") throw new Error("Expected diagnostics");
  expect(result.diagnostics.length).toBeGreaterThan(0);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.code.length).toBeGreaterThan(0);
    expect(diagnostic.message.length).toBeGreaterThan(0);
  }
  if (path) expect(result.diagnostics.map((item) => item.path)).toContainEqual(path);
}

describe("explicit appearance color derivation", () => {
  it.each([
    ["ag-default", "#ffffff", "#000000", "#191919", "#9e9e9e"],
    ["ag-default-dark", "#ffffff", "#000000", "#424242", "#6e6e6e"],
    ["ag-default", "#000000", "#ffffff", "#e6e6e6", "#616161"],
    ["ag-default-dark", "#000000", "#ffffff", "#bdbdbd", "#919191"],
    ["ag-default", "#000000", "#000000", "#000000", "#000000"],
    ["ag-default-dark", "#ffffff", "#ffffff", "#ffffff", "#ffffff"],
  ] as const)("uses %s ratios for %s against %s", (base, fg, bg, grid, subtle) => {
    expect(
      derive(
        tokens({
          base,
          foregroundColor: fg,
          backgroundColor: bg,
          textColor: fg,
          chartBackgroundColor: bg,
        }),
      ),
    ).toStrictEqual({
      status: "resolved",
      gridLineColor: grid,
      subtleTextColor: subtle,
    });
  });

  it.each([
    ["ag-default", "#e6e6e6", "#9e0061"],
    ["ag-default-dark", "#bdbdbd", "#6e0091"],
  ] as const)("keeps subtitle aliases independent under %s", (base, grid, subtle) => {
    expect(
      derive(
        tokens({
          base,
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
          textColor: "#ff0000",
          chartBackgroundColor: "#0000ff",
        }),
      ),
    ).toStrictEqual({
      status: "resolved",
      gridLineColor: grid,
      subtleTextColor: subtle,
    });
  });

  it("preserves normalized-channel rounding at the captured byte-shortcut edge", () => {
    expect(
      derive(tokens({ foregroundColor: "#000000", backgroundColor: "#9b0000" })),
    ).toStrictEqual({
      status: "resolved",
      gridLineColor: "#8b0000",
      subtleTextColor: "#9e9e9e",
    });
  });

  it.each(
    fixtures.colors,
  )("reproduces the finite reviewed $id projection", (fixture) => {
    expect(derive(fixture.tokens as AppearanceColorTokens)).toStrictEqual(
      fixture.expected,
    );
  });

  it("accepts mixed-case hex and always emits lowercase six-digit colors", () => {
    const candidate = tokens({
      base: "ag-default-dark",
      foregroundColor: "#123456",
      backgroundColor: "#789aBc",
      textColor: "#FF0000",
      chartBackgroundColor: "#0000fF",
    });
    expect(derive(candidate)).toStrictEqual({
      status: "resolved",
      gridLineColor: "#5e80a2",
      subtleTextColor: "#6e0091",
    });
    expect(
      derive({ ...candidate, backgroundColor: "#789abc", textColor: "#ff0000" }),
    ).toStrictEqual(derive(candidate));
  });

  it("preserves frozen inputs and accepts null-prototype plain records", () => {
    const candidate = Object.freeze(tokens());
    const before = Object.getOwnPropertyDescriptors(candidate);
    expect(derive(candidate).status).toBe("resolved");
    expect(Object.getOwnPropertyDescriptors(candidate)).toStrictEqual(before);
    const record = Object.assign(Object.create(null), candidate);
    expect(derive(record)).toStrictEqual(derive(candidate));
    expect(Object.getPrototypeOf(record)).toBe(null);
  });

  it.each([
    undefined,
    null,
    [],
    "tokens",
    1,
    true,
    () => tokens(),
    new Date(0),
    new Map(),
  ])("rejects malformed top-level values %s", (candidate) =>
    rejected(candidate, "invalid", []));

  it.each(fields)("requires own string data field %s", (field) => {
    const missing: Record<string, unknown> = { ...tokens() };
    delete missing[field];
    rejected(missing, "invalid", [field]);
    for (const value of [
      undefined,
      null,
      1,
      false,
      {},
      [],
      Symbol("color"),
      () => "#ffffff",
    ]) {
      rejected({ ...tokens(), [field]: value }, "invalid", [field]);
    }
    rejected(Object.create(tokens()), "invalid");
  });

  it("rejects unknown own fields, including non-enumerable fields and symbols", () => {
    rejected({ ...tokens(), extra: "#ffffff" }, "invalid", ["extra"]);
    rejected(Object.defineProperty(tokens(), "hidden", { value: true }), "invalid", [
      "hidden",
    ]);
    rejected({ ...tokens(), [Symbol("extra")]: "#ffffff" }, "invalid");
  });

  it.each(fields)("never executes an accessor for %s", (field) => {
    let reads = 0;
    const candidate = Object.defineProperty(tokens(), field, {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("Getter must not run");
      },
    });
    rejected(candidate, "invalid", [field]);
    expect(reads).toBe(0);
  });

  it("contains inspection failures and never performs ordinary proxy property reads", () => {
    for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"]) {
      rejected(
        new Proxy(tokens(), {
          [trap]: () => {
            throw new Error(trap);
          },
        }),
        "invalid",
      );
    }
    const revoked = Proxy.revocable(tokens(), {});
    revoked.revoke();
    rejected(revoked.proxy, "invalid");
    let reads = 0;
    const proxy = new Proxy(tokens(), {
      get() {
        reads += 1;
        throw new Error("get");
      },
    });
    expect(derive(proxy)).toStrictEqual(derive(tokens()));
    expect(reads).toBe(0);
  });

  it.each([
    "",
    "ag-default-DARK",
    "custom",
    "__proto__",
  ])("leaves unsupported base %s unresolved", (base) => {
    rejected({ ...tokens(), base }, "unresolved", ["base"]);
  });

  it.each(
    fields.filter((field) => field !== "base"),
  )("leaves unsupported %s strings unresolved", (field) => {
    for (const value of [
      "",
      "red",
      "#fff",
      "#12345678",
      "#gg0000",
      "#12345g",
      "#123456\n",
      " #123456",
      "rgb(0,0,0)",
      "not css",
    ]) {
      rejected({ ...tokens(), [field]: value }, "unresolved", [field]);
    }
  });

  it("classifies malformed structure before unsupported values without mutation", () => {
    const candidate = Object.freeze({ ...tokens(), base: "custom", textColor: 42 });
    rejected(candidate, "invalid", ["textColor"]);
    expect(candidate).toStrictEqual({ ...tokens(), base: "custom", textColor: 42 });
  });
});
