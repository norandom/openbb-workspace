// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ acquireEngine: vi.fn(), createViewer: vi.fn() }));
vi.mock("../../src/components/Widgets/perspective/runtime", () => mocks);

import { PerspectiveHost } from "../../src/components/Widgets/perspective/PerspectiveHost";

it("ignores an old theme failure after new data creates a ready replacement", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  let rejectOld!: (error: Error) => void;
  let pendingStarted = false;
  let generation = 0;
  mocks.acquireEngine.mockImplementation(async () => ({
    resource: { table: async () => ({ delete: async () => {} }) },
    release: async () => {},
  }));
  mocks.createViewer.mockImplementation(() => {
    const old = generation++ === 0;
    return Object.assign(document.createElement("div"), {
      setAutoSize() {},
      setAutoPause: async () => {},
      load: async () => {},
      resize: async () => {},
      restyleElement: async () => {},
      delete: async () => {},
      restore: async (config: { theme?: string }) => {
        if (old && config.theme === "Pro Dark") {
          pendingStarted = true;
          await new Promise<void>((_, reject) => {
            rejectOld = reject;
          });
        }
      },
    });
  });
  const initial = [{ value: 1 }];
  const host = render(<PerspectiveHost data={initial} theme="light" />);
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  host.rerender(<PerspectiveHost data={initial} theme="dark" />);
  await waitFor(() => expect(pendingStarted).toBe(true));
  host.rerender(<PerspectiveHost data={[{ value: 2 }]} theme="dark" />);
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  await act(async () => {
    rejectOld(new Error("old theme failed"));
  });
  expect(screen.queryByRole("alert")).toBeNull();
  host.unmount();
});
