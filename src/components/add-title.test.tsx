// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegionProvider } from "@/components/region-provider";
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

function SearchProviders({ children }: { children: ReactNode }) {
  return (
    <RegionProvider regions={["US"]} suggestedRegion="US">
      <ToastProvider>{children}</ToastProvider>
    </RegionProvider>
  );
}

function stubPreviewFetch(results: SearchResult[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://watchlist.test");
    if (url.pathname === "/api/search") return Response.json({ results });
    if (url.pathname === "/api/watch-regions") {
      return Response.json({ regions: [{ code: "US", name: "United States of America" }] });
    }
    if (url.pathname === "/api/watch-providers") {
      return Response.json({
        providers: {
          US: {
            region: "US",
            link: "https://tmdb.test/watch",
            streaming: [{ id: 8, name: "Netflix", logoPath: null }],
            rentOrBuy: [],
          },
        },
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
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
      await vi.advanceTimersByTimeAsync(350);
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

describe("AddTitleActions optimized search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps two-character TMDB searches with a longer debounce", async () => {
    stubSearchFetch((query) => [makeResult(query)]);
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Search movies and shows" }),
      { target: { value: "Up" } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("option", { name: "Preview Up" })).toBeInTheDocument();
  });

  it("waits longer for uncached deletions but restores cached prefixes immediately", async () => {
    stubSearchFetch((query) => [makeResult(query)]);
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    const input = screen.getByRole("combobox", { name: "Search movies and shows" });

    fireEvent.change(input, { target: { value: "Cachin" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.getByRole("option", { name: "Preview Cachin" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Caching" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.getByRole("option", { name: "Preview Caching" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: "Cachin" } });
    await act(async () => undefined);

    expect(screen.getByRole("option", { name: "Preview Cachin" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: "Cachi" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
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

describe("AddTitleActions preview behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the shared detail presentation from the row and updates the preview action after adding", async () => {
    const result = makeResult("Arrival", {
      externalId: 329865,
      overview: "A linguist works with the military to communicate with alien lifeforms.",
      releaseYear: 2016,
    });
    stubPreviewFetch([result]);
    const onAdd = vi.fn().mockResolvedValue(undefined);

    render(<AddTitleActions onAdd={onAdd} onBulkAdd={vi.fn()} />, { wrapper: SearchProviders });
    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Search movies and shows" }),
      { target: { value: "Arrival" } },
    );

    fireEvent.click(await screen.findByRole("option", { name: "Preview Arrival" }));

    expect(screen.getByRole("dialog", { name: "Arrival" })).toBeInTheDocument();
    expect(screen.getByText(result.overview as string)).toBeInTheDocument();
    expect(screen.getByText("Where to watch")).toBeInTheDocument();
    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I watched it" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to Watchlist" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(result));
    expect(await screen.findByRole("button", { name: "Added to Watchlist" })).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "Arrival" })).toBeInTheDocument();
  });

  it("adds directly without opening preview when the row's Add button is clicked", async () => {
    const result = makeResult("Moon", { externalId: 17431 });
    stubPreviewFetch([result]);
    const onAdd = vi.fn(() => new Promise<void>(() => undefined));

    render(<AddTitleActions onAdd={onAdd} onBulkAdd={vi.fn()} />, { wrapper: SearchProviders });
    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Search movies and shows" }),
      { target: { value: "Moon" } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add Moon to watchlist" }));
    expect(onAdd).toHaveBeenCalledWith(result);
    expect(screen.queryByRole("dialog", { name: "Moon" })).not.toBeInTheDocument();
  });

  it("uses modified Enter for preview and plain Enter for adding the highlighted result", async () => {
    const first = makeResult("Alien", { externalId: 348 });
    const second = makeResult("Aliens", { externalId: 679 });
    stubPreviewFetch([first, second]);
    const onAdd = vi.fn().mockResolvedValue(undefined);

    render(<AddTitleActions onAdd={onAdd} onBulkAdd={vi.fn()} />, { wrapper: SearchProviders });
    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    const input = screen.getByRole("combobox", { name: "Search movies and shows" });
    fireEvent.change(input, { target: { value: "Alien" } });
    await screen.findByRole("option", { name: "Preview Alien" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Aliens" })).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Aliens" })).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(second));
  });
});

describe("AddTitleActions bulk import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* Import hangs off the primary in the header, so reaching it is two steps. */
  async function openImport() {
    fireEvent.click(screen.getByRole("button", { name: "More ways to add" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import a list" }));
  }

  it("keeps import out of the header until the menu is opened", async () => {
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });

    expect(screen.getByRole("button", { name: "Add a title" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import a list" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More ways to add" }));
    expect(await screen.findByRole("menuitem", { name: "Import a list" })).toBeInTheDocument();
  });

  /* The empty state is where someone with nothing saved actually stands, so
     import stays a plain button there. */
  it("offers import directly in the empty state", () => {
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} variant="empty" />, { wrapper: ToastProvider });

    expect(screen.getByRole("button", { name: "Import a list" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More ways to add" })).not.toBeInTheDocument();
  });

  it("associates the label with the textarea, tracks the parsed count, and disables past the max", async () => {
    render(<AddTitleActions onAdd={vi.fn()} onBulkAdd={vi.fn()} />, { wrapper: ToastProvider });
    await openImport();
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

    await openImport();
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

    await openImport();
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

    await openImport();
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

    await openImport();
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

    await openImport();
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
