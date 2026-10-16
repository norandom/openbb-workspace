import { describe, expect, it, vi } from "vitest";
import { createLeasePool } from "../../src/components/Widgets/perspective/leases";

describe("Perspective dedicated worker leases", () => {
  it("shares one engine and terminates only at the final idempotent release", async () => {
    const engine = { terminate: vi.fn(async () => {}) };
    const factory = vi.fn(async () => engine);
    const pool = createLeasePool(factory);
    const [a, b] = await Promise.all([pool.acquire(), pool.acquire()]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(a.resource).toBe(b.resource);
    await a.release();
    await a.release();
    expect(engine.terminate).not.toHaveBeenCalled();
    await b.release();
    expect(engine.terminate).toHaveBeenCalledTimes(1);
    await (await pool.acquire()).release();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("does not allocate another worker while the previous worker terminates", async () => {
    let finish!: () => void;
    const ending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const factory = vi.fn(async () => ({ terminate: () => ending }));
    const pool = createLeasePool(factory);
    const a = await pool.acquire();
    const released = a.release();
    const next = pool.acquire();
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);
    finish();
    await released;
    await (await next).release();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("permits retry after initialization failure", async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error("WASM unavailable"))
      .mockResolvedValue({ terminate: vi.fn(async () => {}) });
    const pool = createLeasePool(factory);
    await expect(pool.acquire()).rejects.toThrow("WASM unavailable");
    await (await pool.acquire()).release();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
