import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import ObservationInspector from "../../src/components/Widgets/CompanyResearch/ObservationInspector";
import { parseFinancialEvidence } from "../../src/lib/companyResearch/financialEnvelope";

afterEach(cleanup);
const evidence = parseFinancialEvidence("apple", { results: [{ date: "2025-12-31", cash: 0, sbc: null }, { date: "2025-12-31", cash: -12 }] });
it("selects original duplicate rows and fields, preserving zero, negative and missing values", async () => {
  const user = userEvent.setup();
  render(<ObservationInspector evidence={evidence} lifecycle={{status: "success", contextKey: "apple", evidence}} />);
  screen.getByRole("button", {name: "Inspect observations"}).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", {name: "Observation evidence"})).toBeVisible();
  await user.click(screen.getByRole("combobox", {name: "Field"}));
  await user.click(screen.getByRole("option", {name: "cash"}));
  expect(screen.getByTestId("observation-value")).toHaveTextContent("0");
  await user.click(screen.getByRole("combobox", {name: "Original observation"}));
  await user.click(screen.getByRole("option", {name: /Original row 1/}));
  expect(screen.getByTestId("observation-value")).toHaveTextContent("-12");
  await user.click(screen.getByRole("combobox", {name: "Field"}));
  await user.click(screen.getByRole("option", {name: "sbc"}));
  expect(screen.getByTestId("observation-value")).toHaveTextContent("Missing (field absent)");
  expect(screen.getByText("Unknown (absent metadata)")).toBeVisible();
  expect(screen.queryByText(/stock.based compensation/i)).toBeNull();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", {name: "Inspect observations"})).toHaveFocus();
});
it("discards an open old context and refuses mismatched evidence", async () => {
  const user = userEvent.setup();
  const view = render(<ObservationInspector evidence={evidence} lifecycle={{status: "stale", contextKey: "apple", evidence, failedAt: "2026-11-14T01:00:00Z", error: "failed"}} />);
  await user.click(screen.getByRole("button", {name: "Inspect observations"}));
  expect(screen.getByText(/Stale evidence/)).toBeVisible();
  view.rerender(<ObservationInspector evidence={evidence} lifecycle={{status: "loading", contextKey: "other", evidence: null}} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", {name: "Inspect observations"})).toBeDisabled();
});
it("renders supplied metadata, actual ordinals, independent dates and transformations", async () => {
  const metadata = {
    schema_version: 1, dataset: "cashflow", provider: "fmp", retrieved_at: "2026-11-14T08:00:00Z",
    source: { endpoint: "equity/fundamental/cash", documentation: "https://example.test/provider" },
    fields: { sbc: { definition: "Reported stock-based compensation", unit: "currency", scale: 1000, currency_field: "currency", period_basis: "flow", value_origin: "provider_observation", financial_basis: { cash: "Reported cash basis" }, accounting_note: "<b>Supplied expense note</b>" } },
    bounds: { returned_count: 2 }, observation_date_field: "date", valuation_date_field: "market", publication_date_field: "published",
    limitations: ["No adjustment evidence"], transformations: [{name: "reported", affected_fields: ["sbc"], definition: "Unadjusted provider input", source_basis: "Reported statement"}],
    statement_provenance: {version: 1, rows: [9, 3].map((source_ordinal, row_index) => ({row_index, source_ordinal, fiscal_year: 2025, fiscal_period: "FY", period_end: "2025-12-31", requested_frequency: "annual", coverage_status: "unavailable", flow_coverage: "unknown", filing_date: "2026-01-15", accepted_date: "2026-01-15T10:00:00Z"}))},
  };
  const supplied = parseFinancialEvidence("known", {results: [{sbc: 12, currency: "USD", date: "2025-12-31", market: "2026-01-02", published: "2026-01-15"}, {sbc: null, currency: "EUR", date: "2025-12-31"}], extra: {results_metadata: {__qopenbb_financial__: metadata}}});
  expect(supplied.metadata.status).toBe("known");
  const user = userEvent.setup();
  render(<ObservationInspector evidence={supplied} lifecycle={{status: "success", contextKey: "known", evidence: supplied}} />);
  await user.click(screen.getByRole("button", {name: "Inspect observations"}));
  expect(screen.getByText("Reported stock-based compensation")).toBeVisible();
  expect(screen.getByText("1000")).toBeVisible();
  expect(screen.getByText("USD")).toBeVisible();
  expect(screen.getByText("2026-01-02")).toBeVisible();
  expect(screen.getByText("provider_observation")).toBeVisible();
  expect(screen.getByText("Unadjusted provider input")).toBeVisible();
  expect(screen.getByText("No adjustment evidence")).toBeVisible();
  expect(screen.getByRole("link", {name: /Provider documentation/})).toHaveAttribute("href", "https://example.test/provider");
  await user.click(screen.getByText("Supplied field metadata"));
  expect(screen.getByText(/accounting_note/)).toHaveTextContent("<b>Supplied expense note</b>");
  expect(document.querySelector("pre b")).toBeNull();
  await user.click(screen.getByRole("combobox", {name: "Original observation"}));
  await user.click(screen.getByRole("option", {name: /Source ordinal 3/}));
  expect(screen.getByTestId("observation-value")).toHaveTextContent("Missing (null)");
  expect(screen.getByText("EUR")).toBeVisible();
});

it.each([
  ["ebitda", "Provider EBITDA excludes SBC as a non-cash add-back.", -12],
  ["operating_cash_flow", "Supplied reconciliation retains SBC expense in this measure.", 0],
  ["free_cash_flow", "Provider free cash flow; SBC treatment unspecified.", 17],
])("preserves supplied %s treatment evidence without house adjustments", async (field, definition, value) => {
  const supplied = parseFinancialEvidence("basis", { results: [{ [field]: value }], extra: { results_metadata: { __qopenbb_financial__: {
    schema_version: 1, dataset: "metrics", provider: "fmp", retrieved_at: "2026-11-14T08:00:00Z",
    source: { endpoint: "equity/fundamental/metrics" }, bounds: { returned_count: 1 },
    fields: { [field]: { definition, value_origin: "provider_calculation" } },
  } } } });
  expect(supplied.metadata.status).toBe("known");
  const user = userEvent.setup();
  render(<ObservationInspector evidence={supplied} lifecycle={{ status: "success", contextKey: "basis", evidence: supplied }} />);
  await user.click(screen.getByRole("button", { name: "Inspect observations" }));
  expect(screen.getByText(definition)).toBeVisible();
  expect(screen.getByTestId("observation-value")).toHaveTextContent(String(value));
  expect(screen.getByText(/SBC treatment is unknown unless/)).toBeVisible();
  expect(screen.getByText(/no house economic-cost adjustment is applied/)).toBeVisible();
});
