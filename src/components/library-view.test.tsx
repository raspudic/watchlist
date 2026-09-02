// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryCacheProvider } from "@/components/library-cache-provider";
import { RegionProvider } from "@/components/region-provider";
import { ToastProvider } from "@/components/ui/toast";
import { clearLibraryCache } from "@/lib/library-cache";
import type { MediaItem } from "@/lib/library-cache";
import { watchedChipLabel } from "@/lib/media-display";
import type { TitleExtras, WatchlistExtrasResponse } from "@/lib/tonight";
import { clearWatchlistExtras } from "@/lib/watchlist-extras-cache";
import type { WatchEventRecord } from "@/lib/watch-history";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
  useSearchParams: mocks.useSearchParams,
}));

import { LibraryView } from "./library-view";

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "item-1",
    provider: "custom",
    externalId: null,
    mediaType: "movie",
    title: "Arrival",
    originalTitle: null,
    releaseYear: 2016,
    posterPath: null,
    overview: null,
    status: "watched",
    watchlistNote: null,
    reviewNote: null,
    rating: null,
    addedAt: "2026-08-01T00:00:00.000Z",
    watchedAt: "2026-08-20T12:00:00.000Z",
    pinnedAt: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<WatchEventRecord> = {}): WatchEventRecord {
  return {
    id: "event-1",
    watchedOn: "2026-08-20",
    rating: null,
    createdAt: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

function todayStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type FetchHandlers = {
  item?: MediaItem;
  events?: WatchEventRecord[];
  onPostEvent?: (body: { eventId: string; watchedAt: string; watchedOn: string }) => { event: WatchEventRecord; item: MediaItem };
  onPatch?: (body: Record<string, unknown>) => { item: MediaItem };
};

function stubFetch({ item = makeItem(), events = [], onPostEvent, onPatch }: FetchHandlers = {}) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/items?status=watched") return Promise.resolve(Response.json({ items: [item] }));
    if (url === "/api/items?status=watchlist") return Promise.resolve(Response.json({ items: [] }));

    if (url === "/api/items/item-1/watch-events" && method === "GET") {
      return Promise.resolve(Response.json({ events }));
    }

    if (url === "/api/items/item-1/watch-events" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { eventId: string; watchedAt: string; watchedOn: string };
      const result = onPostEvent
        ? onPostEvent(body)
        : { event: makeEvent({ id: body.eventId, watchedOn: body.watchedOn }), item };
      return Promise.resolve(Response.json(result));
    }

    if (url === "/api/items/item-1" && method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const result = onPatch ? onPatch(body) : { item: { ...item, ...body } };
      return Promise.resolve(Response.json(result));
    }

    return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
  }));
}

function renderView() {
  return render(
    <LibraryCacheProvider scope="account-1">
      <RegionProvider regions={[]} suggestedRegion={null}>
        <ToastProvider>
          <LibraryView mode="watched" />
        </ToastProvider>
      </RegionProvider>
    </LibraryCacheProvider>,
  );
}

beforeEach(() => {
  clearLibraryCache();
  mocks.usePathname.mockReturnValue("/watched");
  mocks.useSearchParams.mockReturnValue(new URLSearchParams("item=item-1"));
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LibraryView DetailSheet watch history", () => {
  it("shows a history block with a heading and both dates when there is more than one event", async () => {
    stubFetch({
      events: [
        makeEvent({ id: "event-2", watchedOn: "2026-08-25" }),
        makeEvent({ id: "event-1", watchedOn: "2026-08-20" }),
      ],
    });

    renderView();

    expect(await screen.findByRole("heading", { name: "Watched 2 times" })).toBeInTheDocument();
    expect(screen.getByText("25 Aug")).toBeInTheDocument();
    expect(screen.getByText("20 Aug")).toBeInTheDocument();
  });

  it("shows no history block when there is only a single event", async () => {
    stubFetch({ events: [makeEvent()] });

    renderView();

    await screen.findByRole("dialog", { name: "Arrival" });
    expect(screen.queryByRole("heading", { name: /Watched \d+ times/ })).not.toBeInTheDocument();
  });
});

