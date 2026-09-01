"use client";

/* TMDB poster URLs are already sized at the CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { Clapperboard, Repeat, Star } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { EmptyInline, EmptyState } from "@/components/ui/empty-state";
import { InlineMessage } from "@/components/ui/inline-message";
import { readApiJson } from "@/lib/api-response";
import {
  type InsightsSummary,
  monthName,
  runtimeSummary,
} from "@/lib/insights";
import { mediaLabel, posterUrl } from "@/lib/media-display";
import { watchEventDateLabel } from "@/lib/watch-history";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function InsightsView() {
  const [today] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [year, setYear] = useState(today.year);
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch(`/api/insights?year=${year}&month=${today.month}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => readApiJson<InsightsSummary>(response))
      .then((data) => { if (active) setSummary(data); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your insights.");
      });

    return () => { active = false; };
  }, [today.month, year]);

  /* Rendered from the answer that is on screen, so switching years never shows
     last year's numbers under this year's heading. */
  const current = summary?.year === year ? summary : null;
  const recap = year < today.year;

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

      {current && current.watches === 0 && current.availableYears.length === 1 ? (
        <EmptyState
          description="Titles you mark watched will show up here, month by month."
          icon={<Star size={23} />}
          title="Nothing watched yet"
        />
      ) : null}

      {current && current.watches === 0 && current.availableYears.length > 1 ? (
        <EmptyInline>Nothing watched in {year}.</EmptyInline>
      ) : null}

      {current && current.watches > 0 ? <Summary recap={recap} summary={current} /> : null}
    </div>
  );
}

function Summary({ recap, summary }: { recap: boolean; summary: InsightsSummary }) {
  const runtime = runtimeSummary(summary.movieRuntimeMinutes);
  const other = summary.watches - summary.movies - summary.series;

  return (
    <>
      <div className="insights-stats">
        {recap ? null : (
          <Stat
            hint={`${summary.thisMonth.uniqueTitles} ${summary.thisMonth.uniqueTitles === 1 ? "title" : "titles"}`}
            label="This month"
            value={summary.thisMonth.watches}
          />
        )}
        <Stat
          hint={`${summary.uniqueTitles} ${summary.uniqueTitles === 1 ? "title" : "titles"}`}
          label={recap ? "Watched" : "This year"}
          value={summary.watches}
        />
        {summary.rewatches > 0 ? (
          <Stat hint="seen before" label="Rewatches" value={summary.rewatches} />
        ) : null}
        {summary.averageRating !== null ? (
          <Stat
            hint={`${summary.ratedWatches} rated`}
            label="Average rating"
            value={summary.averageRating.toFixed(1)}
          />
        ) : null}
        {/* Only films with a known runtime are counted, so the number is never
            a guess; series runtimes describe an episode, not a season. */}
        {runtime ? (
          <Stat
            hint={`${summary.moviesWithKnownRuntime} ${summary.moviesWithKnownRuntime === 1 ? "film" : "films"}`}
            label="Time in films"
            value={runtime}
          />
        ) : null}
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
