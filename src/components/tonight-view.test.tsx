// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryCacheProvider } from "@/components/library-cache-provider";
import type { MediaItem } from "@/lib/library-cache";
import type { TonightCandidate, TonightResponse } from "@/lib/tonight";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
  useSearchParams: mocks.useSearchParams,
}));

import { TonightView } from "./tonight-view";

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "item-1",
    provider: "tmdb",
    externalId: 603,
    mediaType: "movie",
    title: "The Matrix",
    originalTitle: null,
    releaseYear: 1999,
    posterPath: null,
    overview: null,
    status: "watchlist",
    watchlistNote: null,
    reviewNote: null,
    rating: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    watchedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<TonightCandidate> = {}): TonightCandidate {
  return {
    item: makeItem(),
    genres: [],
    runtimeMinutes: 136,
    voteAverage: 8.7,
    voteCount: 1000,
    releaseDate: "1999-03-31",
    streaming: [],
    availabilityCheckedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeResponse(overrides: Partial<TonightResponse> = {}): TonightResponse {
  return {
    region: null,
    selectedProviderIds: [],
    candidates: [],
    ...overrides,
  };
}

function stubFetch(response: TonightResponse, patchHandler?: (id: string, body: unknown) => unknown) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/tonight")) return Promise.resolve(Response.json(response));
    const match = url.match(/\/api\/items\/(.+)$/);
    if (match && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return Promise.resolve(Response.json(patchHandler ? patchHandler(match[1], body) : { item: body }));
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  }));
}

function renderView() {
  return render(
    <LibraryCacheProvider scope="account-1">
      <TonightView />
    </LibraryCacheProvider>,
  );
}

beforeEach(() => {
  mocks.usePathname.mockReturnValue("/tonight");
  mocks.useSearchParams.mockReturnValue(new URLSearchParams());
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TonightView", () => {
  it("lists the watchlist candidates with their streaming service names", async () => {
    const candidates = [
      makeCandidate({
        item: makeItem({ id: "item-1", title: "The Matrix" }),
        streaming: [{ id: 8, name: "Netflix", logoPath: null }],
      }),
      makeCandidate({
        item: makeItem({ id: "item-2", title: "Amelie" }),
        streaming: [{ id: 337, name: "Disney Plus", logoPath: null }],
      }),
    ];
    stubFetch(makeResponse({ region: "US", candidates }));

    renderView();

    expect(await screen.findByRole("link", { name: "The Matrix" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amelie" })).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Disney Plus")).toBeInTheDocument();
  });

  it("hides a title that is not on a selected service by default, and shows it under Everything", async () => {
    const onService = makeCandidate({
      item: makeItem({ id: "item-1", title: "The Matrix" }),
      streaming: [{ id: 8, name: "Netflix", logoPath: null }],
    });
    const offService = makeCandidate({
      item: makeItem({ id: "item-2", title: "Amelie" }),
      streaming: [{ id: 337, name: "Disney Plus", logoPath: null }],
    });
    stubFetch(makeResponse({ region: "US", selectedProviderIds: [8], candidates: [onService, offService] }));

    renderView();

    expect(await screen.findByRole("link", { name: "The Matrix" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Amelie" })).not.toBeInTheDocument();

    const everything = screen.getByRole("button", { name: "Everything" });
    everything.click();

    expect(await screen.findByRole("link", { name: "Amelie" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The Matrix" })).toBeInTheDocument();
  });

  it("disables a mood pill with no matches and narrows the list when a matching pill is pressed", async () => {
    const funny = makeCandidate({
      item: makeItem({ id: "item-1", title: "The Matrix" }),
      genres: [{ id: 35, name: "Comedy" }],
    });
    const other = makeCandidate({
      item: makeItem({ id: "item-2", title: "Amelie" }),
      genres: [{ id: 18, name: "Drama" }],
    });
    stubFetch(makeResponse({ candidates: [funny, other] }));

    renderView();
    await screen.findByRole("link", { name: "The Matrix" });

    const suspenseful = screen.getByRole("button", { name: /^Suspenseful/ });
    expect(suspenseful).toBeDisabled();
    expect(suspenseful).toHaveAttribute("aria-pressed", "false");

    const funnyPill = screen.getByRole("button", { name: /^Funny/ });
    expect(funnyPill).not.toBeDisabled();

    funnyPill.click();

    await waitFor(() => expect(funnyPill).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("link", { name: "The Matrix" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Amelie" })).not.toBeInTheDocument();
  });

  it("shows the setup call-to-action and hides the services control with no region or selections", async () => {
    stubFetch(makeResponse({ region: null, selectedProviderIds: [], candidates: [makeCandidate()] }));

    renderView();

    expect(await screen.findByRole("link", { name: "Open settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My services" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Everything" })).not.toBeInTheDocument();
  });

  it("pins a title through PATCH /api/items/<id> and reflects the new state", async () => {
    const item = makeItem({ id: "item-1", title: "The Matrix" });
    stubFetch(
      makeResponse({ candidates: [makeCandidate({ item })] }),
      (id, body) => ({ item: { ...item, id, pinnedAt: (body as { pinned: boolean }).pinned ? "2026-01-02T00:00:00.000Z" : null } }),
    );

    renderView();

    const pinButton = await screen.findByRole("button", { name: "Pin The Matrix for tonight" });
    expect(pinButton).toHaveAttribute("aria-pressed", "false");

    pinButton.click();

    await waitFor(() => expect(screen.getByRole("button", { name: "Unpin The Matrix" })).toHaveAttribute("aria-pressed", "true"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ pinned: true }),
      }),
    );
  });

  it("picks a title and offers no repick when only one candidate matches", async () => {
    const only = makeCandidate({ item: makeItem({ id: "item-1", title: "The Matrix" }) });
    stubFetch(makeResponse({ candidates: [only] }));
    vi.spyOn(Math, "random").mockReturnValue(0);

    renderView();
    await screen.findByRole("link", { name: "The Matrix" });

    screen.getByRole("button", { name: /Pick for me/ }).click();

    const pick = await screen.findByRole("region", { name: "Your pick" });
    expect(within(pick).getByRole("heading", { name: "The Matrix" })).toBeInTheDocument();
    expect(within(pick).queryByRole("button", { name: /Pick again/ })).not.toBeInTheDocument();
  });
});
