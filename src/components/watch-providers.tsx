"use client";

/* Provider logos are already sized at the TMDB CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import {
  RegionMark,
  RegionSelect,
  type WatchRegion,
  loadWatchRegions,
  regionName,
} from "@/components/region-select";
import { useRegion } from "@/components/region-provider";
import { friendlySearchLimitMessage, isRateLimitError, readApiJson } from "@/lib/api-response";
import { providerLogoUrl } from "@/lib/media-display";

type WatchProvider = { id: number; name: string; logoPath: string | null };

type TitleWatchProviders = {
  region: string;
  link: string | null;
  streaming: WatchProvider[];
  rentOrBuy: WatchProvider[];
};

/** One answer per country, from the single request that covers them all. */
type Answers = Record<string, TitleWatchProviders>;

type Result = { key: string; providers?: Answers; error?: string };

// Reopening a sheet should feel instant, so answers are kept for the tab's
// lifetime. The server holds the durable 12-hour cache.
const cache = new Map<string, Answers>();

export type WatchProviderItem = {
  externalId: number | null;
  mediaType: "movie" | "tv" | "other";
  provider: string;
};

function cacheKey(mediaType: string, tmdbId: number, regions: string[]) {
  return `${mediaType}:${tmdbId}:${regions.join(",")}`;
}

export function WatchProviders({ item }: { item: WatchProviderItem }) {
  const { regions } = useRegion();
  const tmdbId = item.externalId;
  const mediaType = item.mediaType;

  // Custom entries and "other" media have nothing on TMDB to look up.
  if (item.provider !== "tmdb" || tmdbId === null) return null;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  return (
    <section className="watch-providers">
      <h3>Where to watch</h3>
      {regions.length > 0
        ? <ProviderList mediaType={mediaType} regions={regions} tmdbId={tmdbId} />
        : <RegionPrompt />}
    </section>
  );
}

function RegionPrompt() {
  return (
    <div className="watch-providers-prompt">
      <p>Set your country to see where this streams. You can change this later in Settings.</p>
      <RegionSelect saveLabel="Set country" />
    </div>
  );
}

function ProviderList({
  mediaType,
  regions,
  tmdbId,
}: {
  mediaType: "movie" | "tv";
  regions: string[];
  tmdbId: number;
}) {
  const key = cacheKey(mediaType, tmdbId, regions);
  // The result carries the key it belongs to, so switching titles or countries
  // falls back to the skeleton during render rather than through a setState.
  const [result, setResult] = useState<Result | null>(null);
  const [countries, setCountries] = useState<WatchRegion[]>([]);

  const current = cache.has(key) ? { key, providers: cache.get(key) } : result?.key === key ? result : null;

  useEffect(() => {
    let active = true;
    loadWatchRegions()
      .then((list) => { if (active) setCountries(list); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (cache.has(key)) return;

    const controller = new AbortController();
    /* One request covers every country: TMDB answers for all of them at once. */
    const params = new URLSearchParams({
      mediaType,
      regions: regions.join(","),
      tmdbId: String(tmdbId),
    });

    fetch(`/api/watch-providers?${params}`, { cache: "no-store", signal: controller.signal })
      .then((response) => readApiJson<{ providers: Answers }>(response))
      .then((data) => {
        cache.set(key, data.providers);
        setResult({ key, providers: data.providers });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          error: isRateLimitError(caught)
            ? friendlySearchLimitMessage(caught.reason)
            : caught instanceof Error ? caught.message : "Streaming data is unavailable right now.",
        });
      });

    return () => controller.abort();
  }, [key, mediaType, regions, tmdbId]);

  if (current?.error) return <p className="watch-providers-note">{current.error}</p>;

  const providers = current?.providers;

  if (!providers) {
    return (
      <div aria-hidden="true" className="watch-provider-skeleton">
        <span /><span /><span />
      </div>
    );
  }

  return (
    <div className="watch-regions">
      {regions.map((region) => (
        <RegionAvailability
          country={regionName(countries, region)}
          key={region}
          providers={providers[region]}
          region={region}
          /* With one country the heading would only repeat the setting. */
          showCountry={regions.length > 1}
        />
      ))}
    </div>
  );
}

function RegionAvailability({
  country,
  providers,
  region,
  showCountry,
}: {
  country: string;
  providers: TitleWatchProviders | undefined;
  region: string;
  showCountry: boolean;
}) {
  const streaming = providers?.streaming ?? [];
  const rentOrBuy = providers?.rentOrBuy ?? [];
  const link = providers?.link ?? null;

  return (
    <div className="watch-region">
      {showCountry ? (
        <h4><RegionMark code={region} /> {country}</h4>
      ) : null}

      {streaming.length === 0 && rentOrBuy.length === 0 ? (
        <p className="watch-providers-note">Not available to stream in {country} right now.</p>
      ) : (
        <>
          {streaming.length > 0 ? (
            <ProviderRow providers={streaming} />
          ) : (
            <p className="watch-providers-note">No subscription service has this in {country}.</p>
          )}

          {rentOrBuy.length > 0 ? (
            <p className="watch-providers-secondary">
              Also available to rent or buy: {rentOrBuy.map((provider) => provider.name).join(", ")}.
            </p>
          ) : null}

          {/* TMDB's terms require crediting JustWatch on the item itself. */}
          <p className="watch-providers-attribution">
            Streaming data by JustWatch{" · "}
            {link ? (
              <a href={link} rel="noreferrer" target="_blank">
                All options in {country} <ExternalLink aria-hidden="true" size={12} />
              </a>
            ) : country}
          </p>
        </>
      )}
    </div>
  );
}

function ProviderRow({ providers }: { providers: WatchProvider[] }) {
  return (
    <ul className="watch-provider-list">
      {providers.map((provider) => {
        const logo = providerLogoUrl(provider.logoPath);
        return (
          <li key={provider.id}>
            {logo ? <img alt="" className="watch-provider-logo" src={logo} /> : null}
            <span>{provider.name}</span>
          </li>
        );
      })}
    </ul>
  );
}
