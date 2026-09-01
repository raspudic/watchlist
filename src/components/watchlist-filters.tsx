"use client";

/* TMDB logos are already sized at the CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, Clapperboard, Pin, Shuffle, Star } from "lucide-react";
import Link from "next/link";

import { RegionMark } from "@/components/region-select";
import { Button, IconButton } from "@/components/ui/button";
import { mediaLabel, posterUrl, providerLogoUrl } from "@/lib/media-display";
import {
  type FacetOption,
  type RuntimeFilter,
  type ServiceFilter,
  type TonightCandidate,
  type TonightFilters,
  type TonightSort,
  genreOptions,
  moodOptions,
  regionOptions,
} from "@/lib/tonight";

const RUNTIME_LABELS: Array<{ label: string; value: RuntimeFilter }> = [
  { label: "Any length", value: "any" },
  { label: "Under 90 min", value: "under-90" },
  { label: "Under 2 hours", value: "under-120" },
];

const SORT_LABELS: Array<{ label: string; value: TonightSort }> = [
  { label: "Pinned first", value: "pinned" },
  { label: "Oldest saved", value: "oldest" },
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

export function candidateMeta(candidate: TonightCandidate) {
  return [
    candidate.item.releaseYear,
    mediaLabel(candidate.item.mediaType),
    runtimeLabel(candidate.runtimeMinutes),
  ].filter(Boolean).join(" · ");
}

/**
 * Moods, countries and genres are one row of pills, not three filters. Every
 * pill carries the number of titles it would leave, and a pill that would leave
 * none is shown disabled rather than hidden: the count is the explanation.
 */
export function WatchlistFilters({
  canFilterByServices,
  candidates,
  filters,
  onChange,
  ready,
  regions,
  resultCount,
  selectedProviderIds,
  showGenres,
  onShowGenres,
  uncheckedCount,
}: {
  canFilterByServices: boolean;
  candidates: TonightCandidate[];
  filters: TonightFilters;
  onChange: (filters: TonightFilters) => void;
  /** False until the catalog layer arrives; zero counts would be a lie. */
  ready: boolean;
  regions: string[];
  resultCount: number;
  selectedProviderIds: number[];
  showGenres: boolean;
  onShowGenres: (open: boolean) => void;
  uncheckedCount: number;
}) {
  const countries = ready ? regionOptions(candidates, filters, selectedProviderIds, regions) : [];
  const moods = ready ? moodOptions(candidates, filters, selectedProviderIds) : [];
  const genres = ready ? genreOptions(candidates, filters, selectedProviderIds) : [];
  const visibleGenres = showGenres ? genres : genres.filter((genre) => genre.selected);
  /* A watchlist the catalog has not reached yet has nothing to filter by, and
     a row of dead pills would say less than no row at all. */
  const hasFacets = countries.length > 0 || genres.length > 0 || moods.some((mood) => mood.count > 0);
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
              {countries.map((option) => (
                <FacetPill key={option.key} onToggle={toggleFacet} option={option} tone="region" />
              ))}
              {moods.map((option) => <FacetPill key={option.key} onToggle={toggleFacet} option={option} />)}
              {visibleGenres.map((option) => (
                <FacetPill key={option.key} onToggle={toggleFacet} option={option} tone="genre" />
              ))}
              {genres.length > 0 ? (
                <button
                  aria-expanded={showGenres}
                  className="pill pill-more"
                  onClick={() => onShowGenres(!showGenres)}
                  type="button"
                >
                  Genres
                  <ChevronDown aria-hidden="true" className={showGenres ? "pill-chevron open" : "pill-chevron"} size={14} />
                </button>
              ) : null}
            </>
          ) : (
            <span aria-hidden="true" className="pill-skeleton-row">
              <span /><span /><span /><span />
            </span>
          )}
        </div>
      ) : null}

      <div className="tonight-refine">
        <p aria-live="polite" className="tonight-summary">
          {resultCount} {resultCount === 1 ? "title" : "titles"}
          {filters.services === "mine" && uncheckedCount > 0
            ? ` · ${uncheckedCount} not checked for streaming yet`
            : ""}
        </p>
        <div className="tonight-selects">
          {canFilterByServices ? (
            <label className="compact-select-field">
              <span>Availability</span>
              <select
                className="field-control compact-select"
                onChange={(event) => onChange({ ...filters, services: event.target.value as ServiceFilter })}
                value={filters.services}
              >
                <option value="all">All titles</option>
                <option value="mine">On my services</option>
              </select>
            </label>
          ) : ready ? (
            /* One quiet line rather than a banner: without a country there is
               nothing to filter by, and the reader may not want to. */
            <Link className="tonight-setup-link" href="/settings">Add your countries and services</Link>
          ) : null}
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
  tone?: "genre" | "region";
}) {
  const classes = ["pill"];
  if (tone === "genre") classes.push("pill-genre");
  if (tone === "region") classes.push("pill-region");
  if (option.selected) classes.push("pill-on");

  return (
    <button
      aria-pressed={option.selected}
      className={classes.join(" ")}
      disabled={option.count === 0 && !option.selected}
      onClick={() => onToggle(option.key)}
      type="button"
    >
      {tone === "region" ? <RegionMark code={option.label} /> : option.label}
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

/** What a row says about streaming, once the catalog layer has arrived. */
export function AvailabilityLine({
  candidate,
  showCountry,
}: {
  candidate: TonightCandidate;
  showCountry: boolean;
}) {
  if (candidate.streaming.length > 0) {
    return <ProviderChips providers={candidate.streaming} showCountry={showCountry} />;
  }

  return (
    <span className="tonight-availability">
      {candidate.availabilityCheckedAt === null
        ? "Streaming not checked yet"
        : "Not included with a subscription"}
    </span>
  );
}

/* The picked title. It sits above the list rather than replacing it, so the
   answer and the alternatives are on screen together. */
export function PickCard({
  candidate,
  canRepick,
  onOpen,
  onPickAgain,
  onTogglePin,
  pinning,
  showCountry,
}: {
  candidate: TonightCandidate;
  canRepick: boolean;
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
        <h2>{candidate.item.title}</h2>
        <p className="row-meta">
          {candidateMeta(candidate)}
          {candidate.voteAverage ? (
            <span className="tonight-score"><Star aria-hidden="true" size={12} /> {candidate.voteAverage.toFixed(1)}</span>
          ) : null}
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
