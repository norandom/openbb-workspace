import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PeerEditor } from "../../src/components/Widgets/CompanyResearch/PeerEditor";
import type { CompanyResearchConfig } from "../../src/lib/companyResearch/config";
import type { CompanySearchPort, ListingChoice } from "../../src/components/General/Table/NavBar/companySelection.contract";

const sourceKey = JSON.stringify(["connected", "https://example.test/data"]);
const source = { sourceKey, searchEndpoint: "https://example.test/data/api/v1/equity/search", requestInit: {} };
const apple: ListingChoice = { provider: "fmp", symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", exchangeShortName: null, currency: "USD", listingId: null, issuerId: null };
const microsoft = { ...apple, symbol: "MSFT", name: "Microsoft" };
const empty: CompanyResearchConfig = { version: 1, peers: [], period: "annual", limit: 5 };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
function mount(config = empty, failure = false, connected = true, reject = false) {
  const changed = vi.fn();
  const port: CompanySearchPort = async (_, request) => failure
    ? { kind: "failed", request, failure: { code: "entitlement", message: "Search access unavailable.", retryable: false } }
    : { kind: "ready", request, rows: [apple, microsoft], retrievedAt: null };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  function Host() {
    const [value, setValue] = useState(config);
    return <QueryClientProvider client={client}><PeerEditor config={value} source={connected ? source : null} searchPort={port} onChange={next => {
      if (reject) throw new Error("Save refused");
      changed(next); setValue(next);
    }} /></QueryClientProvider>;
  }
  render(<Host />);
  return changed;
}
async function search() {
  fireEvent.change(screen.getByRole("textbox", { name: "Find candidate peers" }), { target: { value: "apple" } });
  return screen.findByRole("button", { name: /Add Apple/ });
}
it("requires explicit membership and preserves rationale and order through keyboard controls", async () => {
  const changed = mount();
  const add = await search();
  expect(changed).not.toHaveBeenCalled();
  add.focus(); await userEvent.keyboard("{Enter}");
  fireEvent.change(screen.getByRole("textbox", { name: "Rationale for AAPL" }), { target: { value: "Similar products" } });
  await userEvent.click(screen.getByRole("button", { name: /Add Microsoft/ }));
  await userEvent.click(screen.getByRole("button", { name: "Move MSFT up" }));
  await waitFor(() => expect(changed.mock.lastCall?.[0].peers.map(p => p.identity.symbol)).toEqual(["MSFT", "AAPL"]));
  expect(changed.mock.lastCall?.[0].peers[1].rationale).toBe("Similar products");
  await userEvent.click(screen.getByRole("button", { name: "Remove MSFT" }));
  expect(changed.mock.lastCall?.[0].peers[0].identity).toEqual({ ...apple, sourceKey });
});
it("rejects duplicate requests and retains oversized rationale drafts visibly", async () => {
  const changed = mount({ ...empty, peers: [{ identity: { ...apple, sourceKey }, rationale: "saved" }] });
  await userEvent.click(await search());
  expect(screen.getByRole("alert").textContent).toMatch(/Duplicate/);
  expect(changed).not.toHaveBeenCalled();
  const rationale = screen.getByRole("textbox", { name: "Rationale for AAPL" });
  fireEvent.change(rationale, { target: { value: "x".repeat(2001) } });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/2000/));
  expect(rationale).toHaveValue("x".repeat(2001));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(rationale, { target: { value: "Corrected rationale" } });
  await waitFor(() => expect(changed.mock.lastCall?.[0].peers[0].rationale).toBe("Corrected rationale"));
  expect(screen.queryByRole("alert")).toBeNull();
});
it("keeps choices on search failure and discloses unavailable listing facts", async () => {
  const changed = mount({ ...empty, peers: [{ identity: { ...apple, name: null, exchange: null, sourceKey }, rationale: "retain" }] }, true);
  fireEvent.change(screen.getByRole("textbox", { name: "Find candidate peers" }), { target: { value: "apple" } });
  await screen.findByText("Search access unavailable.");
  expect(screen.getByText(/Name unavailable/)).toBeTruthy();
  expect(screen.getByText(/Exchange unavailable/)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Rationale for AAPL" })).toHaveValue("retain");
  expect(changed).not.toHaveBeenCalled();
});
it("preserves foreign-source choices when search is unavailable and reports parent rejection", async () => {
  mount({ ...empty, peers: [{ identity: { ...apple, sourceKey }, rationale: "saved" }] }, false, false, true);
  expect(screen.getByText(/Source unavailable for this saved listing/)).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Rationale for AAPL" }), { target: { value: "draft" } });
  await screen.findByText("Save refused");
  expect(screen.getByRole("textbox", { name: "Rationale for AAPL" })).toHaveValue("draft");
});
it("rejects a twenty-first peer and preserves all twenty choices", async () => {
  const peers = Array.from({ length: 20 }, (_, i) => ({ identity: { ...apple, symbol: `P${i}`, sourceKey }, rationale: "" }));
  const changed = mount({ ...empty, peers });
  await userEvent.click(await search());
  expect(screen.getByRole("alert").textContent).toMatch(/20/);
  expect(screen.getAllByRole("textbox", { name: /Rationale for/ })).toHaveLength(20);
  expect(changed).not.toHaveBeenCalled();
});
it("edits saved foreign-source choices without rebinding their identity", async () => {
  const foreign = { ...apple, sourceKey: JSON.stringify(["other", "https://other.test/data"]) };
  const changed = mount({ ...empty, period: "quarter", peers: [{ identity: foreign, rationale: "saved" }] });
  fireEvent.change(screen.getByRole("textbox", { name: "Rationale for AAPL" }), { target: { value: "Retained identity" } });
  await waitFor(() => expect(changed.mock.lastCall?.[0]).toEqual({ ...empty, period: "quarter", peers: [{ identity: foreign, rationale: "Retained identity" }] }));
  expect(screen.getByText(/Source unavailable for this saved listing/)).toBeTruthy();
});
