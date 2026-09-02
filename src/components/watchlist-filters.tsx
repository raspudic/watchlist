"use client";

/* TMDB logos are already sized at the CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, Clapperboard, Pin, Shuffle, Star, X } from "lucide-react";
import { useState } from "react";

import { RegionMark } from "@/components/region-select";
import { Button, IconButton } from "@/components/ui/button";
import { mediaLabel, posterUrl, providerLogoUrl } from "@/lib/media-display";
import {
  type FacetOption,
  type RuntimeFilter,
  type TonightCandidate,
  type TonightFilters,
  type TonightSort,
  genreOptions,
  moodOptions,
} from "@/lib/tonight";

const RUNTIME_LABELS: Array<{ label: string; value: RuntimeFilter }> = [
  { label: "Any length", value: "any" },
  { label: "Under 90 min", value: "under-90" },
  { label: "Under 2 hours", value: "under-120" },
];

/* Pinned titles lead the list under every one of these, so pinning is not among
   them: the control orders what is left. */
const SORT_LABELS: Array<{ label: string; value: TonightSort }> = [
  { label: "Recently added", value: "recent" },
  { label: "Longest waiting", value: "oldest" },
  { label: "Newest release", value: "release" },
  { label: "Highest score", value: "score" },
];

export function runtimeLabel(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * TMDB's user rating, wherever a title is shown. "Highest score" sorts on this,
 * so it has to be legible somewhere other than the sort menu. The score stays
 * distinct from a viewer's own rating by living in the metadata rather than a
 * rating badge.
 */
export function ScoreMark({
  candidate,
  separated = false,
  votes = false,
}: {
  candidate: TonightCandidate;
  separated?: boolean;
  votes?: boolean;
}) {
  if (!candidate.voteAverage) return null;

  return (
    <span className="tonight-score" title="TMDB rating">
      {separated ? <span aria-hidden="true" className="score-separator">·</span> : null}
      <Star aria-hidden="true" fill="currentColor" size={13} strokeWidth={1.5} />
      {candidate.voteAverage.toFixed(1)}
      {votes && candidate.voteCount
        ? <span className="score-votes">on TMDB · {candidate.voteCount.toLocaleString()} votes</span>
        : null}
    </span>
  );
}

export function candidateMeta(candidate: TonightCandidate) {
  return [
    candidate.item.releaseYear,
    mediaLabel(candidate.item.mediaType),
    runtimeLabel(candidate.runtimeMinutes),
  ].filter(Boolean).join(" · ");
}

/**
 * Moods and genres are one row of pills, not two filters. Every visible pill
 * carries the number of titles it would leave.
 *
 * The seven moods are always out; the genres under them fold behind a
 * disclosure, because a real watchlist surfaces twenty of them and four rows of
 * pills push the list itself off the first screen. A genre already switched on
 * stays out while collapsed, so the row never hides a filter that is working.
 */
export function WatchlistFilters({
  candidates,
  filters,
  onChange,
  onPick,
  ready,
  resultCount,
}: {
  candidates: TonightCandidate[];
  filters: TonightFilters;
  onChange: (filters: TonightFilters) => void;
  onPick: () => void;
  /** False until the catalog layer arrives; zero counts would be a lie. */
  ready: boolean;
  resultCount: number;
}) {
  const [showGenres, setShowGenres] = useState(false);
  const moods = ready ? moodOptions(candidates, filters) : [];
  const visibleMoods = moods.filter((mood) => mood.count > 0 || mood.selected);
  const genres = ready ? genreOptions(candidates, filters) : [];
  const visibleGenres = showGenres ? genres : genres.filter((genre) => genre.selected);
  const hiddenGenres = genres.length - visibleGenres.length;
  /* A watchlist the catalog has not reached yet has nothing to filter by, and
     a row of dead pills would say less than no row at all. */
  const hasFacets = genres.length > 0 || visibleMoods.length > 0;
  const hasRuntimes = candidates.some((candidate) => candidate.runtimeMinutes !== null);

  function toggleFacet(key: string) {
    onChange({
      ...filters,
      facets: filters.facets.includes(key)
        ? filters.facets.filter((facet) => facet !== key)
        : [...filters.facets, key],
    });
  }

  return (
    <>
      {!ready || hasFacets ? (
        <div className="tonight-pills">
          {ready ? (
            <>
              {visibleMoods.map((option) => <FacetPill key={option.key} onToggle={toggleFacet} option={option} />)}
              {genres.length > 0 ? (
                <button
                  aria-expanded={showGenres}
                  className="pill pill-more"
                  onClick={() => setShowGenres(!showGenres)}
                  type="button"
                >
                  Genres
                  {/* Not a count of titles like every other pill, but of what is
                      still folded away; the chevron is what says so. */}
                  {hiddenGenres > 0 ? <span className="pill-count">{hiddenGenres}</span> : null}
                  <ChevronDown aria-hidden="true" className={showGenres ? "pill-chevron open" : "pill-chevron"} size={14} />
                </button>
              ) : null}
              {visibleGenres.map((option) => (
                <FacetPill key={option.key} onToggle={toggleFacet} option={option} tone="genre" />
              ))}
            </>
          ) : (
            <span aria-hidden="true" className="pill-skeleton-row">
              <span /><span /><span /><span />
            </span>
          )}
        </div>
      ) : null}

      <div className="tonight-refine">
        {/* The pick comes out of the filtered set, so it sits beside the count
            of that set and above the card it produces, not up in the header
            where it read as a page-level action of its own. */}
        <div className="tonight-count">
          <p aria-live="polite" className="tonight-summary">
            {resultCount} {resultCount === 1 ? "title" : "titles"}
          </p>
          <Button disabled={resultCount === 0} onClick={onPick} size="sm" variant="secondary">
            <Shuffle aria-hidden="true" size={15} /> Pick for me
          </Button>
        </div>
        <div className="tonight-selects">
          {hasRuntimes ? (
            <label className="compact-select-field">
              <span>Length</span>
              <select
                className="field-control compact-select"
                onChange={(event) => onChange({ ...filters, runtime: event.target.value as RuntimeFilter })}
                value={filters.runtime}
              >
                {RUNTIME_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="compact-select-field">
            <span>Sort</span>
            <select
              className="field-control compact-select"
              onChange={(event) => onChange({ ...filters, sort: event.target.value as TonightSort })}
              value={filters.sort}
            >
              {SORT_LABELS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </>
  );
}

function FacetPill({
  onToggle,
  option,
  tone,
}: {
  onToggle: (key: string) => void;
  option: FacetOption;
  tone?: "genre";
}) {
  const classes = ["pill"];
  if (tone === "genre") classes.push("pill-genre");
  if (option.selected) classes.push("pill-on");

  return (
    <button
      aria-pressed={option.selected}
      className={classes.join(" ")}
      disabled={option.count === 0 && !option.selected}
      onClick={() => onToggle(option.key)}
      type="button"
    >
      {option.label}
      <span className="pill-count">{option.count}</span>
    </button>
  );
}

export function ProviderChips({
  providers,
  showCountry = false,
}: {
  providers: TonightCandidate["streaming"];
  showCountry?: boolean;
}) {
  const shown = providers.slice(0, 3);

  return (
    <span className="tonight-services">
      {shown.map((provider) => {
        const logo = providerLogoUrl(provider.logoPath, "w45");
        return (
          <span className="tonight-service" key={provider.id}>
            {logo ? <img alt="" src={logo} /> : null}
            {provider.name}
            {/* Which country carries it, when that can differ. */}
            {showCountry ? provider.regions.map((code) => <RegionMark code={code} key={code} />) : null}
          </span>
        );
      })}
      {providers.length > shown.length ? (
        <span className="tonight-service tonight-services-more">+{providers.length - shown.length}</span>
      ) : null}
    </span>
  );
}

/* The picked title. It sits above the list rather than replacing it, so the
   answer and the alternatives are on screen together. */
export function PickCard({
  candidate,
  canRepick,
  onDismiss,
  onOpen,
  onPickAgain,
  onTogglePin,
  pinning,
  showCountry,
}: {
  candidate: TonightCandidate;
  canRepick: boolean;
  onDismiss: () => void;
  onOpen: (candidate: TonightCandidate) => void;
  onPickAgain: () => void;
  onTogglePin: (candidate: TonightCandidate) => void;
  pinning: boolean;
  showCountry: boolean;
}) {
  const poster = posterUrl(candidate.item.posterPath, "w342");
  const pinned = Boolean(candidate.item.pinnedAt);

  return (
    <section aria-label="Your pick" className="tonight-pick">
      {poster
        ? <img alt="" className="tonight-pick-poster" src={poster} />
        : <span className="tonight-pick-poster placeholder"><Clapperboard size={28} /></span>}
      <div className="tonight-pick-copy">
        <div className="tonight-pick-title">
          <h2>{candidate.item.title}</h2>
          <IconButton className="tonight-pick-dismiss" label="Dismiss pick" onClick={onDismiss}>
            <X aria-hidden="true" size={17} />
          </IconButton>
        </div>
        <p className="row-meta">
          {candidateMeta(candidate)}
          <ScoreMark candidate={candidate} separated />
        </p>
        {candidate.streaming.length > 0 ? (
          <ProviderChips providers={candidate.streaming} showCountry={showCountry} />
        ) : null}
        <div className="tonight-pick-actions">
          <Button onClick={() => onOpen(candidate)} size="sm">View details</Button>
          {canRepick ? (
            <Button onClick={onPickAgain} size="sm" variant="quiet">
              <Shuffle aria-hidden="true" size={15} /> Pick again
            </Button>
          ) : null}
          <IconButton
            aria-pressed={pinned}
            className={pinned ? "pin-button pinned" : "pin-button"}
            label={pinned ? `Unpin ${candidate.item.title}` : `Pin ${candidate.item.title}`}
            loading={pinning}
            onClick={() => onTogglePin(candidate)}
          >
            <Pin aria-hidden="true" fill={pinned ? "currentColor" : "none"} size={16} />
          </IconButton>
        </div>
      </div>
    </section>
  );
}
