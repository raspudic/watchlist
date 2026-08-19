// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";

import { AddTitleActions, type SearchResult } from "./add-title";

afterEach(cleanup);

function makeResult(title: string, overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    externalId: title.length,
    mediaType: "movie",
    title,
    originalTitle: null,
    releaseYear: 2020,
    posterPath: null,
    overview: null,
    popularity: 10,
    voteAverage: 7.5,
    provider: "tmdb",
    ...overrides,
  };
}

/* Routes fetch by the `q` param so each test can hand back per-title results
   or a 429 without caring about call order across the concurrency-4 map. */
function stubSearchFetch(handler: (query: string) => SearchResult[] | { retryAfter: number }) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input, "http://watchlist.test");
    const outcome = handler(url.searchParams.get("q") ?? "");
    if (!Array.isArray(outcome)) {
      return Response.json(
        { error: "You are searching quickly.", code: "RATE_LIMITED", reason: "tmdb_account_burst", retryAfter: outcome.retryAfter },
        { status: 429, headers: { "Retry-After": String(outcome.retryAfter) } },
      );
    }
    return Response.json({ results: outcome });
  }));
}

describe("AddTitleActions rate-limit experience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("preserves the query, explains the cooldown, and keeps custom titles available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      {
        error: "TMDB is temporarily busy.",
        code: "RATE_LIMITED",
        reason: "tmdb_upstream",
        retryAfter: 5,
      },
      { status: 429, headers: { "Retry-After": "5" } },
    )));

    render(
      <AddTitleActions
        onAdd={vi.fn()}
        onBulkAdd={vi.fn()}
      />,
      { wrapper: ToastProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    const input = screen.getByRole("combobox", { name: "Search movies and shows" });
    fireEvent.change(input, { target: { value: "Arrival" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveValue("Arrival");
    expect(screen.getByText("TMDB is temporarily busy. Your library and custom titles still work.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again in 5s" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add “Arrival” as a custom title/ })).toBeEnabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole("button", { name: "Try search again" })).toBeEnabled();
  });
});

describe("AddTitleActions add behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes after adding by default", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <AddTitleActions
        onAdd={onAdd}
        onBulkAdd={vi.fn()}
      />,
      { wrapper: ToastProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Search movies and shows" }), { target: { value: "Arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /Add “Arrival” as a custom title/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Find a title" })).not.toBeInTheDocument();
    });
  });

  it("stays open and resets the search when Quick add is enabled", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <AddTitleActions
        onAdd={onAdd}
        onBulkAdd={vi.fn()}
      />,
      { wrapper: ToastProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Quick add" }));
    const input = screen.getByRole("combobox", { name: "Search movies and shows" });
    fireEvent.change(input, { target: { value: "Arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /Add “Arrival” as a custom title/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Find a title" })).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByText("Added Arrival. Ready for another.")).toBeInTheDocument();
  });
});

