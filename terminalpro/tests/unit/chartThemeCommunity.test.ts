import { describe, expect, it } from "vitest";
import {
  getThemeDefaults,
  readChartTheme,
  serializeChartTheme,
} from "../../src/components/ThemeSettings/chartThemeState";
import { buildChartPreview } from "../../src/components/ThemeSettings/chartThemePreview";

describe("Community chart theme editing", () => {
  it("previews supported palette and params without Enterprise background images", () => {
    const state = getThemeDefaults("dark");
    state.backgroundImage = {
      ...state.backgroundImage,
      enabled: true,
      url: "https://example.invalid/logo.svg",
    };
    state.fills = ["#123456", "#abcdef"];
    state.fontSize = 18;
    Object.assign(state, {
      backgroundImageEnabled: true,
      backgroundImageUrl: "saved-logo",
    });
    const options = buildChartPreview(state, "dark");
    expect(options.theme).toMatchObject({
      palette: { fills: state.fills },
      params: { fontSize: 18 },
    });
    expect(options.background ?? {}).not.toHaveProperty("image");
    expect((options.theme as any).params).not.toHaveProperty("backgroundImageEnabled");
    expect(serializeChartTheme(state).params).toHaveProperty(
      "backgroundImageEnabled",
      true,
    );
    expect(options.series).toHaveLength(2);
    expect(options.data).toHaveLength(4);
  });

  it("retains saved background image metadata across supported edits and serialization", () => {
    const image = {
      ...getThemeDefaults("light").backgroundImage,
      enabled: false,
      url: "saved-logo",
      opacity: 0,
    };
    const saved = {
      baseTheme: "ag-default" as const,
      palette: { fills: ["red", "blue"], strokes: ["black"] },
      params: { fontSize: 15 },
      backgroundImage: image,
    };
    const state = readChartTheme(saved, "light");
    state.fontSize = 20;
    const result = serializeChartTheme(state);
    expect(result.backgroundImage).toEqual(image);
    expect(result.params.fontSize).toBe(20);
    expect(result.palette.strokes).toHaveLength(2);
    expect(saved.palette.strokes).toEqual(["black"]);
  });

  it("omits empty parameters and preserves zero padding", () => {
    const state = getThemeDefaults("light");
    state.padding = 0;
    state.fontFamily = "";
    const result = serializeChartTheme(state);
    expect(result.params.padding).toBe(0);
    expect(result.params).not.toHaveProperty("fontFamily");
    expect(buildChartPreview(state, "light").theme).toMatchObject({
      params: { padding: 0 },
    });
  });

  it("reset loads isolated defaults and expands preview series with the palette", () => {
    const state = readChartTheme(null, "dark");
    expect(state.isReset).toBe(true);
    state.fills[0] = "changed";
    expect(getThemeDefaults("dark").fills[0]).not.toBe("changed");
    const options = buildChartPreview(state, "dark");
    expect(options.series).toHaveLength(state.fills.length);
    expect(options.data[0]).toHaveProperty("series1");
  });
});

import { act, renderHook } from "@testing-library/react";
import { vi, beforeEach } from "vitest";
import { useChartSettings } from "../../src/components/ThemeSettings/useChartSettings";
const fixture = vi.hoisted(() => ({
  current: { light: null, dark: null } as Record<string, any>,
  save: vi.fn().mockResolvedValue(undefined),
  listener: undefined as undefined | ((current: any) => void),
}));
vi.mock("~/lib/state/theme", () => ({
  useShallowThemeStore: (selector: any) => selector({ theme: "light" }),
}));
vi.mock("~/lib/state/tableChartThemes", () => ({
  useTableChartThemesStore: Object.assign(
    (selector: any) => selector({ saveThemeSettings: fixture.save }),
    {
      getState: () => fixture.current,
      subscribe: (_selector: any, listener: any) => {
        fixture.listener = listener;
        return () => {
          fixture.listener = undefined;
        };
      },
    },
  ),
}));
vi.mock("../../src/components/ThemeSettings/ThemeSettingsLayout", () => ({
  THEME_MODES: ["light", "dark"],
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

describe("chart editor state owner", () => {
  beforeEach(() => {
    fixture.current = { light: null, dark: null };
    fixture.save.mockClear();
  });
  it("edits paired palette colors, isolates modes, saves preserved metadata, and resets", async () => {
    const savedImage = {
      ...getThemeDefaults("light").backgroundImage,
      enabled: true,
      url: "saved-logo",
    };
    fixture.current.light = {
      chartTheme: {
        ...serializeChartTheme(getThemeDefaults("light")),
        backgroundImage: savedImage,
      },
    };
    const { result, unmount } = renderHook(() => useChartSettings());
    const originalCount = result.current.state.fills.length;
    act(() => {
      result.current.addColor();
    });
    expect(result.current.state.fills).toHaveLength(originalCount + 1);
    expect(result.current.state.strokes).toHaveLength(originalCount + 1);
    act(() => {
      result.current.handleColorArrayChange("fills", 0)("red");
    });
    act(() => {
      result.current.onThemeModeChange("dark");
    });
    expect(result.current.state.fills[0]).not.toBe("red");
    act(() => {
      result.current.onThemeModeChange("light");
      result.current.handleInputChange("fontSize", false)("22");
    });
    expect(result.current.state.fontSize).toBe(22);
    act(() => {
      result.current.removeColor(0);
    });
    expect(result.current.state.strokes).toHaveLength(originalCount);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(fixture.save.mock.calls[0][0].light.chartTheme).toMatchObject({
      backgroundImage: savedImage,
      params: { fontSize: 22 },
    });
    act(() => {
      result.current.handleReset();
    });
    expect(result.current.state.isReset).toBe(true);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(fixture.save.mock.calls[1][0].light.chartTheme).toBeNull();
    unmount();
    expect(fixture.listener).toBeUndefined();
  });

  it("reloads subscribed settings without stale numeric input state", () => {
    const { result } = renderHook(() => useChartSettings());
    act(() => {
      result.current.handleInputChange("padding", false)("0");
    });
    expect(result.current.state.padding).toBe(0);
    act(() => {
      fixture.listener?.({
        light: {
          ...serializeChartTheme(getThemeDefaults("light")),
          params: { fontSize: 31 },
        },
        dark: null,
      });
    });
    expect(result.current.state.fontSize).toBe(31);
    expect(result.current.state.padding).toBeUndefined();
  });
});
