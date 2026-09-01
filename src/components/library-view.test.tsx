// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryCacheProvider } from "@/components/library-cache-provider";
import { RegionProvider } from "@/components/region-provider";
import { ToastProvider } from "@/components/ui/toast";
import { clearLibraryCache } from "@/lib/library-cache";
import type { MediaItem } from "@/lib/library-cache";
import { watchedChipLabel } from "@/lib/media-display";
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
