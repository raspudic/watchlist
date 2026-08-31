"use client";

/* TMDB poster and provider URLs are already sized at the CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, Clapperboard, Pin, Popcorn, Shuffle, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useLibraryCacheScope } from "@/components/library-cache-provider";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyInline, EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InlineMessage } from "@/components/ui/inline-message";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { readApiJson } from "@/lib/api-response";
import { type MediaItem, upsertCachedLibraryItem } from "@/lib/library-cache";
import { mediaLabel, posterUrl, providerLogoUrl } from "@/lib/media-display";
import {
  type FacetOption,
  type MediaTypeFilter,
  type RuntimeFilter,
  type ServiceFilter,
  type TonightCandidate,
  type TonightFilters,
  type TonightResponse,
  type TonightSort,
  genreOptions,
  mediaTypeCounts,
  moodOptions,
  narrowCandidates,
  pickCandidate,
  readTonightFilters,
  rememberPick,
  sortCandidates,
  tonightFilterQuery,
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

function runtimeLabel(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function candidateMeta(candidate: TonightCandidate) {
  return [
    candidate.item.releaseYear,
    mediaLabel(candidate.item.mediaType),
    runtimeLabel(candidate.runtimeMinutes),
  ].filter(Boolean).join(" · ");
}

export function TonightView() {
  const cacheScope = useLibraryCacheScope();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<TonightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /* The query string is the source of truth on arrival, so a shared or reloaded
     link opens on the same shortlist. */
  const [filters, setFilters] = useState<TonightFilters>(
    () => readTonightFilters(new URLSearchParams(searchParams.toString())),
  );
  const [showGenres, setShowGenres] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [pinningId, setPinningId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/tonight", { cache: "no-store", credentials: "same-origin" })
      .then((response) => readApiJson<TonightResponse>(response))
      .then((response) => {
        if (!active) return;
        setData(response);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load your watchlist.");
        setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const updateFilters = useCallback((next: TonightFilters) => {
    setFilters(next);
    const query = tonightFilterQuery(next);
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [pathname]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const selectedProviderIds = useMemo(() => data?.selectedProviderIds ?? [], [data]);
  /* Without a country or any saved services, "my services" would filter on
     nothing, so the control disappears and everything is shown instead. */
  const canFilterByServices = Boolean(data?.region) && selectedProviderIds.length > 0;
  const active = useMemo<TonightFilters>(
    () => ({ ...filters, services: canFilterByServices ? filters.services : "all" }),
    [canFilterByServices, filters],
  );

  const narrowed = useMemo(
    () => sortCandidates(narrowCandidates(candidates, active, selectedProviderIds), active.sort),
    [active, candidates, selectedProviderIds],
  );
  const moods = moodOptions(candidates, active, selectedProviderIds);
  const genres = genreOptions(candidates, active, selectedProviderIds);
  const counts = mediaTypeCounts(candidates, active, selectedProviderIds);
  const unchecked = candidates.filter((candidate) => candidate.availabilityCheckedAt === null).length;
  const picked = narrowed.find((candidate) => candidate.item.id === pickedId) ?? null;
  const visibleGenres = showGenres ? genres : genres.filter((genre) => genre.selected);

  function toggleFacet(key: string) {
    const facets = filters.facets.includes(key)
      ? filters.facets.filter((facet) => facet !== key)
      : [...filters.facets, key];
    updateFilters({ ...filters, facets });
  }

  function pick() {
    const choice = pickCandidate(narrowed, {
      now: Date.now(),
      random: Math.random,
      recentIds,
    });
    if (!choice) return;
    setPickedId(choice.item.id);
    setRecentIds((current) => rememberPick(current, choice.item.id));
  }

  async function togglePin(candidate: TonightCandidate) {
    const pinned = Boolean(candidate.item.pinnedAt);
    setPinningId(candidate.item.id);
    setError("");

    try {
      const response = await readApiJson<{ item: MediaItem }>(
        await fetch(`/api/items/${candidate.item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !pinned }),
        }),
      );
      upsertCachedLibraryItem(cacheScope, response.item);
      setData((current) => current && {
        ...current,
        candidates: current.candidates.map((entry) => entry.item.id === response.item.id
          ? { ...entry, item: response.item }
          : entry),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that pin.");
    } finally {
      setPinningId(null);
    }
  }

  return (
    <div className="library-page tonight-page">
      <header className="library-header">
        <div>
          <h1>Tonight</h1>
          <p className="library-subtitle">Something to watch, from what you already saved.</p>
        </div>
        {candidates.length > 0 ? (
          <Button disabled={narrowed.length === 0} onClick={pick}>
            <Shuffle aria-hidden="true" size={17} /> Pick for me
          </Button>
        ) : null}
      </header>

      {error ? <InlineMessage onDismiss={() => setError("")}>{error}</InlineMessage> : null}

      {loading ? <LoadingRows /> : null}

      {!loading && candidates.length === 0 && !error ? (
        <EmptyState
          actions={<Button render={<Link href="/watchlist" />}>Go to your watchlist</Button>}
          description="Save a few movies or shows and this page will pick one for you."
          icon={<Popcorn size={24} />}
          title="Nothing to pick from yet"
        />
      ) : null}

      {!loading && candidates.length > 0 ? (
        <>
          {!canFilterByServices ? (
            <div className="tonight-setup">
              <p>
                {data?.region
                  ? "Choose the services you subscribe to and Tonight can show what is included with them."
                  : "Set your country and streaming services and Tonight can show what is included with them."}
              </p>
              <Button render={<Link href="/settings" />} size="sm" variant="quiet">Open settings</Button>
            </div>
          ) : null}

          <FilterTabs
            items={[
              { count: counts.all, label: "All", value: "all" },
              { count: counts.movie, label: "Movies", value: "movie" },
              { count: counts.tv, label: "Series", value: "tv" },
            ]}
            label="Filter titles"
            onValueChange={(mediaType: MediaTypeFilter) => updateFilters({ ...filters, mediaType })}
            trailing={canFilterByServices ? (
              <SegmentedControl<ServiceFilter>
                items={[
                  { label: "My services", value: "mine" },
                  { label: "Everything", value: "all" },
                ]}
                label="Limit to your streaming services"
                onValueChange={(next) => { if (next) updateFilters({ ...filters, services: next }); }}
                value={active.services}
              />
            ) : null}
            value={active.mediaType}
          >
            <div className="tonight-pills">
              {moods.map((option) => <FacetPill key={option.key} onToggle={toggleFacet} option={option} />)}
              {visibleGenres.map((option) => (
                <FacetPill key={option.key} onToggle={toggleFacet} option={option} tone="genre" />
              ))}
              {genres.length > 0 ? (
                <button
                  aria-expanded={showGenres}
                  className="pill pill-more"
                  onClick={() => setShowGenres((current) => !current)}
                  type="button"
                >
                  Genres
                  <ChevronDown aria-hidden="true" className={showGenres ? "pill-chevron open" : "pill-chevron"} size={14} />
                </button>
              ) : null}
            </div>

            <div className="tonight-refine">
              <p aria-live="polite" className="tonight-summary">
                {narrowed.length} {narrowed.length === 1 ? "title" : "titles"}
                {active.services === "mine" && unchecked > 0
                  ? ` · ${unchecked} not checked for streaming yet`
                  : ""}
              </p>
              <div className="tonight-selects">
                <label>
                  <span>Length</span>
                  <select
                    className="field-control tonight-select"
                    onChange={(event) => updateFilters({ ...filters, runtime: event.target.value as RuntimeFilter })}
                    value={active.runtime}
                  >
                    {RUNTIME_LABELS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Sort</span>
                  <select
                    className="field-control tonight-select"
                    onChange={(event) => updateFilters({ ...filters, sort: event.target.value as TonightSort })}
                    value={active.sort}
                  >
                    {SORT_LABELS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div aria-live="polite" className="tonight-pick-region">
              {picked ? (
                <PickCard
                  candidate={picked}
                  canRepick={narrowed.length > 1}
                  onPickAgain={pick}
                  onTogglePin={togglePin}
                  pinning={pinningId === picked.item.id}
                />
              ) : null}
            </div>

            {narrowed.length === 0 ? (
              <EmptyInline>
                {active.services === "mine"
                  ? "Nothing here is on your services yet."
                  : "Nothing matches those filters."}
                {active.services === "mine" ? (
                  <Button
                    onClick={() => updateFilters({ ...filters, services: "all" })}
                    size="sm"
                    variant="quiet"
                  >
                    Show everything
                  </Button>
                ) : null}
              </EmptyInline>
            ) : (
              <section aria-label="Titles to watch" className="media-section">
                <div className="tonight-list">
                  {narrowed.map((candidate) => (
                    <TonightRow
                      candidate={candidate}
                      key={candidate.item.id}
                      onTogglePin={togglePin}
                      pinning={pinningId === candidate.item.id}
                      showAvailability={Boolean(data?.region)}
                    />
                  ))}
                </div>
              </section>
            )}
          </FilterTabs>
        </>
      ) : null}
    </div>
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
      /* A pill that would empty the list is shown but not clickable: the count
         is the answer to "why not", so hiding it would say less. */
      disabled={option.count === 0 && !option.selected}
      onClick={() => onToggle(option.key)}
      type="button"
    >
      {option.label}
      <span className="pill-count">{option.count}</span>
    </button>
  );
}

function PinButton({
  candidate,
  onTogglePin,
  pinning,
}: {
  candidate: TonightCandidate;
  onTogglePin: (candidate: TonightCandidate) => void;
  pinning: boolean;
}) {
  const pinned = Boolean(candidate.item.pinnedAt);

  return (
    <IconButton
      aria-pressed={pinned}
      className={pinned ? "pin-button pinned" : "pin-button"}
      label={pinned ? `Unpin ${candidate.item.title}` : `Pin ${candidate.item.title} for tonight`}
      loading={pinning}
      onClick={() => onTogglePin(candidate)}
    >
      <Pin aria-hidden="true" fill={pinned ? "currentColor" : "none"} size={16} />
    </IconButton>
  );
}

function ProviderChips({ providers }: { providers: TonightCandidate["streaming"] }) {
  const shown = providers.slice(0, 3);

  return (
    <ul className="tonight-services">
      {shown.map((provider) => {
        const logo = providerLogoUrl(provider.logoPath, "w45");
        return (
          <li key={provider.id}>
            {logo ? <img alt="" src={logo} /> : null}
            {provider.name}
          </li>
        );
      })}
      {providers.length > shown.length ? <li className="tonight-services-more">+{providers.length - shown.length}</li> : null}
    </ul>
  );
}

function AvailabilityLine({ candidate }: { candidate: TonightCandidate }) {
  if (candidate.streaming.length > 0) return <ProviderChips providers={candidate.streaming} />;
  return (
    <p className="tonight-availability">
      {candidate.availabilityCheckedAt === null
        ? "Streaming not checked yet"
        : "Not included with a subscription"}
    </p>
  );
}

/* The card is a plain container: the link and the pin sit side by side rather
   than nested, so both stay reachable by keyboard and screen reader. */
function TonightRow({
  candidate,
  onTogglePin,
  pinning,
  showAvailability,
}: {
  candidate: TonightCandidate;
  onTogglePin: (candidate: TonightCandidate) => void;
  pinning: boolean;
  showAvailability: boolean;
}) {
  const poster = posterUrl(candidate.item.posterPath);

  return (
    <div className={candidate.item.pinnedAt ? "tonight-row pinned" : "tonight-row"}>
      {poster
        ? <img alt="" className="row-poster" src={poster} />
        : <span className="row-poster placeholder"><Clapperboard size={22} /></span>}
      <div className="tonight-row-content">
        <Link className="tonight-row-link" href={`/watchlist?item=${candidate.item.id}`}>
          <span>{candidate.item.title}</span>
        </Link>
        <p className="row-meta">
          {candidateMeta(candidate)}
          {candidate.voteAverage ? (
            <span className="tonight-score"><Star aria-hidden="true" size={12} /> {candidate.voteAverage.toFixed(1)}</span>
          ) : null}
        </p>
        {showAvailability ? <AvailabilityLine candidate={candidate} /> : null}
      </div>
      <PinButton candidate={candidate} onTogglePin={onTogglePin} pinning={pinning} />
    </div>
  );
}

function PickCard({
  candidate,
  canRepick,
  onPickAgain,
  onTogglePin,
  pinning,
}: {
  candidate: TonightCandidate;
  canRepick: boolean;
  onPickAgain: () => void;
  onTogglePin: (candidate: TonightCandidate) => void;
  pinning: boolean;
}) {
  const poster = posterUrl(candidate.item.posterPath, "w342");

  return (
    <section aria-label="Your pick" className="tonight-pick">
      {poster
        ? <img alt="" className="tonight-pick-poster" src={poster} />
        : <span className="tonight-pick-poster placeholder"><Clapperboard size={28} /></span>}
      <div className="tonight-pick-copy">
        <h2>{candidate.item.title}</h2>
        <p className="row-meta">{candidateMeta(candidate)}</p>
        {candidate.streaming.length > 0 ? <ProviderChips providers={candidate.streaming} /> : null}
        <div className="tonight-pick-actions">
          <Button render={<Link href={`/watchlist?item=${candidate.item.id}`} />} size="sm">View details</Button>
          {canRepick ? (
            <Button onClick={onPickAgain} size="sm" variant="quiet">
              <Shuffle aria-hidden="true" size={15} /> Pick again
            </Button>
          ) : null}
          <PinButton candidate={candidate} onTogglePin={onTogglePin} pinning={pinning} />
        </div>
      </div>
    </section>
  );
}

function LoadingRows() {
  return (
    <div aria-label="Loading titles" className="media-section tonight-list">
      {[0, 1, 2].map((value) => <div className="row-skeleton" key={value}><span /><div><i /><i /></div></div>)}
    </div>
  );
}
