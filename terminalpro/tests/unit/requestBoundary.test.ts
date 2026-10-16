import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ token: "session" as string | undefined }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (o) => o, useQueries: (o) => o }));
vi.mock("react", () => ({ useCallback: (fn) => fn }));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => ({ widget: {} }) }));
vi.mock("~/lib/utils/widgetParams", () => ({ cleanSearchParams: (url) => url, convertHeadersToRecord: (headers, params) => ({ headers, newParams: params }) }));
vi.mock("~/lib/constants", () => ({ REFRESH_WIDGET_INTERVAL: false }));
vi.mock("~/lib/runtimeConfig", () => ({ getConfig: () => ({ urls: { backend: "/api" } }) }));
vi.mock("~/lib/state/auth", () => ({ useAuthStore: { getState: () => ({ user: { token: auth.token } }) }, useShallowAuthStore: (selector) => selector({ user: { token: auth.token } }) }));
vi.mock("~/lib/state/backendConnector", () => ({ useShallowBackendConnectorStore: () => vi.fn() }));
vi.mock("~/lib/state/permissions", () => ({ useShallowPermissionsStore: () => true }));
vi.mock("~/lib/utils/cronSchedule", () => ({ resolveCronRefetchInterval: () => false }));
import { fetchWithToken, useJsonData, useMultipleQueries } from "../../src/lib/api";

beforeEach(() => {
  auth.token = "session";
  vi.stubGlobal("window", { location: { origin: "https://workspace.example" } });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response('{"ok":true}', { status: 200 })));
});
const callers = {
  fetchWithToken: (url, headers) => fetchWithToken(url, { headers }),
  useJsonData: (url, headers) => useJsonData({ url, endpointHeaders: headers }).queryFn({}),
  useMultipleQueries: (url, headers) => useMultipleQueries([{ url, endpointHeaders: headers }]).queries[0].queryFn({}),
};
for (const [name, call] of Object.entries(callers)) {
  describe(name, () => {
    for (const url of ["/api/pro/user", "https://workspace.example/api/pro/user"]) {
      it(`sends application session to ${url}`, async () => {
        await call(url, { authorization: "old", "X-Custom": "retained" });
        const headers = new Headers(vi.mocked(fetch).mock.calls[0][1].headers);
        expect(headers.get("authorization")).toBe("Bearer session");
        expect(headers.get("X-Custom")).toBe("retained");
      });
    }
    for (const url of ["/data/api/v1/equity/profile", "/apiary", "/agent/api", "https://other.example/api/user", "https://payments.openbb.co/pro/files/id"]) {
      it(`keeps connector authentication for ${url}`, async () => {
        await call(url, { authorization: "connector" });
        const headers = new Headers(vi.mocked(fetch).mock.calls[0][1].headers);
        expect(headers.get("authorization")).toBe("connector");
      });
    }
  });
}
for (const name of ["useJsonData", "useMultipleQueries"]) {
  it(`${name} preserves structured API failures`, async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"detail":"Entitlement required","error_kind":"entitlement"}', { status: 403 }));
    await expect(callers[name]("/data/api/v1/profile", {})).rejects.toMatchObject({ message: "Entitlement required", cause: "entitlement" });
  });
  it(`${name} preserves non-JSON error status`, async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("unavailable", { status: 503, statusText: "Service Unavailable" }));
    await expect(callers[name]("/data/api/v1/profile", {})).rejects.toBe("Service Unavailable");
  });
}
for (const nextToken of ["replacement", undefined]) {
  it(`useMultipleQueries reads current auth at execution and refetch: ${nextToken}`, async () => {
    auth.token = "session-before";
    const query = useMultipleQueries([{ url: "/api/pro/user" }]).queries[0];
    auth.token = nextToken;
    await query.queryFn({});
    let headers = new Headers(vi.mocked(fetch).mock.calls[0][1].headers);
    expect(headers.get("authorization")).toBe(nextToken ? `Bearer ${nextToken}` : null);
    auth.token = nextToken ? undefined : "after-refetch";
    await query.queryFn({});
    headers = new Headers(vi.mocked(fetch).mock.calls[1][1].headers);
    expect(headers.get("authorization")).toBe(auth.token ? `Bearer ${auth.token}` : null);
  });
}
