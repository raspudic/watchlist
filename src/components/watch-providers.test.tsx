// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegionProvider } from "@/components/region-provider";
import type { MediaItem } from "@/lib/library-cache";

import { WatchProviders } from "./watch-providers";

const item: MediaItem = {
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
  addedAt: "2026-08-19T00:00:00.000Z",
  watchedAt: null,
};

const regions = [{ code: "AR", name: "Argentina" }, { code: "US", name: "United States of America" }];

function stubFetch(providers?: unknown) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/watch-regions")) return Promise.resolve(Response.json({ regions }));
    return Promise.resolve(Response.json({ providers }));
  }));
}

function renderWith(
  { region, suggestedRegion }: { region: string | null; suggestedRegion: string | null },
  media: MediaItem = item,
) {
  return render(
    <RegionProvider region={region} suggestedRegion={suggestedRegion}>
      <WatchProviders item={media} />
    </RegionProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("WatchProviders", () => {
  it("asks for a country and preselects the browser's guess when none is saved", async () => {
    stubFetch();

    renderWith({ region: null, suggestedRegion: "AR" });

    expect(screen.getByText(/Set your country to see where this streams/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Country")).toHaveValue("AR");
    });
  });

  it("lists streaming services, rent-or-buy options and the JustWatch credit", async () => {
    stubFetch({
      region: "AR",
      link: "https://tmdb.test/603/watch",
      streaming: [{ id: 8, name: "Netflix", logoPath: "/netflix.jpg" }],
      rentOrBuy: [{ id: 2, name: "Apple TV", logoPath: "/apple.jpg" }],
    });

    renderWith({ region: "AR", suggestedRegion: "AR" }, { ...item, externalId: 604 });

    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText(/Also available to rent or buy: Apple TV/)).toBeInTheDocument();
    expect(screen.getByText(/Streaming data by JustWatch/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All options in Argentina/ }))
      .toHaveAttribute("href", "https://tmdb.test/603/watch");
  });

  it("says so plainly when nothing carries the title in that country", async () => {
    stubFetch({ region: "AR", link: null, streaming: [], rentOrBuy: [] });

    renderWith({ region: "AR", suggestedRegion: null }, { ...item, externalId: 605 });

    expect(await screen.findByText("Not available to stream in Argentina right now."))
      .toBeInTheDocument();
  });

  it("renders nothing for a title that is not on TMDB", () => {
    stubFetch();

    const { container } = renderWith(
      { region: "AR", suggestedRegion: null },
      { ...item, provider: "custom", externalId: null, mediaType: "other" },
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });
});
