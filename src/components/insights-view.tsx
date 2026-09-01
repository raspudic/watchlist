"use client";

/* TMDB poster URLs are already sized at the CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { Clapperboard, Repeat, Star } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { EmptyInline, EmptyState } from "@/components/ui/empty-state";
import { InlineMessage } from "@/components/ui/inline-message";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { readApiJson } from "@/lib/api-response";
import {
  type InsightsPeriod,
  type InsightsSummary,
  monthName,
  periodRangeLabel,
  runtimeSummary,
} from "@/lib/insights";
import { mediaLabel, posterUrl } from "@/lib/media-display";
import { watchEventDateLabel } from "@/lib/watch-history";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const PERIOD_ITEMS: Array<{ label: string; value: InsightsPeriod }> = [
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

export function InsightsView() {
  /* The reader's own today. Everything the period means is relative to it. */
  const [today] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return { year: now.getFullYear(), iso: `${now.getFullYear()}-${month}-${day}` };
  });
  const [year, setYear] = useState(today.year);
  const [period, setPeriod] = useState<InsightsPeriod>("year");
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [error, setError] = useState("");

  /* A week or a month of a year that has already ended has no answer, so a
     past year is read as a whole year. */
  const recap = year < today.year;
  const activePeriod: InsightsPeriod = recap ? "year" : period;

  useEffect(() => {
    let active = true;

    fetch(`/api/insights?year=${year}&today=${today.iso}&period=${activePeriod}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => readApiJson<InsightsSummary>(response))
      .then((data) => { if (active) setSummary(data); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your insights.");
      });

    return () => { active = false; };
  }, [activePeriod, today.iso, year]);

  /* Rendered from the answer that is on screen, so switching never shows the
     previous span's numbers under the new heading. */
  const current = summary?.year === year && summary.period === activePeriod ? summary : null;

  return (
    <div className="library-page insights-page">
      <header className="library-header">
        <div>
          <h1>{recap ? `Your ${year} recap` : "Insights"}</h1>
          <p className="library-subtitle">
            {recap ? "Everything you watched that year." : "What you have watched this year."}
          </p>
        </div>
        {current && current.availableYears.length > 1 ? (
          <label className="compact-select-field">
            <span>Year</span>
            <select
              className="field-control compact-select"
              onChange={(event) => setYear(Number(event.target.value))}
              value={year}
            >
              {current.availableYears.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {error ? <InlineMessage onDismiss={() => setError("")}>{error}</InlineMessage> : null}

      {!current && !error ? <LoadingCards /> : null}

      {/* The year is what decides whether there is a page at all; an empty
          week inside a full year is a note in its own block, not an empty page. */}
      {current && current.yearWatches === 0 && current.availableYears.length === 1 ? (
        <EmptyState
          description="Titles you mark watched will show up here, month by month."
          icon={<Star size={23} />}
          title="Nothing watched yet"
        />
      ) : null}

      {current && current.yearWatches === 0 && current.availableYears.length > 1 ? (
        <EmptyInline>Nothing watched in {year}.</EmptyInline>
      ) : null}

      {current && current.yearWatches > 0 ? (
        <Summary onPeriodChange={setPeriod} period={activePeriod} recap={recap} summary={current} />
      ) : null}
    </div>
  );
}

function Summary({
  onPeriodChange,
  period,
  recap,
  summary,
}: {
  onPeriodChange: (period: InsightsPeriod) => void;
  period: InsightsPeriod;
  recap: boolean;
  summary: InsightsSummary;
}) {
  const runtime = runtimeSummary(summary.movieRuntimeMinutes);
  const other = summary.watches - summary.movies - summary.series;
  const periodNoun = period === "week" ? "week" : period === "month" ? "month" : "year";

  return (
    <>
      {/* The switch sits inside the block it governs, and the block says what
          span it is showing, so the choice never looks like a page-wide filter. */}
      <section aria-labelledby="insights-period-heading" className="insights-scope">
        <div className="insights-scope-head">
          <div>
            <h2 id="insights-period-heading">{periodRangeLabel(summary)}</h2>
            <p className="insights-scope-note">
              {recap
                ? "Everything in this block is that year."
                : `Everything in this block is the selected ${periodNoun}.`}
            </p>
          </div>
          {recap ? null : (
            <SegmentedControl
              fill
              items={PERIOD_ITEMS}
              label="Period"
              onValueChange={(value) => { if (value) onPeriodChange(value); }}
              value={period}
            />
          )}
        </div>

        {summary.watches === 0 ? (
          <EmptyInline>Nothing watched this {periodNoun}.</EmptyInline>
        ) : (
          <>
            <div className="insights-stats">
              <Stat
                hint={summary.rewatches > 0 ? `${summary.rewatches} seen before` : "logged"}
                label="Viewings"
                value={summary.watches}
              />
              <Stat
                hint={`${summary.movies} ${summary.movies === 1 ? "film" : "films"} · ${summary.series} series`}
                label="Titles"
                value={summary.uniqueTitles}
              />
              {/* Only films with a known runtime are counted, so the number is
                  never a guess; a series runtime describes one episode. */}
              <Stat
                hint={runtime
                  ? `${summary.moviesWithKnownRuntime} ${summary.moviesWithKnownRuntime === 1 ? "film" : "films"} counted`
                  : "no runtimes known yet"}
                label="Time in films"
                value={runtime ?? "—"}
              />
              <Stat
                hint={`of ${summary.daysInPeriod}`}
                label="Days watched"
                value={summary.daysWatched}
              />
              {recap && summary.mostActiveMonth ? (
                <Stat
                  hint={`${summary.mostActiveMonth.watches} viewings`}
                  label="Busiest month"
                  value={monthName(summary.mostActiveMonth.month)}
                />
              ) : null}
            </div>

            <Card title="Movies and series">
              <BarList
                items={[
                  { key: "movie", label: "Movies", value: summary.movies },
                  { key: "tv", label: "Series", value: summary.series },
                  ...(other > 0 ? [{ key: "other", label: "Other", value: other }] : []),
                ]}
              />
            </Card>

            {/* Nothing rated means no chart at all: ten empty bars would say less. */}
            {summary.ratedWatches > 0 ? (
              <Card title="How you rated them">
                <BarList
                  compact
                  items={summary.ratingDistribution.map((entry) => ({
                    key: String(entry.rating),
                    label: String(entry.rating),
                    title: `Rated ${entry.rating}`,
                    value: entry.watches,
                  }))}
                />
              </Card>
            ) : null}

            {summary.favoriteGenres.length > 0 ? (
              <Card title="Favourite genres">
                <BarList
                  items={summary.favoriteGenres.map((genre) => ({
                    key: genre.name,
                    label: genre.name,
                    value: genre.watches,
                  }))}
                />
                {summary.watchesWithoutGenres > 0 ? (
                  <p className="insights-note">
                    {summary.watchesWithoutGenres} {summary.watchesWithoutGenres === 1 ? "viewing has" : "viewings have"}
                    {" "}no genres in the catalog yet.
                  </p>
                ) : null}
              </Card>
            ) : null}

            {summary.favoriteGenres.length === 0 && summary.watchesWithoutGenres > 0 ? (
              <Card title="Favourite genres">
                <p className="insights-note">
                  Genres come from TMDB, so titles you added yourself are not counted here.
                </p>
              </Card>
            ) : null}

            {summary.highestRated.length > 0 ? (
              <Card title="Highest rated">
                <ul className="insights-titles">
                  {summary.highestRated.map((title) => {
                    const poster = posterUrl(title.posterPath, "w92");
                    return (
                      <li key={title.mediaItemId}>
                        {poster
                          ? <img alt="" className="insights-poster" src={poster} />
                          : <span className="insights-poster placeholder"><Clapperboard size={16} /></span>}
                        <span className="insights-title-name">{title.title}</span>
                        <span className="insights-rating"><Star aria-hidden="true" fill="currentColor" size={12} /> {title.rating}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            {summary.recentHistory.length > 0 ? (
              <Card title={recap ? "How the year ended" : "Recently watched"}>
                <ul className="insights-history">
                  {summary.recentHistory.map((entry) => (
                    <li key={entry.id}>
                      <span className="insights-history-date">{watchEventDateLabel(entry.watchedOn)}</span>
                      <span className="insights-title-name">{entry.title}</span>
                      {entry.rewatch ? (
                        <span className="insights-rewatch"><Repeat aria-hidden="true" size={12} /> Again</span>
                      ) : (
                        <span className="insights-history-type">{mediaLabel(entry.mediaType)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        )}
      </section>

      {/* The year's own shape. It deliberately ignores the switch above:
          narrowing to a week should not redraw the year. */}
      <section aria-labelledby="insights-year-heading" className="insights-yearwide">
        <div className="insights-scope-head">
          <div>
            <h2 id="insights-year-heading">Across {summary.year}</h2>
            <p className="insights-scope-note">
              The whole year — {summary.yearWatches} {summary.yearWatches === 1 ? "viewing" : "viewings"} — whichever period is chosen above.
            </p>
          </div>
        </div>

        <Card title="Month by month">
          <BarList
            compact
            items={summary.monthlyBuckets.map((bucket) => ({
              key: String(bucket.month),
              label: MONTH_INITIALS[bucket.month - 1],
              title: monthName(bucket.month),
              value: bucket.watches,
            }))}
          />
        </Card>
      </section>
    </>
  );
}


function Stat({ hint, label, value }: { hint: string; label: string; value: number | string }) {
  return (
    <div className="insights-stat">
      {/* A word like "September" does not belong at the size a count reads at. */}
      <p className={typeof value === "number" ? "insights-stat-value" : "insights-stat-value words"}>{value}</p>
      <p className="insights-stat-label">{label}</p>
      <p className="insights-stat-hint">{hint}</p>
    </div>
  );
}

function Card({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="insights-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* Plain CSS bars. The label and the number are text, so the chart reads the
   same to a screen reader as it does on screen. */
function BarList({
  compact = false,
  items,
}: {
  compact?: boolean;
  items: Array<{ key: string; label: string; title?: string; value: number }>;
}) {
  const largest = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul className={compact ? "bar-list bar-list-compact" : "bar-list"}>
      {items.map((item) => (
        <li key={item.key}>
          <span className="bar-label">
            {item.title ? <span className="sr-only">{item.title}</span> : null}
            <span aria-hidden={item.title ? "true" : undefined}>{item.label}</span>
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(item.value / largest) * 100}%` }} />
          </span>
          <span className="bar-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function LoadingCards() {
  return (
    <div aria-label="Loading insights" className="insights-skeleton">
      {[0, 1, 2].map((value) => <div key={value} />)}
    </div>
  );
}
