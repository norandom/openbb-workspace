import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock("../../src/components/Widgets/perspective/runtime", () => ({
  acquireEngine: mocks.acquire,
}));

import { createSession } from "../../src/components/Widgets/perspective/lifecycle";

function fixture() {
  const order: string[] = [];
  const table = {
    delete: vi.fn(async () => {
      order.push("table");
    }),
  };
  const release = vi.fn(async () => {
    order.push("worker");
  });
  const viewer = {
    setAutoSize: vi.fn(),
    setAutoPause: vi.fn(async () => {}),
    load: vi.fn(async () => {}),
    restore: vi.fn(async () => {}),
    resize: vi.fn(async () => {}),
    restyleElement: vi.fn(async () => {}),
    delete: vi.fn(async () => {
      order.push("viewer");
    }),
  };
  const lease = { resource: { table: vi.fn(async () => table) }, release };
  mocks.acquire.mockResolvedValue(lease);
  return { viewer, lease, table, release, order };
}

describe("Perspective host resource ownership", () => {
  it("deletes the viewer, then table, then releases its lease once", async () => {
    const f = fixture();
    const session = createSession(
      () => f.viewer as never,
      [{ value: 123.45 }],
      "light",
    );
    await session.ready;
    await session.dispose();
    await session.dispose();
    expect(f.order).toEqual(["viewer", "table", "worker"]);
  });
  it("releases a late lease without loading a detached viewer", async () => {
    const f = fixture();
    let finish!: (value: typeof f.lease) => void;
    mocks.acquire.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const session = createSession(
      () => f.viewer as never,
      [{ value: 123.45 }],
      "light",
    );
    const ready = expect(session.ready).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    const disposed = session.dispose();
    finish(f.lease);
    await ready;
    await disposed;
    expect(f.viewer.load).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("cleans all owned resources even when viewer deletion fails", async () => {
    const f = fixture();
    f.viewer.delete.mockRejectedValue(new Error("viewer delete failed"));
    const session = createSession(
      () => f.viewer as never,
      [{ value: 123.45 }],
      "light",
    );
    await session.ready;
    await expect(session.dispose()).rejects.toThrow("viewer delete failed");
    expect(f.table.delete).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("serializes resize and theme changes and cleans failed load", async () => {
    const f = fixture();
    const session = createSession(
      () => f.viewer as never,
      [{ value: 123.45 }],
      "light",
    );
    await session.ready;
    await session.theme("dark");
    await session.resize();
    expect(f.viewer.restore).toHaveBeenLastCalledWith({ theme: "Pro Dark" });
    expect(f.viewer.restyleElement).toHaveBeenCalled();
    await session.dispose();
    const broken = fixture();
    broken.viewer.load.mockRejectedValue(new Error("load failed"));
    const failed = createSession(() => broken.viewer as never, [{ value: 1 }], "light");
    await expect(failed.ready).rejects.toThrow("load failed");
    expect(broken.order).toEqual(["viewer", "table", "worker"]);
  });
  it("does not allocate a native viewer when engine acquisition fails", async () => {
    mocks.acquire.mockRejectedValue(new Error("worker blocked"));
    const makeViewer = vi.fn();
    const failed = createSession(makeViewer, [{ value: 1 }], "light");
    await expect(failed.ready).rejects.toThrow("worker blocked");
    await failed.dispose();
    expect(makeViewer).not.toHaveBeenCalled();
  });
});