describe("LibraryView DetailSheet Watched again", () => {
  it("posts a new occurrence and shows it in the list", async () => {
    stubFetch({ events: [makeEvent()] });

    renderView();

    await screen.findByRole("dialog", { name: "Arrival" });
    expect(screen.queryByRole("heading", { name: /Watched \d+ times/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watched again" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Watched 2 times" })).toBeInTheDocument());

    const postCall = vi.mocked(fetch).mock.calls.find(
      ([requestInput, requestInit]) => String(requestInput) === "/api/items/item-1/watch-events" && requestInit?.method === "POST",
    );
    expect(postCall).toBeDefined();

    const body = JSON.parse(String(postCall?.[1]?.body)) as { eventId: string; watchedAt: string; watchedOn: string };
    expect(typeof body.eventId).toBe("string");
    expect(body.eventId.length).toBeGreaterThan(0);
    expect(body.watchedOn).toBe(todayStamp());
    expect(typeof body.watchedAt).toBe("string");

    expect(screen.getByText("20 Aug")).toBeInTheDocument();
  });
});

describe("LibraryView DetailSheet watched-date edit", () => {
  it("patches the item with the chosen watchedAt and watchedOn", async () => {
    stubFetch({ events: [makeEvent()] });

    renderView();

    const chip = await screen.findByRole("button", { name: watchedChipLabel("2026-08-20T12:00:00.000Z") });
    fireEvent.click(chip);

    const input = screen.getByLabelText("Date watched");
    expect(input).toHaveValue("2026-08-20");

    fireEvent.change(input, { target: { value: "2026-08-15" } });

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(
        ([requestInput, requestInit]) => String(requestInput) === "/api/items/item-1" && requestInit?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
    });

    const patchCall = vi.mocked(fetch).mock.calls.find(
      ([requestInput, requestInit]) => String(requestInput) === "/api/items/item-1" && requestInit?.method === "PATCH",
    );
    const body = JSON.parse(String(patchCall?.[1]?.body)) as { watchedAt: string; watchedOn: string };
    expect(body.watchedOn).toBe("2026-08-15");
    expect(typeof body.watchedAt).toBe("string");
  });
});

function makeWatchlistItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return makeItem({
    status: "watchlist",
    watchedAt: null,
    ...overrides,
  });
}

function makeTitleExtras(overrides: Partial<TitleExtras> = {}): TitleExtras {
  return {
    mediaItemId: "item-1",
    genres: [],
    runtimeMinutes: null,
    voteAverage: null,
    voteCount: null,
    releaseDate: null,
    streaming: [],
    availabilityCheckedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeExtrasResponse(overrides: Partial<WatchlistExtrasResponse> = {}): WatchlistExtrasResponse {
  return {
    regions: [],
    titles: [],
    ...overrides,
  };
}

type WatchlistFetchHandlers = {
  items?: MediaItem[];
  extras?: WatchlistExtrasResponse | Promise<WatchlistExtrasResponse>;
  onPatch?: (id: string, body: Record<string, unknown>) => { item: MediaItem };
};

function stubWatchlistFetch({ items = [], extras = makeExtrasResponse(), onPatch }: WatchlistFetchHandlers = {}) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/items?status=watchlist") return Promise.resolve(Response.json({ items }));
    if (url === "/api/items?status=watched") return Promise.resolve(Response.json({ items: [] }));
    if (url === "/api/watchlist-extras") return Promise.resolve(extras).then((body) => Response.json(body));

    const patchMatch = url.match(/^\/api\/items\/(.+)$/);
    if (patchMatch && method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const item = items.find((entry) => entry.id === patchMatch[1]) ?? items[0];
      const result = onPatch ? onPatch(patchMatch[1], body) : { item: { ...item, ...body } };
      return Promise.resolve(Response.json(result));
    }

    return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
  }));
}

function renderWatchlist() {
  return render(
    <LibraryCacheProvider scope="account-1">
      <RegionProvider regions={[]} suggestedRegion={null}>
        <ToastProvider>
          <LibraryView mode="watchlist" />
        </ToastProvider>
      </RegionProvider>
    </LibraryCacheProvider>,
  );
}

async function waitForExtrasReady() {
  await waitFor(() => expect(document.querySelector(".pill-skeleton-row")).not.toBeInTheDocument());
}

