"use client";

/* TMDB logos are already sized at the CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, Clapperboard, Pin, Shuffle, Star, X } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

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

/* What the row falls back to before it has been measured: a server render, or a
   test environment with no box model. Never seen in a browser, where layout
   settles before the first paint. */
const GENRE_PREVIEW_FALLBACK = 6;

/* Measuring has to finish before the browser paints or the unfolded row flashes
   past; on the server there is no layout to measure. */
const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How many genres fit on the line they start on, leaving room for the disclosure
 * to close that same line. Flex wraps rather than truncates and the disclosure
 * has to name how many are left, so neither can be had from CSS: the row renders
 * every genre for one pass and measures them.
 *
 * The reservation is what keeps the disclosure out of a line of its own, and it
 * is taken against the widest label it could ever carry — reserving against the
 * live one would let the count it names change the room it is given, and the two
 * would chase each other.
 *
 * `signature` carries everything that moves the wrap: the row's width, and every
 * label and count, since a pill grows by a digit when its count reaches ten.
 * Re-measuring means putting the folded genres back first, which is the one
 * render this returns null for.
 */
function useFirstLineFit(rowRef: RefObject<HTMLDivElement | null>, signature: string) {
  const [fit, setFit] = useState<number | null>(null);
  const measured = useRef<string | null>(null);

  useMeasureEffect(() => {
    const row = rowRef.current;
    if (!row || measured.current === signature) return;
    if (fit !== null) {
      setFit(null);
      return;
    }

    const pills = row.querySelectorAll<HTMLElement>(".pill-genre");
    if (pills.length === 0) return;

    measured.current = signature;
    /* A row with no width has no line to fill, so nothing measured here is true. */
    if (row.clientWidth === 0) {
      setFit(GENRE_PREVIEW_FALLBACK);
      return;
    }

    /* Whether they all already fit is the one question the flow itself answers,
       and if they do there is no disclosure to make room for. */
    const line = pills[0].offsetTop;
    let natural = 1;
    while (natural < pills.length && pills[natural].offsetTop === line) natural += 1;
    if (natural === pills.length) {
      setFit(natural);
      return;
    }

    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    const probe = row.querySelector<HTMLElement>(".pill-more-probe");
    const reserved = probe ? gap + probe.offsetWidth : 0;
    let used = 0;
    let count = 0;
    while (count < pills.length) {
      const next = used + (count > 0 ? gap : 0) + pills[count].offsetWidth;
      if (next + reserved > row.clientWidth) break;
      used = next;
      count += 1;
    }
    /* A line too narrow for even one genre and the disclosure still shows one;
       the disclosure wraps below it rather than the band coming up empty. */
    setFit(Math.max(count, 1));
  }, [fit, rowRef, signature]);

  return fit;
}

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
 * The seven moods lead, then the biggest genres fill a line of their own. Only
 * what runs past that line folds behind a disclosure, because a real watchlist
 * surfaces twenty of them and four rows of pills push the list itself off the
 * first screen. Filling the line exactly is what makes the genres a band rather
 * than a ragged block, and it takes measurement — see `useFirstLineFit`. A genre
 * already switched on stays out while collapsed, however far down it ranks, so
 * the row never hides a filter that is working.
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
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const moods = ready ? moodOptions(candidates, filters) : [];
  const visibleMoods = moods.filter((mood) => mood.count > 0 || mood.selected);
  const genres = ready ? genreOptions(candidates, filters) : [];

  /* The row is block-level, so its width answers to the page rather than to the
     pills inside it: watching it cannot feed back into itself. */
  useMeasureEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    setRowWidth(row.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  /* Genres start a fresh line, so only their own widths and the room they are
     given decide the fit — how the moods wrapped above cannot reach them. */
  const facetSignature = [rowWidth, ...genres.map((genre) => `${genre.label}${genre.count}`)].join("|");
  const fit = useFirstLineFit(rowRef, facetSignature);
  /* Null while the row is being measured, and every genre is out for that pass. */
  const genreLimit = showGenres || fit === null ? genres.length : fit;
  const visibleGenres = genres.filter((genre, index) => index < genreLimit || genre.selected);
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
        <div className="tonight-pills" ref={rowRef}>
          {ready ? (
            <>
              {visibleMoods.map((option) => <FacetPill key={option.key} onToggle={toggleFacet} option={option} />)}
              {/* Genres take a line of their own. Sharing one with the moods made
                  how many of them you saw a side effect of where the moods
                  happened to wrap — six at 1280px, two at 860px, five at 640px. */}
              {visibleMoods.length > 0 && visibleGenres.length > 0
                ? <span aria-hidden="true" className="pill-row-break" />
                : null}
              {visibleGenres.map((option) => (
                <FacetPill key={option.key} onToggle={toggleFacet} option={option} tone="genre" />
              ))}
              {/* Never seen and never in the flow: it carries the widest label the
                  disclosure could ever take, which is the width the genre line
                  holds back for it. */}
              {genres.length > 0 ? (
                <span aria-hidden="true" className="pill pill-more pill-more-probe">
                  {genres.length} more genres
                  <ChevronDown className="pill-chevron" size={14} />
                </span>
              ) : null}
              {/* Last in the row and flush right, so it closes what it governs
                  rather than sitting among the pills as one more facet. It drops
                  to the next line whenever the genres leave it no room, which is
                  most of the time — that is what filling the line costs. Nothing
                  is left to fold once every remaining genre is switched on. */}
              {showGenres || hiddenGenres > 0 ? (
                <button
                  aria-expanded={showGenres}
                  className="pill pill-more"
                  onClick={() => setShowGenres(!showGenres)}
                  type="button"
                >
                  {/* The number counts folded-away pills, not titles, so it is
                      spoken in the label rather than worn as the count badge
                      every facet pill carries. */}
                  {showGenres ? "Hide genres" : `${hiddenGenres} more ${hiddenGenres === 1 ? "genre" : "genres"}`}
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
