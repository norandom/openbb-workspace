import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useJsonData } from "~/lib/api";
import { useAuthStore } from "~/lib/state/auth";
import { HttpResponse, http, server, setupMSW } from "../../mocks/msw-utils";
import { mockConfig } from "../../mocks/runtimeConfig";

const BACKEND_URL = "http://localhost:3000/api";
const TEST_TOKEN = "test-token";
const CSV_BODY = "a,b\n1,2";

function fileHandler(backendUrl: string) {
  return http.get(`${backendUrl}/pro/files/:fileName`, ({ request }) => {
    if (request.headers.get("Authorization") !== `Bearer ${TEST_TOKEN}`) {
      return HttpResponse.json(
        { detail: "Not authenticated", status: 401 },
        { status: 401 },
      );
    }
    return HttpResponse.text(CSV_BODY);
  });
}

function createWrapper() {
  const queryClient = new QueryClient();
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useJsonData bearer token on stored file URLs", () => {
  setupMSW();

  beforeEach(() => {
    const previousBackend = mockConfig.urls.backend;
    mockConfig.urls.backend = BACKEND_URL;
    useAuthStore.setState({ user: { token: TEST_TOKEN } } as never);
    return () => {
      mockConfig.urls.backend = previousBackend;
    };
  });

  it.each([
    "https://payments.openbb.co",
    "https://payments.openbb.dev",
  ])("keeps the Workspace session out of legacy %s file requests", async (legacyOrigin) => {
    let authHeader: string | null = "unset";
    server.use(
      http.get(`${legacyOrigin}/pro/files/:fileName`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.text(CSV_BODY);
      }),
    );

    const { result } = renderHook(
      () =>
        useJsonData(
          {
            url: `${legacyOrigin}/pro/files/f97d5f4b-ec11-4bcc-b4a7-afce535f8118.csv`,
            asText: true,
          },
          { retry: false },
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(CSV_BODY);
    expect(authHeader).toBeNull();
  });

  it("authenticates file URLs under the configured Workspace backend path", async () => {
    server.use(fileHandler(BACKEND_URL));

    const { result } = renderHook(
      () =>
        useJsonData(
          { url: `${BACKEND_URL}/pro/files/some-file.csv`, asText: true },
          { retry: false },
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(CSV_BODY);
  });

  it("does not send the token to non-file paths on the legacy origin", async () => {
    let authHeader: string | null = "unset";
    server.use(
      http.get("https://payments.openbb.co/pro/widgets", ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    const { result } = renderHook(
      () =>
        useJsonData(
          { url: "https://payments.openbb.co/pro/widgets" },
          { retry: false },
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authHeader).toBeNull();
  });

  it("does not send the token to external hosts", async () => {
    let authHeader: string | null = "unset";
    server.use(
      http.get("https://example.com/data", ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    const { result } = renderHook(
      () => useJsonData({ url: "https://example.com/data" }, { retry: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authHeader).toBeNull();
  });
});
