// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ acquireEngine: vi.fn(), createViewer: vi.fn() }));
vi.mock("../../src/components/Widgets/perspective/runtime", () => mocks);

import { PerspectiveHost } from "../../src/components/Widgets/perspective/PerspectiveHost";

afterEach(() => {
  vi.unstubAllGlobals();
});
it("shows engine failure without constructing an orphan native viewer", async () => {
  mocks.acquireEngine.mockRejectedValue(new Error("synthetic blocked worker"));
  mocks.createViewer.mockImplementation(() => document.createElement("div"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const host = render(<PerspectiveHost data={[{ value: 123.45 }]} theme="light" />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Perspective unavailable"),
  );
  host.unmount();
  expect(mocks.createViewer).not.toHaveBeenCalled();
});
