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
    selectedProviderIds: [],
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

    expect(await screen.findByRole("button", { name: /Arrival/ })).toBeInTheDocument();
    expect(document.querySelector(".pill-skeleton-row")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Funny/ })).not.toBeInTheDocument();

    resolveExtras(makeExtrasResponse({
      titles: [makeTitleExtras({ mediaItemId: "item-1", genres: [{ id: 35, name: "Comedy" }] })],
    }));

    await waitForExtrasReady();
    expect(screen.getByRole("button", { name: /^Funny/ })).toBeInTheDocument();
  });

  it("narrows on a matching mood pill and flips its own aria-pressed, while a mood with no matches stays disabled", async () => {
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
    await screen.findByRole("button", { name: /Comedy Item/ });
    await waitForExtrasReady();

    const suspenseful = screen.getByRole("button", { name: /^Suspenseful/ });
    expect(suspenseful).toBeDisabled();
    expect(suspenseful).toHaveAttribute("aria-pressed", "false");

    const funny = screen.getByRole("button", { name: /^Funny/ });
    expect(funny).not.toBeDisabled();
    expect(funny).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(funny);

    await waitFor(() => expect(funny).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /Comedy Item/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Drama Item/ })).not.toBeInTheDocument();
  });

  it("hides country pills with a single saved country", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Solo Country" })];
    const extras = makeExtrasResponse({
      regions: ["US"],
      titles: [makeTitleExtras({
        mediaItemId: "item-1",
        genres: [{ id: 35, name: "Comedy" }],
        streaming: [{ id: 1, name: "Netflix", logoPath: null, regions: ["US"] }],
      })],
    });
    stubWatchlistFetch({ items, extras });

    const { container } = renderWatchlist();
    await screen.findByRole("button", { name: /Solo Country/ });
    await waitForExtrasReady();

    /* A country pill would say nothing a single-country reader doesn't already
       know, so the row shows moods without it. */
    expect(screen.getByRole("button", { name: /^Funny/ })).toBeInTheDocument();
    expect(container.querySelectorAll(".pill-region")).toHaveLength(0);
  });

  it("shows country pills with two saved countries and filters out a title not streaming in the pressed one", async () => {
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

    const { container } = renderWatchlist();
    await screen.findByRole("button", { name: /US Title/ });
    await waitForExtrasReady();
    expect(screen.getByRole("button", { name: /SE Title/ })).toBeInTheDocument();

    const regionPills = container.querySelectorAll(".pill-region");
    expect(regionPills).toHaveLength(2);
    expect(regionPills[0]).toHaveTextContent("US");

    fireEvent.click(regionPills[0]);

    await waitFor(() => expect(screen.queryByRole("button", { name: /SE Title/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /US Title/ })).toBeInTheDocument();
  });

  it("hides a title on no selected service under My services, and Everything brings it back", async () => {
    const items = [
      makeWatchlistItem({ id: "item-1", title: "On Service" }),
      makeWatchlistItem({ id: "item-2", title: "Off Service" }),
    ];
    const extras = makeExtrasResponse({
      regions: ["US"],
      selectedProviderIds: [8],
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

    expect(await screen.findByRole("button", { name: /On Service/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Off Service/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Everything" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Off Service/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /On Service/ })).toBeInTheDocument();
  });

  it("opens the pick card with Math.random stubbed, and View details opens the sheet in place", async () => {
    const items = [makeWatchlistItem({ id: "item-1", title: "Solo Pick" })];
    const extras = makeExtrasResponse({
      titles: [makeTitleExtras({ mediaItemId: "item-1" })],
    });
    stubWatchlistFetch({ items, extras });
    vi.spyOn(Math, "random").mockReturnValue(0);

    renderWatchlist();
    await screen.findByRole("button", { name: /Solo Pick/ });
    await waitForExtrasReady();

    fireEvent.click(screen.getByRole("button", { name: /Pick for me/ }));

    const pick = await screen.findByRole("region", { name: "Your pick" });
    expect(within(pick).getByRole("heading", { name: "Solo Pick" })).toBeInTheDocument();

    fireEvent.click(within(pick).getByRole("button", { name: "View details" }));

    expect(await screen.findByRole("dialog", { name: "Solo Pick" })).toBeInTheDocument();
    /* The sheet layers over the same page rather than replacing it: the pick
       card and the list row are still mounted underneath it. */
    expect(screen.getByRole("region", { name: "Your pick" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Solo Pick/ }).length).toBeGreaterThan(0);
  });

  it("shows a row's streaming service name in list view", async () => {
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
    await screen.findByRole("button", { name: /Stream Title/ });
    await waitForExtrasReady();

    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });
});
