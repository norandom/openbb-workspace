import { type Client, init_server, type Table, worker } from "@perspective-dev/client";
import {
  type HTMLPerspectiveViewerElement,
  init_client,
} from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import "@perspective-dev/viewer/themes/pro.css";
import "@perspective-dev/viewer/themes/pro-dark.css";
import workerUrl from "@perspective-dev/client/dist/cdn/perspective-server.worker.js?url";
import serverWasm from "@perspective-dev/server/dist/wasm/perspective-server.wasm?url";
import viewerWasm from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url";
import { createLeasePool } from "./leases";

export type PerspectiveViewer = HTMLPerspectiveViewerElement;
export type PerspectiveTable = Table;
export type PerspectiveRows = ReadonlyArray<
  Record<string, string | number | boolean | null>
>;
export type PerspectiveTheme = "light" | "dark";
let initialization: Promise<void> | undefined;

async function asset(url: string): Promise<ArrayBuffer> {
  const location = new URL(url, window.location.href);
  if (location.origin !== window.location.origin)
    throw new Error("Perspective assets require the application origin");
  const response = await fetch(location);
  if (!response.ok)
    throw new Error(`Perspective asset unavailable (${response.status})`);
  return response.arrayBuffer();
}

function initialize(): Promise<void> {
  initialization ??= (async () => {
    const [engine, viewer] = await Promise.all([asset(serverWasm), asset(viewerWasm)]);
    init_server(engine);
    await init_client(viewer);
  })().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

async function connect(dedicated: Worker): Promise<Client> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fail: (event: ErrorEvent) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = (event) => {
      event.preventDefault();
      reject(new Error("Perspective worker failed to initialize"));
    };
    dedicated.addEventListener("error", fail);
    timer = setTimeout(
      () => reject(new Error("Perspective worker initialization timed out")),
      15000,
    );
  });
  try {
    return await Promise.race([worker(Promise.resolve(dedicated)), failed]);
  } catch (error) {
    dedicated.terminate();
    throw error;
  } finally {
    clearTimeout(timer);
    dedicated.removeEventListener("error", fail);
  }
}

async function createEngine(): Promise<Client> {
  await initialize();
  // Supplying a real Worker prevents the vendor's silent main-thread fallback.
  const dedicated = new Worker(workerUrl, {
    type: "module",
    name: "qopenbb-perspective",
  });
  return connect(dedicated);
}

const engines = createLeasePool(createEngine);
export const acquireEngine = engines.acquire;
export const createViewer = (): PerspectiveViewer =>
  document.createElement("perspective-viewer");
