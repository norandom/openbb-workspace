import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import CompanyDocuments, {
  type CompanyDocumentRow,
} from "~/components/Widgets/CompanyDocuments/CompanyDocuments";

const news: CompanyDocumentRow = Object.freeze({
  symbol: "AAPL",
  title: "Quarterly news",
  date: "2026-01-02T16:35:42",
  publisher: "Example Publisher",
  excerpt: "  Literal <b>excerpt</b>\n\tEnd ",
  content_status: "partial",
  url: "https://example.test/news",
  images: ["https://example.test/image.png"],
});
const transcript: CompanyDocumentRow = Object.freeze({
  symbol: "AAPL",
  year: 2026,
  quarter: "Q1",
  event_datetime: "2026-01-02T16:35:42-05:00",
  content: "  Operator: Hello\n\nCEO: <b>Literal</b>\t\n",
  content_status: "completeness_unknown",
});

function show(
  rows: readonly CompanyDocumentRow[] = [news],
  kind: "news" | "transcript" | "filings" = "news",
) {
  return render(
    <CompanyDocuments rows={rows} kind={kind} contextKey="AAPL" provider="FMP" />,
  );
}

describe("CompanyDocuments", () => {
  it("opens with the keyboard, focuses detail and returns to the selected row on Escape and close", async () => {
    const user = userEvent.setup();
    show([
      news,
      { ...news, title: "Second article", url: "https://example.test/second" },
    ]);
    const row = screen.getByRole("button", { name: /Second article/ });
    row.focus();
    await user.keyboard("{Enter}");
    const detail = screen.getByRole("region", { name: "Document detail" });
    expect(detail).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(row).toHaveFocus();
    expect(
      screen.queryByRole("region", { name: "Document detail" }),
    ).not.toBeInTheDocument();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Close document" }));
    expect(row).toHaveFocus();
  });

  it("shows the exact news excerpt, distinct unknown attribution and no active markup or image", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: /Quarterly news/ }));
    const detail = screen.getByRole("region", { name: "Document detail" });
    expect(within(detail).getByTestId("document-text").textContent).toBe(news.excerpt);
    expect(within(detail).getByText("Example Publisher")).toBeVisible();
    expect(within(detail).getByText("Source unknown")).toBeVisible();
    expect(within(detail).getByText("Author unknown")).toBeVisible();
    expect(within(detail).getByText(/Partial excerpt/)).toBeVisible();
    expect(within(detail).getByText("2026-01-02T16:35:42")).toBeVisible();
    expect(container.querySelector("img, b, link, iframe")).toBeNull();
    expect(screen.getByRole("link", { name: "Article" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("retains transcript whitespace, literal markup, fiscal coordinates and supplied timestamp", () => {
    show([transcript], "transcript");
    fireEvent.click(screen.getByRole("button", { name: /Q1 2026/ }));
    const body = screen.getByTestId("document-text");
    expect(body.textContent).toBe(transcript.content);
    expect(body).toHaveStyle({ whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
    expect(screen.getAllByText(/Q1 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText("2026-01-02T16:35:42-05:00")).toBeVisible();
    expect(screen.getByText("Completeness unknown")).toBeVisible();
  });

  it("offers separate optional filing and index links without claiming inline document content", () => {
    show(
      [
        {
          symbol: "AAPL",
          cik: "0000320193",
          report_type: "10-K",
          filing_date: "2026-01-02",
          accepted_date: "2026-01-02T17:12:13Z",
          filing_url: "https://example.test/index",
          report_url: "http://example.test/document",
          content: "Must not show",
        },
      ],
      "filings",
    );
    fireEvent.click(screen.getByRole("button", { name: /10-K/ }));
    expect(screen.getByText(/Metadata only/)).toBeVisible();
    expect(screen.queryByTestId("document-text")).not.toBeInTheDocument();
    expect(screen.getByText("0000320193")).toBeVisible();
    expect(screen.getByRole("link", { name: "Filing index" })).toHaveAttribute(
      "href",
      "https://example.test/index",
    );
    expect(screen.getByRole("link", { name: "Report document" })).toHaveAttribute(
      "href",
      "http://example.test/document",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,bad",
    "//example.test/article",
    "/local",
    "https://user:secret@example.test",
    "https://example.test/\npath",
  ])("does not expose unsafe navigation %s", (url) => {
    show([{ ...news, url }]);
    fireEvent.click(screen.getByRole("button", { name: /Quarterly news/ }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("preserves selected identity on reorder and closes replaced evidence without mutating rows", () => {
    const second = Object.freeze({ ...news, title: "Second article" });
    const rows = Object.freeze([news, second]);
    const view = show(rows);
    fireEvent.click(screen.getByRole("button", { name: /Second article/ }));
    view.rerender(
      <CompanyDocuments
        rows={[{ ...second }, { ...news }]}
        kind="news"
        contextKey="AAPL"
      />,
    );
    expect(screen.getByRole("region", { name: "Document detail" })).toHaveTextContent(
      "Second article",
    );
    view.rerender(<CompanyDocuments rows={[news]} kind="news" contextKey="AAPL" />);
    expect(
      screen.queryByRole("region", { name: "Document detail" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quarterly news/ })).toHaveFocus();
    expect(rows[1]).toBe(second);
  });

  it("clears selection on context change, including when rows have identical values", () => {
    const view = show();
    fireEvent.click(screen.getByRole("button", { name: /Quarterly news/ }));
    view.rerender(
      <CompanyDocuments rows={[news]} kind="news" contextKey="different query" />,
    );
    expect(
      screen.queryByRole("region", { name: "Document detail" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes no rows and metadata-only news", () => {
    const view = show([]);
    expect(screen.getByText("No documents supplied.")).toBeVisible();
    view.rerender(
      <CompanyDocuments
        rows={[
          { symbol: "AAPL", title: "Headline only", content_status: "metadata_only" },
        ]}
        kind="news"
        contextKey="AAPL"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Headline only/ }));
    expect(screen.getByText(/Metadata only/)).toBeVisible();
    expect(screen.queryByTestId("document-text")).not.toBeInTheDocument();
  });
});
