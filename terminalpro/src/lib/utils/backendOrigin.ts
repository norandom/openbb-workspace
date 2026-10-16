export function isBackendOrigin(
  url: string | URL,
  backend: string,
  origin: string,
): boolean {
  try {
    if (!backend.trim()) return false;
    const base = new URL(backend, origin);
    const target = new URL(url, origin);
    const path = base.pathname.replace(/\/+$/, "");
    return (
      (base.protocol === "https:" || base.protocol === "http:") &&
      path !== "" &&
      target.origin === base.origin &&
      (target.pathname === path || target.pathname.startsWith(`${path}/`))
    );
  } catch {
    return false;
  }
}

export function sessionHeaders(
  url: string | URL,
  headers: HeadersInit | undefined,
  token: string | undefined,
  backend: string,
  origin: string,
  addBearerToken = true,
): Headers {
  const result = new Headers(headers);
  if (addBearerToken && token && isBackendOrigin(url, backend, origin)) {
    result.set("Authorization", `Bearer ${token}`);
  }
  return result;
}