describe("AddTitleActions bulk import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("associates the label with the textarea, tracks the parsed count, and disables past the max", () => {
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });
    fireEvent.click(screen.getByRole("button", { name: "Import a list" }));
    const textarea = screen.getByLabelText("Titles");

    fireEvent.change(textarea, { target: { value: "Arrival\nSeverance" } });
    expect(screen.getByText("2 titles found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find matches" })).toBeEnabled();

    const tooMany = Array.from({ length: 41 }, (_, index) => `Title ${index}`).join("\n");
    fireEvent.change(textarea, { target: { value: tooMany } });
    expect(screen.getByText("41 titles found")).toHaveClass("over-limit");
    expect(screen.getByRole("button", { name: "Find matches" })).toBeDisabled();
  });

  it("matches, reviews, and imports the parsed titles", async () => {
    stubSearchFetch((query) => [makeResult(query)]);
    const onBulkAdd = vi.fn().mockResolvedValue({ added: 3, duplicates: 0, failedTitles: [] });
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={onBulkAdd} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Import a list" }));
    fireEvent.change(screen.getByLabelText("Titles"), { target: { value: "Arrival\nSeverance\nDune" } });
    fireEvent.click(screen.getByRole("button", { name: "Find matches" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Review before adding" })).toBeInTheDocument());
    expect(screen.getByText("3 ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add 3 titles" }));
    await waitFor(() => expect(onBulkAdd).toHaveBeenCalledOnce());
    expect(onBulkAdd.mock.calls[0][0]).toEqual([
      makeResult("Arrival"),
      makeResult("Severance"),
      makeResult("Dune"),
    ]);
  });

  it("drops a skipped row from the ready count and the import payload", async () => {
    stubSearchFetch((query) => [makeResult(query)]);
    const onBulkAdd = vi.fn().mockResolvedValue({ added: 2, duplicates: 0, failedTitles: [] });
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={onBulkAdd} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Import a list" }));
    fireEvent.change(screen.getByLabelText("Titles"), { target: { value: "Arrival\nSeverance\nDune" } });
    fireEvent.click(screen.getByRole("button", { name: "Find matches" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Review before adding" })).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: "Skip" })[1]);
    expect(screen.getByText("2 ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add 2 titles" }));
    await waitFor(() => expect(onBulkAdd).toHaveBeenCalledOnce());
    expect(onBulkAdd.mock.calls[0][0]).toEqual([makeResult("Arrival"), makeResult("Dune")]);
  });

  it("lets the picker fall back to the original title as a custom entry", async () => {
    stubSearchFetch((query) => [makeResult(query)]);
    const onBulkAdd = vi.fn().mockResolvedValue({ added: 1, duplicates: 0, failedTitles: [] });
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={onBulkAdd} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Import a list" }));
    fireEvent.change(screen.getByLabelText("Titles"), { target: { value: "A Weird One" } });
    fireEvent.click(screen.getByRole("button", { name: "Find matches" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Review before adding" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: 'Use "A Weird One"' }));

    fireEvent.click(screen.getByRole("button", { name: "Add 1 title" }));
    await waitFor(() => expect(onBulkAdd).toHaveBeenCalledOnce());
    expect(onBulkAdd.mock.calls[0][0]).toEqual([{ provider: "custom", mediaType: "other", title: "A Weird One" }]);
  });

  it("leaves a rate-limited row unresolved, shows the cooldown banner, and does not block the rest", async () => {
    stubSearchFetch((query) => (query === "Severance" ? { retryAfter: 7 } : [makeResult(query)]));
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Import a list" }));
    fireEvent.change(screen.getByLabelText("Titles"), { target: { value: "Arrival\nSeverance\nDune" } });
    fireEvent.click(screen.getByRole("button", { name: "Find matches" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Review before adding" })).toBeInTheDocument());
    expect(screen.getByText(/TMDB paused some lookups.*7 seconds/)).toBeInTheDocument();
    expect(screen.getByText("2 ready")).toBeInTheDocument();
    expect(screen.getByText("Search failed")).toBeInTheDocument();
  });

  it("scopes bulk lookups to the import tier but leaves the picker's search unscoped", async () => {
    stubSearchFetch((query) => [makeResult(query)]);
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Import a list" }));
    fireEvent.change(screen.getByLabelText("Titles"), { target: { value: "Arrival" } });
    fireEvent.click(screen.getByRole("button", { name: "Find matches" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Review before adding" })).toBeInTheDocument());

    const bulkUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string, "http://watchlist.test");
    expect(bulkUrl.searchParams.get("scope")).toBe("bulk");

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Change match for Arrival" }),
      { target: { value: "Arrival Redux" } },
    );

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1));
    const pickerUrl = new URL(vi.mocked(fetch).mock.calls.at(-1)![0] as string, "http://watchlist.test");
    expect(pickerUrl.searchParams.get("scope")).toBeNull();
  });
});
