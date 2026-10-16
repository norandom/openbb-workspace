import assert from "node:assert/strict";
import { test } from "node:test";
import { isBackendOrigin, sessionHeaders } from "../../src/lib/utils/backendOrigin.ts";
const origin = "https://workspace.example";
const backend = "/api";
for (const url of ["/api/pro/user", `${origin}/api/pro/user`, "/api", "/api?x=1", "/foo/../api/pro/user", "https://WORKSPACE.example:443/api/pro/user"]) {
  test(`application route ${url}`, () => assert.equal(isBackendOrigin(url, backend, origin), true));
}
for (const url of ["/data/api/v1/equity/profile", "/apiary", "/api-v2/user", "https://other.example/api/user", "//other.example/api/user", "/agent/api", "/api/../data/api/v1", "https://payments.openbb.co/pro/files/id", "https://workspace.example.evil/api", "data:text/plain,/api", "http://workspace.example/api"]) {
  test(`connector route ${url}`, () => { assert.equal(isBackendOrigin(url, backend, origin), false); assert.equal(sessionHeaders(url, undefined, "session", backend, origin).has("authorization"), false); });
}
test("absolute backend normalizes origin and trailing slash", () => {
  assert.equal(isBackendOrigin("/api/user", "https://WORKSPACE.example:443/api/", origin), true);
  assert.equal(isBackendOrigin("https://other.example/api/user", "https://other.example/api", origin), true);
  assert.equal(isBackendOrigin("/api/user", "https://other.example/api", origin), false);
});
test("invalid or empty configuration fails closed", () => {
  for (const configured of ["", "/", "::bad", "data:text/plain,api"]) assert.equal(isBackendOrigin("/api/user", configured, origin), false);
});
for (const headers of [{ authorization: "Connector secret", "X-Provider": "fmp" }, new Headers({ AUTHORIZATION: "Connector secret" }), [["Authorization", "Connector secret"]]]) {
  test(`external connector headers survive ${headers.constructor.name}`, () => {
    const result = sessionHeaders("/data/api/v1", headers, "session", backend, origin);
    assert.equal(result.get("authorization"), "Connector secret");
  });
}
test("application session replaces Authorization case-insensitively", () => {
  const result = sessionHeaders("/api/pro/user", { authorization: "old", "X-Custom": "kept" }, "session", backend, origin);
  assert.equal(result.get("authorization"), "Bearer session");
  assert.equal(result.get("X-Custom"), "kept");
  assert.equal([...result.keys()].filter(key => key === "authorization").length, 1);
});
test("opt-out and absent session preserve explicit credentials", () => {
  for (const [token, enabled] of [[undefined, true], ["session", false]]) {
    assert.equal(sessionHeaders("/api/user", { Authorization: "own" }, token, backend, origin, enabled).get("authorization"), "own");
  }
});
