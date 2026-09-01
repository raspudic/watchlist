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

const TODAY = `${CURRENT_YEAR}-${pad(CURRENT_MONTH)}-${pad(now.getDate())}`;

function scope(overrides: { year?: number; period?: "week" | "month" | "year" } = {}) {
  return { year: CURRENT_YEAR, today: TODAY, period: "year" as const, ...overrides };
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

/* Keyed by the year and period the view asks for, so a test can assert what
   the switch actually re-requests. */
function stubFetch(summaries: Record<string, InsightsSummary>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/\/api\/insights\?year=(\d+)&today=[\d-]+&period=(\w+)/);
    const summary = match ? summaries[`${match[1]}:${match[2]}`] : undefined;
    if (!summary) return Promise.reject(new Error(`Unexpected request: ${url}`));
    return Promise.resolve(Response.json(summary));
  }));
}

function cardByHeading(name: string) {
  return screen.getByRole("heading", { name }).closest("section")!;
}

/* Values repeat across tiles, so each one is read inside its own tile. */
function statTile(label: string) {
  const tile = [...document.querySelectorAll<HTMLElement>(".insights-stat")]
    .find((element) => element.querySelector(".insights-stat-label")?.textContent === label);
  if (!tile) throw new Error(`No stat tile labelled "${label}"`);
  return {
    value: tile.querySelector(".insights-stat-value")?.textContent,
    hint: tile.querySelector(".insights-stat-hint")?.textContent,
  };
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
    const summary = summarizeInsights(events, scope());
    stubFetch({ [`${CURRENT_YEAR}:year`]: summary });

    const { container } = render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    const stats = container.querySelector<HTMLElement>(".insights-stats")!;
    expect(statTile("Viewings").value).toBe("4");
    expect(statTile("Titles")).toEqual({ value: "3", hint: "3 films · 1 series" });
    expect(statTile("Time in films").value).toBe("5 h 40 min");
    expect(statTile("Days watched").value).toBe("4");
    /* The mean is gone: it read the same every year and double-counted a
       rewatch that was rated twice. */
    expect(within(stats).queryByText("Average rating")).not.toBeInTheDocument();

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
    const summary = summarizeInsights(events, scope());
    stubFetch({ [`${CURRENT_YEAR}:year`]: summary });

    render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    expect(screen.queryByRole("heading", { name: "How you rated them" })).not.toBeInTheDocument();
  });

  it("shows the empty state for an account with no history at all", async () => {
    const summary = summarizeInsights([], scope());
    expect(summary.availableYears).toEqual([CURRENT_YEAR]);
    stubFetch({ [`${CURRENT_YEAR}:year`]: summary });

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
    const currentSummary = summarizeInsights(events, scope());
    const earlierSummary = summarizeInsights(events, scope({ year: earlierYear }));
    stubFetch({ [`${CURRENT_YEAR}:year`]: currentSummary, [`${earlierYear}:year`]: earlierSummary });

    render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    const yearSelect = screen.getByRole("combobox", { name: "Year" });
    fireEvent.change(yearSelect, { target: { value: String(earlierYear) } });

    expect(await screen.findByRole("heading", { name: `Your ${earlierYear} recap` })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/insights?year=${earlierYear}&today=${TODAY}&period=year`,
      expect.anything(),
    );
    /* A week of a year that has ended has no answer, so the switch goes. */
    expect(screen.queryByRole("group", { name: "Period" })).not.toBeInTheDocument();
  });

  /* The whole point of the two blocks: the switch owns one and not the other. */
  it("narrows its own block on a period change and leaves the year alone", async () => {
    const events: InsightsEvent[] = [
      makeEvent({
        id: "e-jan",
        mediaItemId: "item-jan",
        title: "January Film",
        watchedOn: `${CURRENT_YEAR}-01-15`,
      }),
      makeEvent({ id: "e-today", mediaItemId: "item-today", title: "Today Film", watchedOn: TODAY }),
    ];
    stubFetch({
      [`${CURRENT_YEAR}:year`]: summarizeInsights(events, scope()),
      [`${CURRENT_YEAR}:week`]: summarizeInsights(events, scope({ period: "week" })),
    });

    render(<InsightsView />);
    await screen.findByRole("heading", { name: "Insights" });

    expect(statTile("Viewings").value).toBe("2");
    const monthByMonth = cardByHeading("Month by month");
    const yearShape = within(monthByMonth).getAllByRole("listitem").map((item) => item.textContent);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    /* The period block follows the switch... */
    await screen.findByText(/Everything in this block is the selected week/);
    expect(statTile("Viewings").value).toBe("1");

    /* ...and the year-wide block is untouched by it. */
    expect(within(cardByHeading("Month by month")).getAllByRole("listitem").map((item) => item.textContent))
      .toEqual(yearShape);
    expect(screen.getByText(`Across ${CURRENT_YEAR}`)).toBeInTheDocument();
  });

  it("notes that genre-less titles are not counted instead of showing an empty genre chart", async () => {
    const events: InsightsEvent[] = [
      makeEvent({ id: "e1", mediaItemId: "item-1", title: "Custom Title One", genres: [] }),
      makeEvent({ id: "e2", mediaItemId: "item-2", title: "Custom Title Two", genres: [] }),
    ];
    const summary = summarizeInsights(events, scope());
    expect(summary.favoriteGenres).toHaveLength(0);
    expect(summary.watchesWithoutGenres).toBeGreaterThan(0);
    stubFetch({ [`${CURRENT_YEAR}:year`]: summary });

    render(<InsightsView />);

    await screen.findByRole("heading", { name: "Insights" });

    const genresCard = cardByHeading("Favourite genres");
    expect(
      within(genresCard).getByText("Genres come from TMDB, so titles you added yourself are not counted here."),
    ).toBeInTheDocument();
    expect(within(genresCard).queryByRole("list")).not.toBeInTheDocument();
  });
});
