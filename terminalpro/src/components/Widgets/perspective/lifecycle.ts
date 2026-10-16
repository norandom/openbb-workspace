import {
  acquireEngine,
  type PerspectiveRows,
  type PerspectiveTable,
  type PerspectiveTheme,
  type PerspectiveViewer,
} from "./runtime";

export function createSession(
  makeViewer: () => PerspectiveViewer,
  rows: PerspectiveRows,
  initialTheme: PerspectiveTheme,
) {
  let stopped = false;
  let viewer: PerspectiveViewer | undefined;
  let loaded = false;
  let table: PerspectiveTable | undefined;
  let lease: Awaited<ReturnType<typeof acquireEngine>> | undefined;
  let disposal: Promise<void> | undefined;
  let tail = Promise.resolve();

  function enqueue(action: () => Promise<void>) {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  }
  function active() {
    if (stopped) throw new DOMException("Perspective host removed", "AbortError");
  }
  async function cleanup() {
    const owned = lease;
    lease = undefined;
    const ownedTable = table;
    table = undefined;
    const ownedViewer = viewer;
    viewer = undefined;
    loaded = false;
    try {
      if (ownedViewer) await ownedViewer.delete();
    } finally {
      try {
        if (ownedTable) await ownedTable.delete();
      } finally {
        await owned?.release();
      }
    }
  }
  async function applyTheme(theme: PerspectiveTheme) {
    if (!viewer) return;
    await viewer.restore({ theme: theme === "dark" ? "Pro Dark" : "Pro Light" });
    await viewer.restyleElement();
  }
  async function start() {
    try {
      active();
      lease = await acquireEngine();
      active();
      viewer = makeViewer();
      viewer.setAutoSize(false);
      await viewer.setAutoPause(false);
      active();
      table = await lease.resource.table(rows.map((row) => ({ ...row })));
      active();
      await viewer.load(table);
      active();
      await viewer.restore({ plugin: "Datagrid" });
      await applyTheme(initialTheme);
      loaded = true;
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
  const ready = enqueue(start);
  return {
    ready,
    dispose() {
      stopped = true;
      disposal ??= enqueue(cleanup);
      return disposal;
    },
    resize: () =>
      enqueue(async () => {
        if (loaded && !stopped) await viewer?.resize();
      }),
    theme: (theme: PerspectiveTheme) =>
      enqueue(async () => {
        if (loaded && !stopped) await applyTheme(theme);
      }),
  };
}
