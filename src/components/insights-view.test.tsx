// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type InsightsEvent, type InsightsSummary, summarizeInsights } from "@/lib/insights";

import { InsightsView } from "./insights-view";

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function makeEvent(overrides: Partial<InsightsEvent> = {}): InsightsEvent {
  return {
    id: "event-1",
    mediaItemId: "item-1",
    watchedOn: `${CURRENT_YEAR}-${pad(CURRENT_MONTH)}-01`,
    rating: null,
    title: "The Matrix",
    mediaType: "movie",
    posterPath: null,
    runtimeMinutes: 136,
    genres: ["Action"],
    ...overrides,
  };
}

function stubFetchByYear(summaries: Record<number, InsightsSummary>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/\/api\/insights\?year=(\d+)&month=(\d+)/);
    const summary = match ? summaries[Number(match[1])] : undefined;
    if (!summary) return Promise.reject(new Error(`Unexpected request: ${url}`));
    return Promise.resolve(Response.json(summary));
  }));
}

function cardByHeading(name: string) {
  return screen.getByRole("heading", { name }).closest("section")!;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InsightsView", () => {
  it("renders the stat tiles and the Month by month card with all twelve months present", async () => {
    const events: InsightsEvent[] = [
      makeEvent({
        id: "e1",
        mediaItemId: "item-1",
        watchedOn: `${CURRENT_YEAR}-01-15`,
        rating: 8,
        genres: ["Action"],
        runtimeMinutes: 120,
      }),
      makeEvent({
        id: "e2",
        mediaItemId: "item-1",
        watchedOn: `${CURRENT_YEAR}-02-10`,
        rating: 9,
        genres: ["Action"],
        runtimeMinutes: 120,
      }),
      makeEvent({
        id: "e3",
        mediaItemId: "item-2",
        title: "Slow Horses",
        mediaType: "tv",
        watchedOn: `${CURRENT_YEAR}-${pad(CURRENT_MONTH)}-05`,
        rating: null,
        genres: ["Comedy"],
        runtimeMinutes: null,
      }),
      makeEvent({
        id: "e4",
        mediaItemId: "item-3",
        title: "Amelie",
        watchedOn: `${CURRENT_YEAR}-${pad(CURRENT_MONTH)}-20`,
        rating: 7,
        genres: ["Drama"],
        runtimeMinutes: 100,
      }),
    ];
    const summary = summarizeInsights(events, { year: CURRENT_YEAR, month: CURRENT_MONTH });
    stubFetchByYear({ [CURRENT_YEAR]: summary });

    const { container } = render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    const stats = container.querySelector<HTMLElement>(".insights-stats")!;
    expect(within(stats).getByText("This month")).toBeInTheDocument();
    expect(within(stats).getByText("2")).toBeInTheDocument();
    expect(within(stats).getByText("2 titles")).toBeInTheDocument();
    expect(within(stats).getByText("This year")).toBeInTheDocument();
    expect(within(stats).getByText("4")).toBeInTheDocument();
    expect(within(stats).getByText("Rewatches")).toBeInTheDocument();
    expect(within(stats).getByText("Average rating")).toBeInTheDocument();
    expect(within(stats).getByText("8.0")).toBeInTheDocument();
    expect(within(stats).getByText("Time in films")).toBeInTheDocument();
    expect(within(stats).getByText("5 h 40 min")).toBeInTheDocument();

    const monthByMonth = cardByHeading("Month by month");
    expect(within(monthByMonth).getAllByRole("listitem")).toHaveLength(12);
    expect(within(monthByMonth).getByText("January")).toBeInTheDocument();
    expect(within(monthByMonth).getByText("December")).toBeInTheDocument();
  });

  it("hides the How you rated them card when nothing has a rating", async () => {
    const events: InsightsEvent[] = [
      makeEvent({ id: "e1", mediaItemId: "item-1", rating: null }),
      makeEvent({ id: "e2", mediaItemId: "item-2", title: "Amelie", rating: null }),
    ];
    const summary = summarizeInsights(events, { year: CURRENT_YEAR, month: CURRENT_MONTH });
    stubFetchByYear({ [CURRENT_YEAR]: summary });

    render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    expect(screen.queryByRole("heading", { name: "How you rated them" })).not.toBeInTheDocument();
  });

  it("shows the empty state for an account with no history at all", async () => {
    const summary = summarizeInsights([], { year: CURRENT_YEAR, month: CURRENT_MONTH });
    expect(summary.availableYears).toEqual([CURRENT_YEAR]);
    stubFetchByYear({ [CURRENT_YEAR]: summary });

    render(<InsightsView />);

    expect(await screen.findByRole("heading", { name: "Nothing watched yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Titles you mark watched will show up here, month by month."),
    ).toBeInTheDocument();
  });

  it("refetches an earlier year on selection and switches the heading to the recap", async () => {
    const earlierYear = CURRENT_YEAR - 1;
    const events: InsightsEvent[] = [
      makeEvent({
        id: "e-old",
        mediaItemId: "item-old",
        title: "Old Movie",
        watchedOn: `${earlierYear}-06-01`,
        rating: 6,
      }),
      makeEvent({
        id: "e-new",
        mediaItemId: "item-new",
        title: "New Movie",
        watchedOn: `${CURRENT_YEAR}-${pad(CURRENT_MONTH)}-02`,
        rating: 7,
      }),
    ];
    const currentSummary = summarizeInsights(events, { year: CURRENT_YEAR, month: CURRENT_MONTH });
    const earlierSummary = summarizeInsights(events, { year: earlierYear, month: CURRENT_MONTH });
    stubFetchByYear({ [CURRENT_YEAR]: currentSummary, [earlierYear]: earlierSummary });

    render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    const yearSelect = screen.getByRole("combobox", { name: "Year" });
    fireEvent.change(yearSelect, { target: { value: String(earlierYear) } });

    expect(await screen.findByRole("heading", { name: `Your ${earlierYear} recap` })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/insights?year=${earlierYear}&month=${CURRENT_MONTH}`,
      expect.anything(),
    );
  });

  it("notes that genre-less titles are not counted instead of showing an empty genre chart", async () => {
    const events: InsightsEvent[] = [
      makeEvent({ id: "e1", mediaItemId: "item-1", title: "Custom Title One", genres: [] }),
      makeEvent({ id: "e2", mediaItemId: "item-2", title: "Custom Title Two", genres: [] }),
    ];
    const summary = summarizeInsights(events, { year: CURRENT_YEAR, month: CURRENT_MONTH });
    expect(summary.favoriteGenres).toHaveLength(0);
    expect(summary.watchesWithoutGenres).toBeGreaterThan(0);
    stubFetchByYear({ [CURRENT_YEAR]: summary });

    render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    const genresCard = cardByHeading("Favourite genres");
    expect(
      within(genresCard).getByText("Genres come from TMDB, so titles you added yourself are not counted here."),
    ).toBeInTheDocument();
    expect(within(genresCard).queryByRole("list")).not.toBeInTheDocument();
  });
});