describe("LibraryView watchlist mode", () => {
  beforeEach(() => {
    clearLibraryCache();
    clearWatchlistExtras();
    mocks.usePathname.mockReturnValue("/watchlist");
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("paints the list from /api/items and shows pill skeletons until /api/watchlist-extras resolves", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Arrival" })];
    let resolveExtras!: (value: WatchlistExtrasResponse) => void;
    const extras = new Promise<WatchlistExtrasResponse>((resolve) => { resolveExtras = resolve; });
    stubWatchlistFetch({ items, extras });

    renderWatchlist();

    expect(await screen.findByRole("button", { name: "View Arrival" })).toBeInTheDocument();
    expect(document.querySelector(".pill-skeleton-row")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Funny/ })).not.toBeInTheDocument();

    resolveExtras(makeExtrasResponse({
      titles: [makeTitleExtras({ mediaItemId: "item-1", genres: [{ id: 35, name: "Comedy" }] })],
    }));

    await waitForExtrasReady();
    expect(screen.getByRole("button", { name: /^Funny/ })).toBeInTheDocument();
  });

  it("shows matching moods and genres directly while hiding zero-result moods", async () => {
    const items = [
      makeWatchlistItem({ id: "item-1", title: "Comedy Item" }),
      makeWatchlistItem({ id: "item-2", title: "Drama Item" }),
    ];
    const extras = makeExtrasResponse({
      titles: [
        makeTitleExtras({ mediaItemId: "item-1", genres: [{ id: 35, name: "Comedy" }] }),
        makeTitleExtras({ mediaItemId: "item-2", genres: [{ id: 18, name: "Drama" }] }),
      ],
    });
    stubWatchlistFetch({ items, extras });

    renderWatchlist();
    await screen.findByRole("button", { name: "View Comedy Item" });
    await waitForExtrasReady();

    expect(screen.queryByRole("button", { name: /^Suspenseful/ })).not.toBeInTheDocument();
    /* Both genres fit inside the preview, so nothing is left to fold and the
       disclosure has nothing to say. */
    expect(screen.getByRole("button", { name: /^Comedy/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Drama/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more genres?$/ })).not.toBeInTheDocument();

    const funny = screen.getByRole("button", { name: /^Funny/ });
    expect(funny).not.toBeDisabled();
    expect(funny).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(funny);

    await waitFor(() => expect(funny).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "View Comedy Item" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Drama Item" })).not.toBeInTheDocument();
  });

  it("folds genres past the preview behind the disclosure, keeping selected ones out", async () => {
    /* Each title carries one genre fewer than the last, so every genre lands on
       a different number of titles and the ranking has a single answer: the
       first six are out, Western and Documentary fold. */
    const genres = [
      { id: 28, name: "Action" },
      { id: 35, name: "Comedy" },
      { id: 18, name: "Drama" },
      { id: 27, name: "Horror" },
      { id: 10749, name: "Romance" },
      { id: 53, name: "Thriller" },
      { id: 37, name: "Western" },
      { id: 99, name: "Documentary" },
    ];
    const items = genres.map((_, index) => makeWatchlistItem({ id: `item-${index}`, title: `Title ${index}` }));
    stubWatchlistFetch({
      items,
      extras: makeExtrasResponse({
        titles: items.map((item, index) => makeTitleExtras({
          mediaItemId: item.id,
          genres: genres.slice(0, genres.length - index),
        })),
      }),
    });

    renderWatchlist();
    await screen.findByRole("button", { name: "View Title 0" });
    await waitForExtrasReady();

    for (const name of ["Action", "Comedy", "Drama", "Horror", "Romance", "Thriller"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /^Western/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Documentary/ })).not.toBeInTheDocument();

    /* One disclosure, not two: the width probe beside it is hidden from the tree. */
    expect(screen.getAllByRole("button", { name: /more genres?$/ })).toHaveLength(1);
    const disclosure = screen.getByRole("button", { name: "2 more genres" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(disclosure);
    expect(screen.getByRole("button", { name: /^Western/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Documentary/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide genres" })).toHaveAttribute("aria-expanded", "true");

    /* A filter that is working is never folded away, however far down it ranks. */
    fireEvent.click(screen.getByRole("button", { name: /^Western/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Western/ })).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(screen.getByRole("button", { name: "Hide genres" }));
    expect(screen.getByRole("button", { name: /^Western/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 more genre" })).toBeInTheDocument();
  });

  it("does not turn saved countries into filter pills", async () => {
    const items = [
      makeWatchlistItem({ id: "item-1", title: "US Title" }),
      makeWatchlistItem({ id: "item-2", title: "SE Title" }),
    ];
    const extras = makeExtrasResponse({
      regions: ["US", "SE"],
      titles: [
        makeTitleExtras({
          mediaItemId: "item-1",
          streaming: [{ id: 1, name: "Netflix", logoPath: null, regions: ["US"] }],
        }),
        makeTitleExtras({
          mediaItemId: "item-2",
          streaming: [{ id: 2, name: "SVT Play", logoPath: null, regions: ["SE"] }],
        }),
      ],
    });
    stubWatchlistFetch({ items, extras });

    renderWatchlist();
    await screen.findByRole("button", { name: "View US Title" });
    await waitForExtrasReady();
    expect(screen.getByRole("button", { name: "View SE Title" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^US \d/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^SE \d/ })).not.toBeInTheDocument();
  });

  it("shows the full watchlist, with no availability filter to narrow it by", async () => {
    const items = [
      makeWatchlistItem({ id: "item-1", title: "On Service" }),
      makeWatchlistItem({ id: "item-2", title: "Off Service" }),
    ];
    const extras = makeExtrasResponse({
      regions: ["US"],
      titles: [
        makeTitleExtras({
          mediaItemId: "item-1",
          streaming: [{ id: 8, name: "Netflix", logoPath: null, regions: ["US"] }],
        }),
        makeTitleExtras({
          mediaItemId: "item-2",
          streaming: [{ id: 337, name: "Disney Plus", logoPath: null, regions: ["US"] }],
        }),
      ],
    });
    stubWatchlistFetch({ items, extras });

    renderWatchlist();
    await waitForExtrasReady();

    expect(await screen.findByRole("button", { name: "View On Service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Off Service" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Availability")).not.toBeInTheDocument();
  });

  it("keeps the catalog score aligned as a separated, filled-star metadata item", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Sinners", releaseYear: 2025 })];
    const extras = makeExtrasResponse({
      titles: [makeTitleExtras({ mediaItemId: "item-1", runtimeMinutes: 138, voteAverage: 7.5 })],
    });
    stubWatchlistFetch({ items, extras });

    renderWatchlist();
    const row = await screen.findByRole("button", { name: "View Sinners" });
    await waitForExtrasReady();

    expect(within(row).getByText("·", { selector: ".score-separator" })).toBeInTheDocument();
    const score = within(row).getByTitle("TMDB rating");
    expect(score).toHaveTextContent("7.5");
    expect(score.querySelector("svg")).toHaveAttribute("fill", "currentColor");
  });

  it("opens the pick card with Math.random stubbed, and View details opens the sheet in place", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Solo Pick" })];
    const extras = makeExtrasResponse({
      titles: [makeTitleExtras({ mediaItemId: "item-1" })],
    });
    stubWatchlistFetch({ items, extras });
    vi.spyOn(Math, "random").mockReturnValue(0);

    renderWatchlist();
    await screen.findByRole("button", { name: "View Solo Pick" });
    await waitForExtrasReady();

    fireEvent.click(screen.getByRole("button", { name: /Pick for me/ }));

    const pick = await screen.findByRole("region", { name: "Your pick" });
    expect(within(pick).getByRole("heading", { name: "Solo Pick" })).toBeInTheDocument();

    fireEvent.click(within(pick).getByRole("button", { name: "View details" }));

    expect(await screen.findByRole("dialog", { name: "Solo Pick" })).toBeInTheDocument();
    /* The sheet layers over the same page rather than replacing it: the pick
       card and the list row are still mounted underneath it. */
    expect(screen.getByRole("region", { name: "Your pick" })).toBeInTheDocument();
    expect(document.querySelector(".media-row")).toHaveTextContent("Solo Pick");
  });

  it("dismisses a pick without removing its title from the watchlist", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Dismissable Pick" })];
    stubWatchlistFetch({
      items,
      extras: makeExtrasResponse({ titles: [makeTitleExtras({ mediaItemId: "item-1" })] }),
    });
    vi.spyOn(Math, "random").mockReturnValue(0);

    renderWatchlist();
    await screen.findByRole("button", { name: "View Dismissable Pick" });
    await waitForExtrasReady();
    fireEvent.click(screen.getByRole("button", { name: /Pick for me/ }));

    const pick = await screen.findByRole("region", { name: "Your pick" });
    fireEvent.click(within(pick).getByRole("button", { name: "Dismiss pick" }));

    expect(screen.queryByRole("region", { name: "Your pick" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Dismissable Pick" })).toBeInTheDocument();
  });

  it("pins a title directly from its list card without opening the detail sheet", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Card Pin" })];
    stubWatchlistFetch({
      items,
      onPatch: (id, body) => ({
        item: {
          ...items[0],
          id,
          pinnedAt: body.pinned ? "2026-09-01T12:00:00.000Z" : null,
        },
      }),
    });

    renderWatchlist();
    const pin = await screen.findByRole("button", { name: "Pin Card Pin" });
    fireEvent.click(pin);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unpin Card Pin" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.queryByRole("dialog", { name: "Card Pin" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({ body: JSON.stringify({ pinned: true }) }),
    );
  });

  /* Pinning is a state, not a sort: it must survive a change of ordering. */
  it("keeps pinned titles in their own group at the top under every sort", async () => {
    const items = [
      makeWatchlistItem({ id: "item-1", title: "Unpinned One", addedAt: "2026-08-01T00:00:00.000Z" }),
      makeWatchlistItem({ id: "item-2", title: "Held", addedAt: "2026-08-02T00:00:00.000Z", pinnedAt: "2026-08-20T00:00:00.000Z" }),
      makeWatchlistItem({ id: "item-3", title: "Unpinned Two", addedAt: "2026-08-03T00:00:00.000Z" }),
    ];
    stubWatchlistFetch({ items });

    renderWatchlist();
    await screen.findByRole("button", { name: "View Held" });
    await waitForExtrasReady();

    const group = screen.getByRole("group", { name: "Pinned" });
    expect(within(group).getByRole("button", { name: "View Held" })).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: "View Unpinned One" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "release" } });
    expect(within(screen.getByRole("group", { name: "Pinned" })).getByRole("button", { name: "View Held" }))
      .toBeInTheDocument();
  });

  /* A filter speaks for the whole list, so a pin is no exemption from it. */
  it("filters pinned titles out like any other when they do not match", async () => {
    const items = [
      makeWatchlistItem({ id: "item-1", title: "Pinned Drama", pinnedAt: "2026-08-20T00:00:00.000Z" }),
      makeWatchlistItem({ id: "item-2", title: "Plain Comedy" }),
    ];
    stubWatchlistFetch({
      items,
      extras: makeExtrasResponse({
        titles: [
          makeTitleExtras({ mediaItemId: "item-1", genres: [{ id: 18, name: "Drama" }] }),
          makeTitleExtras({ mediaItemId: "item-2", genres: [{ id: 35, name: "Comedy" }] }),
        ],
      }),
    });

    renderWatchlist();
    await screen.findByRole("button", { name: "View Pinned Drama" });
    await waitForExtrasReady();

    fireEvent.click(screen.getByRole("button", { name: /^Funny/ }));

    expect(screen.queryByRole("group", { name: "Pinned" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Pinned Drama" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Plain Comedy" })).toBeInTheDocument();
  });

  it("pins a title from its sheet and says so plainly", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Arrival" })];
    stubWatchlistFetch({
      items,
      onPatch: (id, body) => ({
        item: {
          ...items[0],
          id,
          pinnedAt: body.pinned ? "2026-09-01T12:00:00.000Z" : null,
        },
      }),
    });

    renderWatchlist();
    fireEvent.click(await screen.findByRole("button", { name: "View Arrival" }));

    const pin = await screen.findByRole("button", { name: "Pin" });
    expect(pin).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pin);

    await waitFor(() => expect(screen.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/items/item-1",
      expect.objectContaining({ body: JSON.stringify({ pinned: true }) }),
    );
  });

  it("keeps streaming services off the list card", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Stream Title" })];
    const extras = makeExtrasResponse({
      regions: ["US"],
      titles: [makeTitleExtras({
        mediaItemId: "item-1",
        streaming: [{ id: 8, name: "Netflix", logoPath: null, regions: ["US"] }],
      })],
    });
    stubWatchlistFetch({ items, extras });

    renderWatchlist();
    await screen.findByRole("button", { name: "View Stream Title" });
    await waitForExtrasReady();

    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin Stream Title" })).toBeInTheDocument();
  });
});
